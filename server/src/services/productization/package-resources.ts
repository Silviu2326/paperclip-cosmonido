import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createLeadFormSchema, createPlaybookSchema } from "@paperclipai/shared";
import {
  leadForms,
  playbooks,
  productizationBrandPresets as brandPresetsTable,
  productizationPackageInstallationItems as itemsTable,
  productizationRequestTemplates as requestTemplatesTable,
  type Db,
  type RequestTemplatePlaybookRef,
} from "@paperclipai/db";
import {
  isPackageResourceKind,
  packageResourceItemReviewSchema,
  type PackageResourceItemReview,
  type PackageResourceKind,
  type PackageResourcePlanEntry,
  type PackageResourceResult,
  type PortablePackage,
} from "@paperclipai/shared/productization/portable-package";
import { HttpError, conflict, notFound, unprocessable } from "../../errors.js";
import { leadFormService, normalizeLeadFormFields, normalizeLeadFormSettings } from "../leads/lead-forms.js";
import { playbookService } from "../playbooks.js";

/**
 * Resource installer for portable packages: playbooks, lead forms, brand presets and request templates.
 *
 * Safety model
 * - Everything is created as a draft / unpublished row. Nothing is published, sent, connected, started or
 *   granted autonomy (every playbook step is pinned to `draft_only`).
 * - What is created is pinned in the receipt item when the receipt is written (`payload`, source hash,
 *   deterministic domain identity). Install time never re-derives it.
 * - The claim is a conditional UPDATE (`planned` → `creating`) committed before the domain write. The domain
 *   write is keyed by a unique identity (playbook key+version, lead form slug, preset/template key); after a
 *   crash the item is resumed by looking up that identity and requiring persisted receipt provenance.
 * - Every domain draft carries the receipt item's immutable id and source hash. Recovery links only that
 *   exact provenance; matching content, identity, and timestamps alone never prove ownership.
 */

type ItemRow = typeof itemsTable.$inferSelect;
type Writer = Pick<Db, "update" | "select">;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const roundtrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const resourceLocalKey = (kind: PackageResourceKind, localId: string) => `${kind}/${localId}`;

/* ------------------------------------------------------------------------- */
/* Pure planning: mapping package resources onto the domain contracts          */
/* ------------------------------------------------------------------------- */

/**
 * `pk-<8 hex of sha256(packageKey@packageVersion)>-<localId>`. Valid as a playbook key, a lead form slug and a
 * preset/template key. Each package version has its own identities, so installing a new version never
 * collides with (or silently updates) what an earlier version created.
 */
export function resourceDomainIdentity(pkg: Pick<PortablePackage, "packageKey" | "packageVersion">, localId: string): string {
  const prefix = sha256(`${pkg.packageKey}@${pkg.packageVersion}`).slice(0, 8);
  const normalized = localId.replace(/-{2,}/g, "-").replace(/-+$/g, "");
  return `pk-${prefix}-${normalized}`;
}

interface Mapped {
  title: string;
  source: unknown;
  payload: Record<string, unknown> | null;
  blockers: string[];
  notRepresented: string[];
  deps: Array<{ kind: PackageResourceKind; localId: string }>;
}

const brandPresetPayloadSchema = z.object({
  presetKey: z.string().min(1).max(120),
  name: z.string().min(1).max(240),
  voice: z.string().min(1).max(4_000),
  audience: z.string().min(1).max(4_000),
  preferredTerms: z.array(z.string()).max(100),
  avoidedTerms: z.array(z.string()).max(100),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
}).strict();

const requestTemplatePayloadSchema = z.object({
  templateKey: z.string().min(1).max(120),
  name: z.string().min(1).max(240),
  outcome: z.string().min(1).max(4_000),
  acceptanceCriteria: z.array(z.string()).min(1).max(40),
  expectedDeliverable: z.string().min(1).max(240),
  suggestedPlaybooks: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("installed"), playbookKey: z.string().min(1).max(120) }).strict(),
    z.object({ kind: z.literal("catalog"), key: z.string().min(1).max(128), version: z.string().min(1).max(64) }).strict(),
  ])).max(40),
}).strict();

const PLAYBOOK_CHANNEL = { email: "email", phone: "call", messaging: "chat", meeting: "internal", internal: "internal" } as const;

function issueBlockers(label: string, error: z.ZodError): string[] {
  // Paths only: issue messages can quote input, and package text must not be echoed into plans.
  return error.issues.slice(0, 5).map((issue) => `${label}: valor no válido en ${issue.path.join(".") || "(raíz)"}.`);
}

function mapPlaybook(pkg: PortablePackage, source: PortablePackage["playbooks"][number]): Mapped {
  const blockers: string[] = [];
  const deps: Mapped["deps"] = [];
  const steps = source.steps.map((step) => {
    let templateKey: string | null = null;
    if (step.templateRefs.length > 1) {
      blockers.push(`El paso ${step.id} referencia ${step.templateRefs.length} plantillas; un paso del playbook admite una sola.`);
    } else if (step.templateRefs[0]) {
      deps.push({ kind: "request_template", localId: step.templateRefs[0].id });
      templateKey = resourceDomainIdentity(pkg, step.templateRefs[0].id);
    }
    return {
      key: step.id,
      kind: step.channel === "meeting" ? "book" : step.channel === "internal" ? "qualify" : "follow_up",
      title: step.title,
      channel: PLAYBOOK_CHANNEL[step.channel],
      delayHours: step.waitDays > 0 ? step.waitDays * 24 : null,
      templateKey,
      autonomy: "draft_only" as const,
      instructions: step.guidance,
    };
  });
  const identity = resourceDomainIdentity(pkg, source.id);
  const parsed = createPlaybookSchema.safeParse({
    key: identity,
    name: source.name,
    description: source.description,
    scopeKind: "lead_type",
    scopeValue: null,
    steps,
  });
  if (!parsed.success) blockers.push(...issueBlockers("Playbook", parsed.error));
  return {
    title: source.name,
    source,
    payload: parsed.success ? roundtrip(parsed.data) as Record<string, unknown> : null,
    blockers,
    notRepresented: [
      "El tipo de paso se infiere del canal (correo, teléfono y mensajería → seguimiento; reunión → reservar; interno → cualificar).",
      "La autonomía queda en «solo borrador» en todos los pasos; la concede una persona después.",
      "El ámbito (tipo de lead) queda sin definir; fíjalo antes de publicar el borrador.",
      "Los días de espera se interpretan como espera previa al paso.",
    ],
    deps,
  };
}

function mapRequestTemplate(pkg: PortablePackage, source: PortablePackage["requestTemplates"][number]): Mapped {
  const deps: Mapped["deps"] = [];
  const notRepresented: string[] = [];
  const suggestedPlaybooks: RequestTemplatePlaybookRef[] = source.suggestedPlaybookRefs.map((ref) => {
    if (ref.kind === "local") {
      deps.push({ kind: "playbook", localId: ref.id });
      return { kind: "installed" as const, playbookKey: resourceDomainIdentity(pkg, ref.id) };
    }
    notRepresented.push(`El playbook de catálogo ${ref.key}@${ref.version} se guarda solo como referencia de texto; no se instala.`);
    return { kind: "catalog" as const, key: ref.key, version: ref.version };
  });
  const parsed = requestTemplatePayloadSchema.safeParse({
    templateKey: resourceDomainIdentity(pkg, source.id),
    name: source.name,
    outcome: source.outcome,
    acceptanceCriteria: source.acceptanceCriteria,
    expectedDeliverable: source.expectedDeliverable,
    suggestedPlaybooks,
  });
  notRepresented.push("Queda como borrador: no crea encargos ni inicia playbooks por sí sola.");
  return {
    title: source.name,
    source,
    payload: parsed.success ? parsed.data : null,
    blockers: parsed.success ? [] : issueBlockers("Plantilla de encargo", parsed.error),
    notRepresented,
    deps,
  };
}

function mapBrandPreset(pkg: PortablePackage, source: PortablePackage["brandPresets"][number]): Mapped {
  const parsed = brandPresetPayloadSchema.safeParse({
    presetKey: resourceDomainIdentity(pkg, source.id),
    name: source.name,
    voice: source.voice,
    audience: source.audience,
    preferredTerms: source.preferredTerms,
    avoidedTerms: source.avoidedTerms,
    primaryColor: source.primaryColor ?? null,
    accentColor: source.accentColor ?? null,
  });
  return {
    title: source.name,
    source,
    payload: parsed.success ? parsed.data : null,
    blockers: parsed.success ? [] : issueBlockers("Preset de marca", parsed.error),
    notRepresented: ["Se guarda como borrador inerte: no se aplica al negocio, a los medios ni a ningún envío hasta que una persona lo active."],
    deps: [],
  };
}

function mapLeadForm(pkg: PortablePackage, source: PortablePackage["forms"][number]): Mapped {
  const blockers: string[] = [];
  const keys = new Map<string, string>();
  const bind = (key: string, fieldId: string) => {
    if (keys.has(key)) blockers.push(`Los campos ${keys.get(key)} y ${fieldId} corresponden al mismo campo (${key}) del formulario de captación.`);
    else keys.set(key, fieldId);
  };
  const required = new Map<string, boolean>();
  for (const field of source.fields) {
    let key: string | null = null;
    if (field.type === "email") key = "email";
    else if (field.type === "phone") key = "phone";
    else if (field.type === "long_text") key = "message";
    else if (field.type === "text" && field.id === "name") key = "name";
    else if (field.type === "text" && field.id === "company") key = "company";
    if (!key) {
      blockers.push(`El campo ${field.id} (${field.type}) no tiene equivalente: el formulario de captación solo admite nombre, correo, teléfono, empresa, mensaje y consentimiento.`);
      continue;
    }
    bind(key, field.id);
    required.set(key, field.required);
  }
  if (required.has("name") && required.get("name") === false) blockers.push("El nombre es siempre obligatorio en el formulario de captación y el paquete lo declara opcional.");
  for (const key of ["company", "message"]) {
    if (required.get(key) === true) blockers.push(`El campo ${key} no puede ser obligatorio en el formulario de captación y el paquete lo declara obligatorio.`);
  }
  const hasEmail = required.has("email");
  const hasPhone = required.has("phone");
  if (!hasEmail && !hasPhone) blockers.push("El formulario necesita un campo de correo o de teléfono para poder contactar al lead.");
  if (hasEmail && hasPhone && (required.get("email") || required.get("phone"))) {
    blockers.push("Con correo y teléfono, el formulario de captación exige uno de los dos; el paquete declara alguno como obligatorio por separado.");
  }
  if ((hasEmail !== hasPhone) && (hasEmail ? required.get("email") : required.get("phone")) === false) {
    blockers.push("Con un único campo de contacto, el formulario de captación lo exige; el paquete lo declara opcional.");
  }
  if (source.name.length > 120) blockers.push("El nombre del formulario supera los 120 caracteres admitidos.");

  const fields = ["name", "email", "phone", "company", "message"].filter((key) => key === "name" || keys.has(key));
  const identity = resourceDomainIdentity(pkg, source.id);
  const parsed = createLeadFormSchema.safeParse({
    name: source.name,
    slug: identity,
    fields,
    settings: { sourceLabel: pkg.packageKey.slice(0, 80), consentText: null },
  });
  if (!parsed.success) blockers.push(...issueBlockers("Formulario", parsed.error));
  const notRepresented = [
    `Las etiquetas${source.fields.some((field) => field.helpText) ? " y los textos de ayuda" : ""} de los campos no se guardan: el formulario de captación usa campos fijos.`,
    "Sin texto de consentimiento: configúralo antes de publicar si recoges datos personales.",
    "Queda sin publicar: no tiene URL pública activa hasta que una persona lo publique.",
  ];
  if (!keys.has("name")) notRepresented.push("El campo nombre se añade siempre (obligatorio).");
  return {
    title: source.name,
    source,
    payload: parsed.success ? roundtrip(parsed.data) as Record<string, unknown> : null,
    blockers,
    notRepresented,
    deps: [],
  };
}

function mapAll(pkg: PortablePackage): Array<{ kind: PackageResourceKind; localId: string; mapped: Mapped }> {
  return [
    ...pkg.playbooks.map((source) => ({ kind: "playbook" as const, localId: source.id, mapped: mapPlaybook(pkg, source) })),
    ...pkg.forms.map((source) => ({ kind: "lead_form" as const, localId: source.id, mapped: mapLeadForm(pkg, source) })),
    ...pkg.brandPresets.map((source) => ({ kind: "brand_preset" as const, localId: source.id, mapped: mapBrandPreset(pkg, source) })),
    ...pkg.requestTemplates.map((source) => ({ kind: "request_template" as const, localId: source.id, mapped: mapRequestTemplate(pkg, source) })),
  ];
}

export interface PlannedResource {
  entry: PackageResourcePlanEntry;
  /** Present only when the resource can be installed; it is the snapshot pinned into the receipt item. */
  review: PackageResourceItemReview | null;
}

/**
 * Deterministic plan for every resource of the package. A resource that cannot be represented faithfully
 * (or depends on one that cannot) is listed with its blockers and `installable: false`; nothing is dropped.
 */
export function planPackageResources(
  pkg: PortablePackage,
  packageContentHash: string,
  /** `<kind>/<domainIdentity>` of identities that already exist in the company; those resources are blocked. */
  occupied: ReadonlySet<string> = new Set(),
): PlannedResource[] {
  const mapped = mapAll(pkg);
  const byKey = new Map(mapped.map((item) => [resourceLocalKey(item.kind, item.localId), item]));
  for (const item of mapped) {
    if (occupied.has(resourceLocalKey(item.kind, resourceDomainIdentity(pkg, item.localId)))) {
      item.mapped.blockers.push("Ya existe un recurso de la empresa con la identidad de destino de este recurso; no se instala encima.");
    }
  }

  // Two local ids that normalise to the same identity would collide in the target.
  const seenIdentity = new Map<string, string>();
  for (const item of mapped) {
    const identity = resourceDomainIdentity(pkg, item.localId);
    const slot = `${item.kind}:${identity}`;
    const previous = seenIdentity.get(slot);
    if (previous) item.mapped.blockers.push(`La identidad de destino coincide con la del recurso ${previous}.`);
    else seenIdentity.set(slot, item.localId);
  }

  // Propagate: a resource whose dependency cannot be installed cannot be installed either.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of mapped) {
      for (const dep of item.mapped.deps) {
        const target = byKey.get(resourceLocalKey(dep.kind, dep.localId));
        const message = `Depende de ${dep.kind}/${dep.localId}, que no se puede instalar.`;
        if ((!target || target.mapped.blockers.length > 0) && !item.mapped.blockers.includes(message)) {
          item.mapped.blockers.push(message);
          changed = true;
        }
      }
    }
  }

  return mapped.map(({ kind, localId, mapped: item }) => {
    const domainIdentity = resourceDomainIdentity(pkg, localId);
    const installable = item.blockers.length === 0 && item.payload !== null;
    const entry: PackageResourcePlanEntry = {
      kind,
      localId,
      title: item.title,
      domainIdentity,
      installable,
      blockers: item.blockers,
      notRepresented: item.notRepresented,
      dependsOn: item.deps,
    };
    const review: PackageResourceItemReview | null = installable
      ? {
        resourceKind: kind,
        localId,
        title: item.title.slice(0, 240),
        packageKey: pkg.packageKey,
        packageVersion: pkg.packageVersion,
        packageContentHash,
        sourceContentHash: sha256(stableJson(item.source)),
        domainIdentity,
        payload: item.payload!,
        references: item.deps.map((dep) => ({ kind: dep.kind, localId: dep.localId, domainIdentity: resourceDomainIdentity(pkg, dep.localId) })),
        notRepresented: item.notRepresented.map((text) => text.slice(0, 240)),
      }
      : null;
    return { entry, review };
  });
}

/* ------------------------------------------------------------------------- */
/* Identity occupancy (read-only)                                             */
/* ------------------------------------------------------------------------- */

/** Identities that already exist in the company's domain tables, so a resource cannot be installed over them. */
export async function findOccupiedIdentities(
  db: Db,
  companyId: string,
  identities: Array<{ kind: PackageResourceKind; domainIdentity: string }>,
): Promise<Set<string>> {
  const occupied = new Set<string>();
  const wanted = (kind: PackageResourceKind) => identities.filter((entry) => entry.kind === kind).map((entry) => entry.domainIdentity);
  const playbookKeys = wanted("playbook");
  if (playbookKeys.length > 0) {
    const rows = await db.select({ key: playbooks.key }).from(playbooks)
      .where(and(eq(playbooks.companyId, companyId), inArray(playbooks.key, playbookKeys)));
    rows.forEach((row) => occupied.add(resourceLocalKey("playbook", row.key)));
  }
  const slugs = wanted("lead_form");
  if (slugs.length > 0) {
    const rows = await db.select({ slug: leadForms.slug }).from(leadForms)
      .where(and(eq(leadForms.companyId, companyId), inArray(leadForms.slug, slugs)));
    rows.forEach((row) => occupied.add(resourceLocalKey("lead_form", row.slug)));
  }
  const presetKeys = wanted("brand_preset");
  if (presetKeys.length > 0) {
    const rows = await db.select({ key: brandPresetsTable.presetKey }).from(brandPresetsTable)
      .where(and(eq(brandPresetsTable.companyId, companyId), inArray(brandPresetsTable.presetKey, presetKeys)));
    rows.forEach((row) => occupied.add(resourceLocalKey("brand_preset", row.key)));
  }
  const templateKeys = wanted("request_template");
  if (templateKeys.length > 0) {
    const rows = await db.select({ key: requestTemplatesTable.templateKey }).from(requestTemplatesTable)
      .where(and(eq(requestTemplatesTable.companyId, companyId), inArray(requestTemplatesTable.templateKey, templateKeys)));
    rows.forEach((row) => occupied.add(resourceLocalKey("request_template", row.key)));
  }
  return occupied;
}

/* ------------------------------------------------------------------------- */
/* Installation: claim → domain write → durable result mapping                */
/* ------------------------------------------------------------------------- */

type Ensure =
  | { kind: "linked"; result: PackageResourceResult; finalized: boolean }
  | { kind: "conflict"; reason: string; finalized: boolean }
  | { kind: "absent" };

const isConflictError = (error: unknown) => error instanceof HttpError && error.status === 409;

function parseReview(item: ItemRow): PackageResourceItemReview {
  const parsed = packageResourceItemReviewSchema.safeParse(item.review);
  if (!parsed.success) {
    throw unprocessable("The pinned resource snapshot is not valid.", { code: "package_resource_snapshot_invalid" });
  }
  return parsed.data;
}

async function finalize(writer: Writer, item: ItemRow, values: Partial<typeof itemsTable.$inferInsert>): Promise<ItemRow | null> {
  const [row] = await writer.update(itemsTable).set({ ...values, updatedAt: new Date() })
    .where(and(eq(itemsTable.id, item.id), eq(itemsTable.companyId, item.companyId), eq(itemsTable.status, "creating")))
    .returning();
  return row ?? null;
}

const linkedValues = (result: PackageResourceResult) => ({
  status: "created" as const,
  resourceId: result.resourceId,
  result,
  resolvedAt: new Date(),
  note: null,
});

async function ensurePlaybook(db: Db, item: ItemRow, review: PackageResourceItemReview, userId: string | null, allowCreate: boolean): Promise<Ensure> {
  const payload = createPlaybookSchema.safeParse(review.payload);
  if (!payload.success) throw unprocessable("The pinned playbook is not valid.", { code: "package_resource_snapshot_invalid" });
  const lookup = async () => {
    const [row] = await db.select().from(playbooks).where(and(
      eq(playbooks.companyId, item.companyId),
      eq(playbooks.key, review.domainIdentity),
      eq(playbooks.version, 1),
    )).limit(1);
    return row ?? null;
  };
  let row = await lookup();
  let createdNow = false;
  if (!row) {
    if (!allowCreate) return { kind: "absent" };
    try {
      row = await playbookService(db).create(item.companyId, payload.data, { userId }, { itemId: item.id, sourceContentHash: review.sourceContentHash });
      createdNow = true;
    } catch (error) {
      if (!isConflictError(error)) throw error;
      row = await lookup();
      if (!row) throw error;
    }
  }
  if (!createdNow) {
    const matches = row.installationItemId === item.id
      && row.installationSourceContentHash === review.sourceContentHash
      && row.status === "draft"
      && row.name === payload.data.name
      && (row.description ?? null) === (payload.data.description ?? null)
      && row.scopeKind === payload.data.scopeKind
      && (row.scopeValue ?? null) === (payload.data.scopeValue ?? null)
      && stableJson(row.steps) === stableJson(roundtrip(payload.data.steps));
    if (!matches) {
      return { kind: "conflict", reason: "Ya existe un playbook con esta identidad que no coincide con el contenido fijado o no se creó tras la reclamación. No se modifica ni se adopta.", finalized: false };
    }
  }
  return {
    kind: "linked",
    finalized: false,
    result: { domainTable: "playbooks", resourceId: row.id, domainIdentity: review.domainIdentity, state: "draft", adopted: !createdNow },
  };
}

async function ensureLeadForm(db: Db, item: ItemRow, review: PackageResourceItemReview, allowCreate: boolean): Promise<Ensure> {
  const payload = createLeadFormSchema.safeParse(review.payload);
  if (!payload.success) throw unprocessable("The pinned form is not valid.", { code: "package_resource_snapshot_invalid" });
  const lookup = async () => {
    const [row] = await db.select().from(leadForms).where(and(
      eq(leadForms.companyId, item.companyId),
      eq(leadForms.slug, review.domainIdentity),
    )).limit(1);
    return row ?? null;
  };
  let row = await lookup();
  let createdNow = false;
  if (!row) {
    if (!allowCreate) return { kind: "absent" };
    try {
      row = await leadFormService(db).create(item.companyId, payload.data, { itemId: item.id, sourceContentHash: review.sourceContentHash });
      createdNow = true;
    } catch (error) {
      if (!isConflictError(error)) throw error;
      row = await lookup();
      if (!row) throw error;
    }
  }
  if (!createdNow) {
    const matches = row.installationItemId === item.id
      && row.installationSourceContentHash === review.sourceContentHash
      && row.active && !row.published
      && row.name === payload.data.name.trim()
      && stableJson(normalizeLeadFormFields(row.fields)) === stableJson(normalizeLeadFormFields(payload.data.fields ?? []))
      && stableJson(normalizeLeadFormSettings(row.settings)) === stableJson(normalizeLeadFormSettings(payload.data.settings ?? null));
    if (!matches) {
      return { kind: "conflict", reason: "Ya existe un formulario con este identificador que no coincide con el contenido fijado, está publicado o no se creó tras la reclamación. No se modifica ni se adopta.", finalized: false };
    }
  }
  return {
    kind: "linked",
    finalized: false,
    result: { domainTable: "lead_forms", resourceId: row.id, domainIdentity: review.domainIdentity, state: "unpublished", adopted: !createdNow },
  };
}

/** Tables owned by the productization module: the domain row and the receipt update share one transaction. */
async function ensureOwned(db: Db, item: ItemRow, review: PackageResourceItemReview, userId: string | null, allowCreate: boolean): Promise<Ensure> {
  const isPreset = review.resourceKind === "brand_preset";
  const presetPayload = isPreset ? brandPresetPayloadSchema.safeParse(review.payload) : null;
  const templatePayload = isPreset ? null : requestTemplatePayloadSchema.safeParse(review.payload);
  if ((presetPayload && !presetPayload.success) || (templatePayload && !templatePayload.success)) {
    throw unprocessable("The pinned resource is not valid.", { code: "package_resource_snapshot_invalid" });
  }
  const provenance = {
    sourcePackageKey: review.packageKey,
    sourcePackageVersion: review.packageVersion,
    sourceLocalId: review.localId,
    sourceContentHash: review.sourceContentHash,
    sourceItemId: item.id,
    createdByUserId: userId,
  };
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pkg-resource:${item.companyId}:${review.resourceKind}:${review.domainIdentity}`}, 0))`);
    const existing = isPreset
      ? (await tx.select().from(brandPresetsTable).where(and(eq(brandPresetsTable.companyId, item.companyId), eq(brandPresetsTable.presetKey, review.domainIdentity))).limit(1))[0]
      : (await tx.select().from(requestTemplatesTable).where(and(eq(requestTemplatesTable.companyId, item.companyId), eq(requestTemplatesTable.templateKey, review.domainIdentity))).limit(1))[0];

    let rowId: string;
    let adopted = false;
    if (existing) {
      // These tables carry exact provenance, so linking needs no timing heuristic.
      if (existing.sourceItemId !== item.id || existing.sourceContentHash !== review.sourceContentHash) {
        const reason = "Ya existe un recurso con esta identidad que no proviene de este ítem. No se modifica ni se adopta.";
        const marked = await finalize(tx, item, { status: "conflict", note: reason });
        return { kind: "conflict" as const, reason, finalized: marked !== null };
      }
      rowId = existing.id;
      adopted = true;
    } else {
      if (!allowCreate) return { kind: "absent" as const };
      if (presetPayload?.success) {
        const [row] = await tx.insert(brandPresetsTable).values({
          companyId: item.companyId,
          presetKey: review.domainIdentity,
          name: presetPayload.data.name,
          voice: presetPayload.data.voice,
          audience: presetPayload.data.audience,
          preferredTerms: presetPayload.data.preferredTerms,
          avoidedTerms: presetPayload.data.avoidedTerms,
          primaryColor: presetPayload.data.primaryColor,
          accentColor: presetPayload.data.accentColor,
          status: "draft",
          ...provenance,
        }).returning({ id: brandPresetsTable.id });
        rowId = row!.id;
      } else if (templatePayload?.success) {
        const [row] = await tx.insert(requestTemplatesTable).values({
          companyId: item.companyId,
          templateKey: review.domainIdentity,
          name: templatePayload.data.name,
          outcome: templatePayload.data.outcome,
          acceptanceCriteria: templatePayload.data.acceptanceCriteria,
          expectedDeliverable: templatePayload.data.expectedDeliverable,
          suggestedPlaybooks: templatePayload.data.suggestedPlaybooks,
          status: "draft",
          ...provenance,
        }).returning({ id: requestTemplatesTable.id });
        rowId = row!.id;
      } else {
        throw unprocessable("The pinned resource is not valid.", { code: "package_resource_snapshot_invalid" });
      }
    }
    const result: PackageResourceResult = {
      domainTable: isPreset ? "productization_brand_presets" : "productization_request_templates",
      resourceId: rowId,
      domainIdentity: review.domainIdentity,
      state: "draft",
      adopted,
    };
    const linked = await finalize(tx, item, linkedValues(result));
    return { kind: "linked" as const, result, finalized: linked !== null };
  });
}

async function reloadItem(db: Db, item: ItemRow): Promise<ItemRow> {
  const [row] = await db.select().from(itemsTable).where(and(eq(itemsTable.id, item.id), eq(itemsTable.companyId, item.companyId)));
  if (!row) throw notFound("Installation item not found");
  return row;
}

async function applyEnsure(db: Db, item: ItemRow, outcome: Ensure): Promise<ItemRow> {
  if (outcome.kind === "absent") return reloadItem(db, item);
  if (!outcome.finalized) {
    if (outcome.kind === "linked") await finalize(db, item, linkedValues(outcome.result));
    else await finalize(db, item, { status: "conflict", note: outcome.reason });
  }
  return reloadItem(db, item);
}

async function ensure(db: Db, item: ItemRow, review: PackageResourceItemReview, userId: string | null, allowCreate: boolean): Promise<Ensure> {
  switch (review.resourceKind) {
    case "playbook": return ensurePlaybook(db, item, review, userId, allowCreate);
    case "lead_form": return ensureLeadForm(db, item, review, allowCreate);
    case "brand_preset":
    case "request_template": return ensureOwned(db, item, review, userId, allowCreate);
  }
}

/** Dependencies recorded in the snapshot must still be live items of the same receipt. */
async function assertDependenciesReady(db: Db, item: ItemRow, review: PackageResourceItemReview) {
  if (review.references.length === 0) return;
  const keys = review.references.map((ref) => resourceLocalKey(ref.kind, ref.localId));
  const siblings = await db.select({ localKey: itemsTable.localKey, status: itemsTable.status }).from(itemsTable)
    .where(and(eq(itemsTable.installationId, item.installationId), eq(itemsTable.companyId, item.companyId), inArray(itemsTable.localKey, keys)));
  const live = new Set(siblings.filter((sibling) => sibling.status !== "cancelled" && sibling.status !== "conflict").map((sibling) => sibling.localKey));
  const missing = keys.filter((key) => !live.has(key));
  if (missing.length > 0) {
    throw conflict("A resource this one refers to is missing, cancelled or in conflict.", { code: "package_resource_dependency_not_ready", missing });
  }
}

export interface InstallResourceOutcome {
  item: ItemRow;
  outcome: "created" | "adopted" | "already_created" | "conflict" | "creating";
}

/** A receipt in `created` state is success only while its exact domain row still exists. */
async function assertCreatedResourceExists(db: Db, item: ItemRow): Promise<void> {
  if (!item.resourceId) throw conflict("The receipt says this resource was created but has no linked domain id.", { code: "package_resource_link_missing" });
  const review = parseReview(item);
  let exists = false;
  switch (review.resourceKind) {
    case "playbook": {
      const [row] = await db.select({ id: playbooks.id, installationItemId: playbooks.installationItemId, installationSourceContentHash: playbooks.installationSourceContentHash })
        .from(playbooks).where(and(eq(playbooks.id, item.resourceId), eq(playbooks.companyId, item.companyId)));
      exists = row?.installationItemId === item.id && row.installationSourceContentHash === review.sourceContentHash;
      break;
    }
    case "lead_form": {
      const [row] = await db.select({ id: leadForms.id, installationItemId: leadForms.installationItemId, installationSourceContentHash: leadForms.installationSourceContentHash })
        .from(leadForms).where(and(eq(leadForms.id, item.resourceId), eq(leadForms.companyId, item.companyId)));
      exists = row?.installationItemId === item.id && row.installationSourceContentHash === review.sourceContentHash;
      break;
    }
    case "brand_preset": {
      const [row] = await db.select({ id: brandPresetsTable.id, sourceItemId: brandPresetsTable.sourceItemId, sourceContentHash: brandPresetsTable.sourceContentHash })
        .from(brandPresetsTable).where(and(eq(brandPresetsTable.id, item.resourceId), eq(brandPresetsTable.companyId, item.companyId)));
      exists = row?.sourceItemId === item.id && row.sourceContentHash === review.sourceContentHash;
      break;
    }
    case "request_template": {
      const [row] = await db.select({ id: requestTemplatesTable.id, sourceItemId: requestTemplatesTable.sourceItemId, sourceContentHash: requestTemplatesTable.sourceContentHash })
        .from(requestTemplatesTable).where(and(eq(requestTemplatesTable.id, item.resourceId), eq(requestTemplatesTable.companyId, item.companyId)));
      exists = row?.sourceItemId === item.id && row.sourceContentHash === review.sourceContentHash;
      break;
    }
  }
  if (!exists) throw conflict("The installed domain resource is missing or no longer carries this receipt's provenance.", { code: "package_resource_domain_missing", itemId: item.id, resourceId: item.resourceId });
}

/**
 * Install one resource item. Idempotent and resumable: `created` returns as-is; `planned` is claimed with a
 * conditional UPDATE; `creating` (an interrupted attempt) and `conflict` (re-checked after a person removed
 * the clash) re-run the identity-keyed write, which can only create the row once or link the same row.
 */
export async function installResourceItem(db: Db, input: { companyId: string; installationId: string; itemId: string; userId: string | null }): Promise<InstallResourceOutcome> {
  const [loaded] = await db.select().from(itemsTable).where(and(
    eq(itemsTable.id, input.itemId),
    eq(itemsTable.installationId, input.installationId),
    eq(itemsTable.companyId, input.companyId),
  ));
  if (!loaded) throw notFound("Installation item not found");
  if (!isPackageResourceKind(loaded.kind)) {
    throw conflict("This item is not a resource; agents are hired through the hire flow.", { code: "package_item_not_resource", kind: loaded.kind });
  }
  if (loaded.status === "created") {
    await assertCreatedResourceExists(db, loaded);
    return { item: loaded, outcome: "already_created" };
  }
  if (loaded.status !== "planned" && loaded.status !== "creating" && loaded.status !== "conflict") {
    throw conflict(`Item is ${loaded.status}; it cannot be installed.`, { code: "package_item_not_installable", status: loaded.status });
  }
  const review = parseReview(loaded);
  await assertDependenciesReady(db, loaded, review);

  let item = loaded;
  if (loaded.status === "planned" || loaded.status === "conflict") {
    // Keep the claim timestamp for receipt auditing; ownership checks use persisted provenance instead.
    const claimedAt = loaded.status === "planned" ? { claimedAt: sql`now()` } : {};
    const [claimed] = await db.update(itemsTable).set({
      status: "creating",
      claimedByUserId: input.userId,
      note: null,
      updatedAt: new Date(),
      ...claimedAt,
    }).where(and(
      eq(itemsTable.id, loaded.id),
      eq(itemsTable.companyId, input.companyId),
      eq(itemsTable.status, loaded.status),
    )).returning();
    if (claimed) {
      item = claimed;
    } else {
      // Lost the race. The winner's state decides; a `creating` item is safe to resume.
      item = await reloadItem(db, loaded);
      if (item.status === "created") {
        await assertCreatedResourceExists(db, item);
        return { item, outcome: "already_created" };
      }
      if (item.status !== "creating") {
        throw conflict(`Item is ${item.status}; it cannot be installed.`, { code: "package_item_not_installable", status: item.status });
      }
    }
  }

  const outcome = await ensure(db, item, review, input.userId, true);
  const updated = await applyEnsure(db, item, outcome);
  if (outcome.kind === "conflict") return { item: updated, outcome: "conflict" };
  if (updated.status === "created") return { item: updated, outcome: outcome.kind === "linked" && outcome.result.adopted ? "adopted" : "created" };
  return { item: updated, outcome: "creating" };
}

/**
 * Read-only recovery: for a `creating` item, look the identity up and link it if (and only if) it matches the
 * pinned snapshot and its provenance. Never creates anything and never changes an absent row.
 */
export async function inspectResourceItem(db: Db, input: { companyId: string; installationId: string; itemId: string }): Promise<{ found: boolean; item: ItemRow }> {
  const [loaded] = await db.select().from(itemsTable).where(and(
    eq(itemsTable.id, input.itemId),
    eq(itemsTable.installationId, input.installationId),
    eq(itemsTable.companyId, input.companyId),
  ));
  if (!loaded) throw notFound("Installation item not found");
  if (loaded.status === "created") {
    await assertCreatedResourceExists(db, loaded);
    return { found: true, item: loaded };
  }
  if (loaded.status !== "creating") {
    throw conflict("There is nothing to reconcile for this item.", { code: "package_item_not_reconcilable", status: loaded.status });
  }
  const outcome = await ensure(db, loaded, parseReview(loaded), null, false);
  const item = await applyEnsure(db, loaded, outcome);
  return { found: outcome.kind === "linked", item };
}
