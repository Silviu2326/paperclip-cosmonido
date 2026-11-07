import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { contacts, crmSyncConfigs, crmSyncJobs, crmSyncLinks, customers, toolConnections } from "@paperclipai/db";
import type { CreateContact, CreateCustomer } from "@paperclipai/shared";
import { HttpError, conflict, notFound, unprocessable } from "../../errors.js";
import { logActivity } from "../activity-log.js";
import { CrmDuplicateError, type CrmActor } from "../crm/common.js";
import { contactService } from "../crm/contacts.js";
import { customerService } from "../crm/customers.js";
import { normalizeDomain, normalizeEmail } from "../crm/identity.js";
import { crmProviderAdapter } from "./providers.js";
import {
  CRM_SYNC_PROVIDERS,
  CrmProviderResponseError,
  emptyStats,
  type CanonicalFields,
  type ContactSyncFields,
  type CrmConnectorInvoker,
  type CrmProviderAdapter,
  type CrmSyncDirection,
  type CrmSyncEntityKind,
  type CrmSyncPrimarySystem,
  type CrmSyncProvider,
  type CrmSyncStats,
  type CustomerSyncFields,
  type ExternalRecord,
} from "./types.js";

// External CRM sync (pista L): durable, directional, with source ids, conflicts and receipts.
//
//  - A job is a row. Progress (cursor per task) is saved after every page, so a restart or an
//    expired lease resumes where it stopped (`tick`) and never repeats finished pages.
//  - A local<->external link exists only after the provider returned a record id. A create whose
//    outcome is unknown leaves the link `uncertain` (no external id) and is never repeated by a job.
//  - Change detection compares hashes of the provider-projected fields with the hashes saved at
//    the last confirmed sync. Both sides changed = conflict, decided by the declared system of
//    record (`primarySystem`) or left for a person (`manual`).
//  - Nothing is simulated: without a wired invoker and an active connection, jobs are refused with
//    the exact thing to fix.
//
// Limits (kept explicit on purpose): customers (organizations) and contacts only; no opportunities,
// no activities, no company<->contact association; provider deletions are not propagated; an
// export-only company can create a duplicate when the provider already holds the same record.

const LEASE_MS = 120_000;
const PAGE_LIMIT = 50;
const MAX_PAGES_PER_RUN = 20;
const TIME_BUDGET_MS = 20_000;
const MAX_ERRORS = 50;
const SYSTEM_ACTOR: CrmActor = { actorType: "system", actorId: "crm-sync", agentId: null, runId: null };

type ConfigRow = typeof crmSyncConfigs.$inferSelect;
type JobRow = typeof crmSyncJobs.$inferSelect;
type LinkRow = typeof crmSyncLinks.$inferSelect;
type JobError = Record<string, unknown>;

const PROVIDER_LABEL: Record<CrmSyncProvider, string> = { hubspot: "HubSpot", pipedrive: "Pipedrive" };

export interface CrmSyncServiceOptions {
  /** Calls a tool of the company's connection. Without it every job is refused (no simulated sync). */
  invoke?: CrmConnectorInvoker;
  now?: () => Date;
}

export interface SaveCrmSyncConfigInput {
  connectionId: string;
  direction: CrmSyncDirection;
  primarySystem: CrmSyncPrimarySystem;
  enabled: boolean;
  toolNames?: Record<string, string>;
}

export interface CrmSyncProviderStatus {
  provider: CrmSyncProvider;
  label: string;
  configured: boolean;
  enabled: boolean;
  direction: CrmSyncDirection | null;
  primarySystem: CrmSyncPrimarySystem | null;
  toolNames: Record<string, string>;
  disconnectedAt: string | null;
  connection: { id: string; name: string; status: string; enabled: boolean } | null;
  /** True only when a job could start right now. */
  ready: boolean;
  /** What to fix, in order. Empty when ready. */
  blockers: string[];
  links: { linked: number; conflict: number; uncertain: number; error: number };
  openJob: JobSummary | null;
  lastJob: JobSummary | null;
  lastSuccessfulSyncAt: string | null;
}

export interface JobSummary {
  id: string;
  direction: CrmSyncDirection;
  status: JobRow["status"];
  stats: Record<string, number>;
  errorCount: number;
  errors: JobError[];
  blockedReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

function summarize(job: JobRow): JobSummary {
  return {
    id: job.id,
    direction: job.direction as CrmSyncDirection,
    status: job.status,
    stats: job.stats,
    errorCount: job.errors.length,
    errors: job.errors,
    blockedReason: job.blockedReason,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 300);
}

/** The connector said it cannot run at all (no connection, inactive, not wired): nothing was sent. */
function isBlocking(error: unknown): boolean {
  return error instanceof HttpError && error.status === 422;
}

function tasksFor(direction: CrmSyncDirection): string[] {
  const kinds = ["customer", "contact"] as const;
  return [
    ...(direction !== "export" ? kinds.map((kind) => `import:${kind}`) : []),
    ...(direction !== "import" ? kinds.map((kind) => `export:${kind}`) : []),
  ];
}

interface RunContext {
  job: JobRow;
  config: ConfigRow;
  adapter: CrmProviderAdapter;
  stats: CrmSyncStats;
  errors: JobError[];
  direction: CrmSyncDirection;
  toolNames: Record<string, string>;
  invoke: CrmConnectorInvoker;
  currentTask: string;
  currentCursor: string | null;
}

export function crmSyncService(db: Db, options: CrmSyncServiceOptions = {}) {
  const now = options.now ?? (() => new Date());

  // ------------------------------------------------------------ local records

  async function loadLocal(companyId: string, kind: CrmSyncEntityKind, id: string): Promise<CanonicalFields | null> {
    if (kind === "customer") {
      const [row] = await db
        .select({ name: customers.name, domain: customers.domain })
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.companyId, companyId), isNull(customers.archivedAt)))
        .limit(1);
      return row ? { name: row.name, domain: row.domain } : null;
    }
    const [row] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.companyId, companyId), isNull(contacts.archivedAt)))
      .limit(1);
    return row
      ? { firstName: row.firstName, lastName: row.lastName, displayName: row.displayName, email: row.primaryEmail, phone: row.primaryPhone, title: row.title }
      : null;
  }

  async function loadLocalRecord(companyId: string, kind: CrmSyncEntityKind, id: string) {
    const fields = await loadLocal(companyId, kind, id);
    return fields ? { id, fields } : null;
  }

  async function localPage(companyId: string, kind: CrmSyncEntityKind, cursor: string | null) {
    if (kind === "customer") {
      const rows = await db
        .select({ id: customers.id, name: customers.name, domain: customers.domain })
        .from(customers)
        .where(and(eq(customers.companyId, companyId), isNull(customers.archivedAt), ...(cursor ? [gt(customers.id, cursor)] : [])))
        .orderBy(asc(customers.id))
        .limit(PAGE_LIMIT);
      return rows.map((row) => ({ id: row.id, fields: { name: row.name, domain: row.domain } as CanonicalFields }));
    }
    const rows = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, companyId), isNull(contacts.archivedAt), ...(cursor ? [gt(contacts.id, cursor)] : [])))
      .orderBy(asc(contacts.id))
      .limit(PAGE_LIMIT);
    return rows.map((row) => ({
      id: row.id,
      fields: { firstName: row.firstName, lastName: row.lastName, displayName: row.displayName, email: row.primaryEmail, phone: row.primaryPhone, title: row.title } as CanonicalFields,
    }));
  }

  /** An existing local record that is plainly the same one: same domain (customers) or email (contacts). */
  async function findLocalMatch(companyId: string, provider: CrmSyncProvider, kind: CrmSyncEntityKind, fields: CanonicalFields): Promise<string | null> {
    const key = kind === "customer" ? normalizeDomain((fields as CustomerSyncFields).domain) : normalizeEmail((fields as ContactSyncFields).email);
    if (!key) return null;
    const rows =
      kind === "customer"
        ? await db.select({ id: customers.id }).from(customers).where(and(eq(customers.companyId, companyId), isNull(customers.archivedAt), eq(customers.domain, key))).limit(2)
        : await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.companyId, companyId), isNull(contacts.archivedAt), eq(contacts.primaryEmail, key))).limit(2);
    if (rows.length !== 1) return null;
    const [taken] = await db
      .select({ id: crmSyncLinks.id })
      .from(crmSyncLinks)
      .where(and(eq(crmSyncLinks.companyId, companyId), eq(crmSyncLinks.provider, provider), eq(crmSyncLinks.entityKind, kind), eq(crmSyncLinks.localId, rows[0]!.id)))
      .limit(1);
    return taken ? null : rows[0]!.id;
  }

  async function createLocal(companyId: string, provider: CrmSyncProvider, kind: CrmSyncEntityKind, fields: CanonicalFields): Promise<string> {
    if (kind === "customer") {
      const f = fields as CustomerSyncFields;
      if (!f.name) throw new Error("The provider record has no name");
      const { customer } = await customerService(db).create(
        companyId,
        { kind: "organization", name: f.name, domain: provider === "hubspot" ? f.domain : null, tags: [] } as CreateCustomer,
        { actor: SYSTEM_ACTOR },
      );
      return customer.id;
    }
    const f = fields as ContactSyncFields;
    const { contact } = await contactService(db).create(
      companyId,
      { displayName: f.displayName, firstName: f.firstName, lastName: f.lastName, primaryEmail: f.email, primaryPhone: f.phone, title: f.title, consents: {} } as CreateContact,
      { actor: SYSTEM_ACTOR },
    );
    return contact.id;
  }

  async function updateLocal(companyId: string, provider: CrmSyncProvider, kind: CrmSyncEntityKind, id: string, fields: CanonicalFields): Promise<void> {
    if (kind === "customer") {
      const f = fields as CustomerSyncFields;
      if (!f.name) throw new Error("The provider record has no name");
      const patch = provider === "hubspot" ? { name: f.name, domain: f.domain } : { name: f.name };
      const updated = await customerService(db).update(companyId, id, patch, { actor: SYSTEM_ACTOR });
      if (!updated) throw new Error("The local customer no longer exists");
      return;
    }
    const f = fields as ContactSyncFields;
    const updated = await contactService(db).update(
      companyId,
      id,
      { displayName: f.displayName, firstName: f.firstName, lastName: f.lastName, primaryEmail: f.email, primaryPhone: f.phone, title: f.title },
      { actor: SYSTEM_ACTOR },
    );
    if (!updated) throw new Error("The local contact no longer exists");
  }

  // ------------------------------------------------------------ links

  async function linkByExternal(companyId: string, provider: CrmSyncProvider, kind: CrmSyncEntityKind, externalId: string) {
    const [row] = await db
      .select()
      .from(crmSyncLinks)
      .where(and(eq(crmSyncLinks.companyId, companyId), eq(crmSyncLinks.provider, provider), eq(crmSyncLinks.entityKind, kind), eq(crmSyncLinks.externalId, externalId)))
      .limit(1);
    return row ?? null;
  }

  async function patchLink(id: string, patch: Partial<typeof crmSyncLinks.$inferInsert>) {
    const [row] = await db.update(crmSyncLinks).set({ ...patch, updatedAt: now() }).where(eq(crmSyncLinks.id, id)).returning();
    return row ?? null;
  }

  // ------------------------------------------------------------ config and connection

  async function loadConfig(companyId: string, provider: CrmSyncProvider) {
    const [row] = await db
      .select()
      .from(crmSyncConfigs)
      .where(and(eq(crmSyncConfigs.companyId, companyId), eq(crmSyncConfigs.provider, provider)))
      .limit(1);
    return row ?? null;
  }

  async function loadConnection(companyId: string, connectionId: string | null) {
    if (!connectionId) return null;
    const [row] = await db
      .select({ id: toolConnections.id, name: toolConnections.name, status: toolConnections.status, enabled: toolConnections.enabled, config: toolConnections.config })
      .from(toolConnections)
      .where(and(eq(toolConnections.id, connectionId), eq(toolConnections.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  function matchesProvider(provider: CrmSyncProvider, connection: { name: string; config: unknown }): boolean {
    const config = connection.config && typeof connection.config === "object" ? (connection.config as Record<string, unknown>) : {};
    const haystack = [connection.name, config.sourceTemplateKey, config.url].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
    return haystack.includes(provider);
  }

  async function blockersFor(companyId: string, provider: CrmSyncProvider, config: ConfigRow | null) {
    const label = PROVIDER_LABEL[provider];
    const blockers: string[] = [];
    const connection = await loadConnection(companyId, config?.connectionId ?? null);
    if (!config) blockers.push(`Elige la conexión de ${label}, la dirección y el sistema principal para activar la sincronización.`);
    else {
      if (config.disconnectedAt) blockers.push(`La sincronización con ${label} está desconectada. Vuelve a activarla en su configuración.`);
      else if (!config.enabled) blockers.push(`La sincronización con ${label} está desactivada.`);
      if (!connection) blockers.push(`La conexión de ${label} ya no existe. Conecta ${label} en Apps y elígela de nuevo.`);
      else if (connection.status !== "active" || !connection.enabled) blockers.push(`La conexión de ${label} no está activa. Reconéctala o actívala en Apps.`);
    }
    if (config && !config.disconnectedAt) {
      const names = config.toolNames ?? {};
      for (const kind of ["customer", "contact"] as const) {
        const suffix = kind === "customer" ? "Customer" : "Contact";
        if (config.direction !== "export" && !names[`list${suffix}`]) blockers.push(`Selecciona la herramienta de lectura de ${kind === "customer" ? "clientes" : "contactos"} del catálogo vivo.`);
        if (config.direction !== "import" && (!names[`create${suffix}`] || !names[`update${suffix}`])) blockers.push(`Selecciona las herramientas de creación y actualización de ${kind === "customer" ? "clientes" : "contactos"} del catálogo vivo.`);
      }
    }
    if (!options.invoke) blockers.push("Este servidor no tiene conectado el invocador de conectores para la sincronización CRM. Pide a quien administra la instancia que lo active.");
    return { blockers, connection };
  }

  // ------------------------------------------------------------ job processing

  async function saveProgress(job: JobRow, ctx: RunContext, cursors: Record<string, string | null>) {
    const [row] = await db
      .update(crmSyncJobs)
      .set({ cursors, stats: ctx.stats as unknown as Record<string, number>, errors: ctx.errors, leaseExpiresAt: new Date(now().getTime() + LEASE_MS), updatedAt: now() })
      .where(and(eq(crmSyncJobs.id, job.id), eq(crmSyncJobs.status, "running"), eq(crmSyncJobs.attempts, job.attempts)))
      .returning();
    if (!row) throw new Error("The sync job lost its lease");
    return row;
  }

  function pushError(ctx: RunContext, error: JobError) {
    ctx.stats.errors += 1;
    if (ctx.errors.length < MAX_ERRORS) ctx.errors.push(error);
  }

  function call(ctx: RunContext, kind: CrmSyncEntityKind, operation: "list" | "create" | "update", args: Record<string, unknown>, localRecordId: string | null = null) {
    return ctx.invoke({
      companyId: ctx.job.companyId,
      connectionId: ctx.config.connectionId!,
      toolName: ctx.adapter.toolName(kind, operation, ctx.toolNames),
      arguments: args,
      provider: ctx.job.provider as CrmSyncProvider,
      configId: ctx.config.id,
      configUpdatedAt: ctx.config.updatedAt.toISOString(),
      authority: {
        kind: "crm_sync_job", jobId: ctx.job.id, requestedByUserId: ctx.job.requestedByUserId,
        leaseAttempt: ctx.job.attempts, task: ctx.currentTask, cursor: ctx.currentCursor,
        operation, entityKind: kind, argumentsHash: sha256(args),
        localRecordId,
      },
    });
  }

  const hashOf = (ctx: RunContext, kind: CrmSyncEntityKind, fields: CanonicalFields) => sha256(ctx.adapter.project(kind, fields));

  async function recordConflict(ctx: RunContext, kind: CrmSyncEntityKind, link: LinkRow, local: CanonicalFields, external: ExternalRecord) {
    ctx.stats.conflicts += 1;
    await patchLink(link.id, {
      status: "conflict",
      externalUpdatedAt: external.updatedAt,
      conflict: {
        detectedAt: now().toISOString(),
        jobId: ctx.job.id,
        local: ctx.adapter.project(kind, local),
        external: ctx.adapter.project(kind, external.fields),
        externalUpdatedAt: external.updatedAt,
      },
    });
  }

  async function importRecord(ctx: RunContext, kind: CrmSyncEntityKind, external: ExternalRecord) {
    const companyId = ctx.job.companyId;
    const provider = ctx.config.provider as CrmSyncProvider;
    const externalHash = hashOf(ctx, kind, external.fields);
    let link = await linkByExternal(companyId, provider, kind, external.externalId);

    if (!link) {
      let localId = await findLocalMatch(companyId, provider, kind, external.fields);
      let created = false;
      if (!localId) {
        try {
          localId = await createLocal(companyId, provider, kind, external.fields);
          created = true;
        } catch (error) {
          if (error instanceof CrmDuplicateError) {
            pushError(ctx, { entityKind: kind, externalId: external.externalId, message: "Posible duplicado en el CRM local; resuélvelo y vuelve a sincronizar." });
            return;
          }
          throw error;
        }
      }
      try {
        const [inserted] = await db
          .insert(crmSyncLinks)
          .values({
            companyId,
            provider,
            entityKind: kind,
            localId,
            externalId: external.externalId,
            status: "linked",
            // A freshly created local record equals the provider's; an existing one is unreconciled (null).
            localHash: created ? externalHash : null,
            externalHash: created ? externalHash : null,
            externalUpdatedAt: external.updatedAt,
            receipt: { externalId: external.externalId, updatedAt: external.updatedAt },
            lastSyncedAt: created ? now() : null,
          })
          .returning();
        link = inserted ?? null;
        if (!link) throw new Error("Sync link could not be saved");
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        pushError(ctx, { entityKind: kind, externalId: external.externalId, localId, message: "El registro local ya está vinculado a otro registro del proveedor." });
        return;
      }
      if (created) {
        ctx.stats.importedCreated += 1;
        return;
      }
    }

    const local = await loadLocal(companyId, kind, link!.localId);
    if (!local) {
      await patchLink(link!.id, { status: "error", conflict: { reason: "local_missing_or_archived" } });
      pushError(ctx, { entityKind: kind, externalId: external.externalId, localId: link!.localId, message: "El registro local fue archivado o borrado; el vínculo queda en error." });
      return;
    }
    const localHash = hashOf(ctx, kind, local);
    if (localHash === externalHash) {
      if (link!.localHash !== localHash || link!.externalHash !== externalHash || link!.status !== "linked") {
        await patchLink(link!.id, { status: "linked", localHash, externalHash, externalUpdatedAt: external.updatedAt, conflict: null, lastSyncedAt: now() });
      }
      ctx.stats.unchanged += 1;
      return;
    }
    const localChanged = link!.localHash !== localHash;
    const externalChanged = link!.externalHash !== externalHash;
    const canExport = ctx.direction !== "import";
    let action: "import" | "export" | "conflict";
    if (externalChanged && !localChanged) action = "import";
    else if (localChanged && !externalChanged) action = canExport ? "export" : "conflict";
    else {
      const primary = ctx.config.primarySystem as CrmSyncPrimarySystem;
      action = primary === "external" ? "import" : primary === "paperclip" && canExport ? "export" : "conflict";
    }
    if (action === "export") {
      // The export phase of this same job writes it; the external side is known unchanged or overridden.
      if (localChanged && !externalChanged) return;
      await patchLink(link!.id, { externalHash, externalUpdatedAt: external.updatedAt, status: "linked", conflict: null });
      return;
    }
    if (action === "conflict") {
      // A one-way import with local-only edits is not a conflict: the local edit is simply not exported.
      if (localChanged && !externalChanged) {
        ctx.stats.skipped += 1;
        return;
      }
      await recordConflict(ctx, kind, link!, local, external);
      return;
    }
    await updateLocal(companyId, provider, kind, link!.localId, external.fields);
    const after = await loadLocal(companyId, kind, link!.localId);
    await patchLink(link!.id, {
      status: "linked",
      localHash: after ? hashOf(ctx, kind, after) : externalHash,
      externalHash,
      externalUpdatedAt: external.updatedAt,
      conflict: null,
      lastSyncedAt: now(),
    });
    ctx.stats.importedUpdated += 1;
  }

  async function exportRecord(ctx: RunContext, kind: CrmSyncEntityKind, localId: string, fields: CanonicalFields, link: LinkRow | null) {
    const companyId = ctx.job.companyId;
    const provider = ctx.config.provider as CrmSyncProvider;
    const localHash = hashOf(ctx, kind, fields);

    if (link) {
      if (link.status === "conflict") return;
      if (link.status === "uncertain" || !link.externalId) {
        pushError(ctx, { entityKind: kind, localId, uncertain: true, message: "La creación anterior en el proveedor no se pudo confirmar. Comprueba el proveedor y resuelve el vínculo antes de repetirla." });
        return;
      }
      if (link.status === "error") return;
      if (link.localHash === localHash) {
        ctx.stats.unchanged += 1;
        return;
      }
      const receipt = ctx.adapter.parseReceipt(kind, await call(ctx, kind, "update", ctx.adapter.writeArguments(kind, link.externalId, fields), localId));
      if (receipt.externalId !== link.externalId) {
        throw new CrmProviderResponseError(`El proveedor confirmó otro registro (${receipt.externalId}) distinto del vinculado.`);
      }
      await patchLink(link.id, {
        status: "linked",
        localHash,
        externalHash: receipt.fields ? hashOf(ctx, kind, receipt.fields) : localHash,
        externalUpdatedAt: receipt.updatedAt,
        receipt: { externalId: receipt.externalId, updatedAt: receipt.updatedAt, jobId: ctx.job.id },
        conflict: null,
        lastSyncedAt: now(),
      });
      ctx.stats.exportedUpdated += 1;
      return;
    }

    // New record in the provider. Reserve the link first: if the process dies after the provider
    // wrote but before we heard back, the link stays `uncertain` and the create is not repeated.
    let reserved: LinkRow | undefined;
    try {
      [reserved] = await db
        .insert(crmSyncLinks)
        .values({ companyId, provider, entityKind: kind, localId, externalId: null, status: "uncertain", localHash: null, externalHash: null })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }
    try {
      const receipt = ctx.adapter.parseReceipt(kind, await call(ctx, kind, "create", ctx.adapter.writeArguments(kind, null, fields), localId));
      try {
        await patchLink(reserved!.id, {
          status: "linked",
          externalId: receipt.externalId,
          localHash,
          externalHash: receipt.fields ? hashOf(ctx, kind, receipt.fields) : localHash,
          externalUpdatedAt: receipt.updatedAt,
          receipt: { externalId: receipt.externalId, updatedAt: receipt.updatedAt, jobId: ctx.job.id },
          lastSyncedAt: now(),
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        await patchLink(reserved!.id, { status: "error", conflict: { reason: "external_id_already_linked", externalId: receipt.externalId } });
        pushError(ctx, { entityKind: kind, localId, externalId: receipt.externalId, message: "El proveedor devolvió un registro que ya está vinculado a otro registro local." });
        return;
      }
      ctx.stats.exportedCreated += 1;
    } catch (error) {
      const definite = isBlocking(error) || (error instanceof CrmProviderResponseError && error.definite);
      if (definite) {
        // Nothing was written: drop the reservation so the next job tries again.
        await db.delete(crmSyncLinks).where(and(eq(crmSyncLinks.id, reserved!.id), eq(crmSyncLinks.status, "uncertain")));
      }
      throw error;
    }
  }

  /** Runs tasks until done or the page/time budget is spent. Returns whether every task finished. */
  async function runTasks(ctx: RunContext): Promise<{ finished: boolean; cursors: Record<string, string | null> }> {
    const cursors: Record<string, string | null> = { ...(ctx.job.cursors ?? {}) };
    const resolutionTarget = cursors.__resolutionTarget;
    const [resolutionKind, resolutionId] = typeof resolutionTarget === "string" ? resolutionTarget.split(":", 2) : [];
    const started = now().getTime();
    let pages = 0;
    for (const task of tasksFor(ctx.direction)) {
      if (cursors[task] === "done") continue;
      const [phase, kindName] = task.split(":") as ["import" | "export", CrmSyncEntityKind];
      if (resolutionTarget && (phase !== "export" || kindName !== resolutionKind)) {
        cursors[task] = "done";
        continue;
      }
      while (cursors[task] !== "done") {
        if (pages >= MAX_PAGES_PER_RUN || now().getTime() - started > TIME_BUDGET_MS) return { finished: false, cursors };
        pages += 1;
        const cursor = cursors[task] ?? null;
        if (phase === "import") {
          ctx.currentTask = task;
          ctx.currentCursor = cursor;
          const page = ctx.adapter.parsePage(kindName, await call(ctx, kindName, "list", ctx.adapter.listArguments(kindName, cursor, PAGE_LIMIT)));
          for (const record of page.records) {
            try {
              await importRecord(ctx, kindName, record);
            } catch (error) {
              if (isBlocking(error)) throw error;
              pushError(ctx, { entityKind: kindName, externalId: record.externalId, message: messageOf(error) });
            }
          }
          cursors[task] = page.nextCursor ?? "done";
        } else {
          ctx.currentTask = task;
          ctx.currentCursor = cursor;
          const rows = resolutionId
            ? [await loadLocalRecord(ctx.job.companyId, kindName, resolutionId)].filter((row): row is { id: string; fields: CanonicalFields } => row !== null)
            : await localPage(ctx.job.companyId, kindName, cursor);
          const links = rows.length
            ? await db
                .select()
                .from(crmSyncLinks)
                .where(and(eq(crmSyncLinks.companyId, ctx.job.companyId), eq(crmSyncLinks.provider, ctx.config.provider), eq(crmSyncLinks.entityKind, kindName), inArray(crmSyncLinks.localId, rows.map((row) => row.id))))
            : [];
          const byLocal = new Map(links.map((link) => [link.localId, link]));
          for (const row of rows) {
            if (now().getTime() - started > TIME_BUDGET_MS) return { finished: false, cursors };
            try {
              await exportRecord(ctx, kindName, row.id, row.fields, byLocal.get(row.id) ?? null);
            } catch (error) {
              if (isBlocking(error)) throw error;
              const uncertain = !(error instanceof CrmProviderResponseError && error.definite);
              pushError(ctx, { entityKind: kindName, localId: row.id, message: messageOf(error), ...(uncertain && !byLocal.has(row.id) ? { uncertain: true } : {}) });
            }
          }
          cursors[task] = resolutionId || rows.length < PAGE_LIMIT ? "done" : rows[rows.length - 1]!.id;
        }
        ctx.job = await saveProgress(ctx.job, ctx, cursors);
      }
    }
    return { finished: true, cursors };
  }

  async function finish(job: JobRow, patch: Partial<typeof crmSyncJobs.$inferInsert>) {
    const [row] = await db.update(crmSyncJobs).set({ ...patch, leaseExpiresAt: null, updatedAt: now() }).where(and(
      eq(crmSyncJobs.id, job.id), eq(crmSyncJobs.status, "running"), eq(crmSyncJobs.attempts, job.attempts),
    )).returning();
    return row ?? job;
  }

  async function runJob(jobId: string): Promise<JobRow> {
    const t = now();
    const [claimed] = await db
      .update(crmSyncJobs)
      .set({ status: "running", leaseExpiresAt: new Date(t.getTime() + LEASE_MS), attempts: sql`${crmSyncJobs.attempts} + 1`, startedAt: sql`coalesce(${crmSyncJobs.startedAt}, ${t.toISOString()}::timestamptz)`, updatedAt: t })
      .where(and(eq(crmSyncJobs.id, jobId), or(eq(crmSyncJobs.status, "queued"), and(eq(crmSyncJobs.status, "running"), sql`${crmSyncJobs.leaseExpiresAt} < ${t.toISOString()}::timestamptz`))))
      .returning();
    if (!claimed) {
      const [current] = await db.select().from(crmSyncJobs).where(eq(crmSyncJobs.id, jobId)).limit(1);
      if (!current) throw notFound("Sync job not found");
      return current;
    }
    const provider = claimed.provider as CrmSyncProvider;
    const config = await loadConfig(claimed.companyId, provider);
    const { blockers } = await blockersFor(claimed.companyId, provider, config);
    if (!config || blockers.length > 0 || !options.invoke) {
      return finish(claimed, { status: "blocked", blockedReason: blockers[0] ?? "La sincronización no está configurada.", finishedAt: now() });
    }
    const ctx: RunContext = {
      job: claimed,
      config,
      adapter: crmProviderAdapter(provider),
      stats: { ...emptyStats(), ...(claimed.stats as Partial<CrmSyncStats>) },
      errors: [...claimed.errors],
      direction: claimed.direction as CrmSyncDirection,
      toolNames: config.toolNames ?? {},
      invoke: options.invoke,
      currentTask: "",
      currentCursor: null,
    };
    try {
      const outcome = await runTasks(ctx);
      if (!outcome.finished) {
        // Budget spent: leave it queued so the next tick or request continues from the saved cursors.
        return finish(ctx.job, { status: "queued", cursors: outcome.cursors, stats: ctx.stats as unknown as Record<string, number>, errors: ctx.errors });
      }
      const worked = ctx.stats.importedCreated + ctx.stats.importedUpdated + ctx.stats.exportedCreated + ctx.stats.exportedUpdated + ctx.stats.unchanged > 0;
      const finalStatus = ctx.stats.errors === 0 ? "succeeded" : worked ? "partial" : "failed";
      const done = await finish(ctx.job, { status: finalStatus, cursors: outcome.cursors, stats: ctx.stats as unknown as Record<string, number>, errors: ctx.errors, finishedAt: now() });
      await logActivity(db, {
        companyId: done.companyId,
        actorType: "system",
        actorId: "crm-sync",
        action: "crm_sync.job_finished",
        entityType: "crm_sync_job",
        entityId: done.id,
        details: { provider, status: done.status, stats: ctx.stats },
      });
      return done;
    } catch (error) {
      const blocked = isBlocking(error);
      pushError(ctx, { message: messageOf(error) });
      const failed = await finish(ctx.job, {
        status: blocked ? "blocked" : "failed",
        blockedReason: blocked ? messageOf(error) : null,
        stats: ctx.stats as unknown as Record<string, number>,
        errors: ctx.errors,
        finishedAt: now(),
      });
      await logActivity(db, {
        companyId: failed.companyId,
        actorType: "system",
        actorId: "crm-sync",
        action: "crm_sync.job_failed",
        entityType: "crm_sync_job",
        entityId: failed.id,
        details: { provider, status: failed.status, message: messageOf(error) },
      });
      return failed;
    }
  }

  // ------------------------------------------------------------ public API

  return {
    PROVIDERS: CRM_SYNC_PROVIDERS,

    async listConnections(companyId: string, provider: CrmSyncProvider) {
      const rows = await db.select({ id: toolConnections.id, name: toolConnections.name, status: toolConnections.status, enabled: toolConnections.enabled, config: toolConnections.config })
        .from(toolConnections).where(eq(toolConnections.companyId, companyId)).orderBy(asc(toolConnections.name)).limit(100);
      return rows.filter((row) => matchesProvider(provider, row)).map(({ id, name, status, enabled }) => ({ id, name, status, enabled }));
    },

    async saveConfig(companyId: string, provider: CrmSyncProvider, input: SaveCrmSyncConfigInput, userId: string) {
      const connection = await loadConnection(companyId, input.connectionId);
      if (!connection) throw unprocessable(`La conexión elegida no existe en esta empresa. Conecta ${PROVIDER_LABEL[provider]} en Apps.`);
      if (!matchesProvider(provider, connection)) {
        throw unprocessable(`La conexión elegida no parece ser de ${PROVIDER_LABEL[provider]}. Elige la conexión de ${PROVIDER_LABEL[provider]}.`);
      }
      if (input.enabled && (connection.status !== "active" || !connection.enabled)) {
        throw unprocessable(`La conexión de ${PROVIDER_LABEL[provider]} no está activa. Reconéctala o actívala en Apps antes de sincronizar.`);
      }
      const values = {
        connectionId: connection.id,
        direction: input.direction,
        primarySystem: input.primarySystem,
        enabled: input.enabled,
        toolNames: input.toolNames ?? {},
        disconnectedAt: input.enabled ? null : undefined,
        updatedByUserId: userId,
        updatedAt: now(),
      };
      const [row] = await db
        .insert(crmSyncConfigs)
        .values({ companyId, provider, ...values, disconnectedAt: null })
        .onConflictDoUpdate({ target: [crmSyncConfigs.companyId, crmSyncConfigs.provider], set: values })
        .returning();
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: userId,
        action: "crm_sync.config_saved",
        entityType: "crm_sync_config",
        entityId: row!.id,
        details: { provider, direction: input.direction, primarySystem: input.primarySystem, enabled: input.enabled },
      });
      return row!;
    },

    /**
     * Stops syncing. Local records and links stay; nothing is deleted at the provider or locally,
     * and later jobs are refused until the sync is configured and enabled again.
     */
    async disconnect(companyId: string, provider: CrmSyncProvider, userId: string) {
      const [row] = await db
        .update(crmSyncConfigs)
        .set({ enabled: false, disconnectedAt: now(), updatedByUserId: userId, updatedAt: now() })
        .where(and(eq(crmSyncConfigs.companyId, companyId), eq(crmSyncConfigs.provider, provider)))
        .returning();
      if (!row) throw notFound("Sync is not configured for this provider");
      await db
        .update(crmSyncJobs)
        .set({ status: "blocked", blockedReason: "Sincronización desconectada", finishedAt: now(), leaseExpiresAt: null, updatedAt: now() })
        .where(and(eq(crmSyncJobs.companyId, companyId), eq(crmSyncJobs.provider, provider), inArray(crmSyncJobs.status, ["queued", "running"])));
      await logActivity(db, { companyId, actorType: "user", actorId: userId, action: "crm_sync.disconnected", entityType: "crm_sync_config", entityId: row.id, details: { provider } });
      return row;
    },

    /** Real state only: configuration, connection, links by status and the actual last jobs. */
    async status(companyId: string, only?: CrmSyncProvider): Promise<CrmSyncProviderStatus[]> {
      const result: CrmSyncProviderStatus[] = [];
      for (const provider of only ? [only] : CRM_SYNC_PROVIDERS) {
        const config = await loadConfig(companyId, provider);
        const { blockers, connection } = await blockersFor(companyId, provider, config);
        const counts = await db
          .select({ status: crmSyncLinks.status, count: sql<number>`count(*)::int` })
          .from(crmSyncLinks)
          .where(and(eq(crmSyncLinks.companyId, companyId), eq(crmSyncLinks.provider, provider)))
          .groupBy(crmSyncLinks.status);
        const count = (status: string) => Number(counts.find((row) => row.status === status)?.count ?? 0);
        const [open] = await db
          .select()
          .from(crmSyncJobs)
          .where(and(eq(crmSyncJobs.companyId, companyId), eq(crmSyncJobs.provider, provider), inArray(crmSyncJobs.status, ["queued", "running"])))
          .orderBy(desc(crmSyncJobs.createdAt))
          .limit(1);
        const [last] = await db
          .select()
          .from(crmSyncJobs)
          .where(and(eq(crmSyncJobs.companyId, companyId), eq(crmSyncJobs.provider, provider)))
          .orderBy(desc(crmSyncJobs.createdAt))
          .limit(1);
        const [lastOk] = await db
          .select({ finishedAt: crmSyncJobs.finishedAt })
          .from(crmSyncJobs)
          .where(and(eq(crmSyncJobs.companyId, companyId), eq(crmSyncJobs.provider, provider), eq(crmSyncJobs.status, "succeeded")))
          .orderBy(desc(crmSyncJobs.finishedAt))
          .limit(1);
        result.push({
          provider,
          label: PROVIDER_LABEL[provider],
          configured: Boolean(config),
          enabled: Boolean(config?.enabled && !config.disconnectedAt),
          direction: (config?.direction as CrmSyncDirection | undefined) ?? null,
          primarySystem: (config?.primarySystem as CrmSyncPrimarySystem | undefined) ?? null,
          toolNames: config?.toolNames ?? {},
          disconnectedAt: config?.disconnectedAt?.toISOString() ?? null,
          connection: connection ? { id: connection.id, name: connection.name, status: connection.status, enabled: connection.enabled } : null,
          ready: blockers.length === 0,
          blockers,
          links: { linked: count("linked"), conflict: count("conflict"), uncertain: count("uncertain"), error: count("error") },
          openJob: open ? summarize(open) : null,
          lastJob: last ? summarize(last) : null,
          lastSuccessfulSyncAt: lastOk?.finishedAt?.toISOString() ?? null,
        });
      }
      return result;
    },

    /**
     * Starts a sync in the configured direction (a job always follows the company's configuration).
     * The same idempotencyKey returns the same job. Refused with an actionable 422 when the
     * configuration, the connection or the invoker is missing.
     */
    async startJob(companyId: string, provider: CrmSyncProvider, userId: string, idempotencyKey: string): Promise<JobSummary> {
      const config = await loadConfig(companyId, provider);
      const { blockers } = await blockersFor(companyId, provider, config);
      if (!config || blockers.length > 0) throw unprocessable(blockers[0] ?? "La sincronización no está configurada.", { blockers });

      const [prior] = await db
        .select()
        .from(crmSyncJobs)
        .where(and(eq(crmSyncJobs.companyId, companyId), eq(crmSyncJobs.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (prior) {
        if (prior.provider !== provider) throw conflict("That idempotency key belongs to another sync");
        return summarize(await runJob(prior.id));
      }
      const [open] = await db
        .select({ id: crmSyncJobs.id })
        .from(crmSyncJobs)
        .where(and(eq(crmSyncJobs.companyId, companyId), eq(crmSyncJobs.provider, provider), inArray(crmSyncJobs.status, ["queued", "running"])))
        .limit(1);
      if (open) throw conflict("Ya hay una sincronización en curso para este proveedor", { jobId: open.id });

      let job: JobRow | undefined;
      try {
        [job] = await db
          .insert(crmSyncJobs)
          .values({ companyId, provider, direction: config.direction, status: "queued", idempotencyKey, requestedByUserId: userId })
          .returning();
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const [raced] = await db.select().from(crmSyncJobs).where(and(eq(crmSyncJobs.companyId, companyId), eq(crmSyncJobs.idempotencyKey, idempotencyKey))).limit(1);
        job = raced;
      }
      if (!job) throw new Error("Sync job could not be created");
      await logActivity(db, { companyId, actorType: "user", actorId: userId, action: "crm_sync.job_started", entityType: "crm_sync_job", entityId: job.id, details: { provider, direction: config.direction } });
      return summarize(await runJob(job.id));
    },

    /** Continues one unfinished job (queued after its budget, or running with an expired lease). */
    async resumeJob(companyId: string, jobId: string): Promise<JobSummary> {
      const [job] = await db.select().from(crmSyncJobs).where(and(eq(crmSyncJobs.id, jobId), eq(crmSyncJobs.companyId, companyId))).limit(1);
      if (!job) throw notFound("Sync job not found");
      return summarize(await runJob(job.id));
    },

    /** For the scheduler: advances unfinished jobs whose lease is free. Safe to call often. */
    async tick(limit = 3): Promise<number> {
      const t = now().toISOString();
      const rows = await db
        .select({ id: crmSyncJobs.id })
        .from(crmSyncJobs)
        .where(or(eq(crmSyncJobs.status, "queued"), and(eq(crmSyncJobs.status, "running"), sql`${crmSyncJobs.leaseExpiresAt} < ${t}::timestamptz`)))
        .orderBy(asc(crmSyncJobs.createdAt))
        .limit(limit);
      for (const row of rows) await runJob(row.id).catch(() => undefined);
      return rows.length;
    },

    async listJobs(companyId: string, provider?: CrmSyncProvider, limit = 20): Promise<JobSummary[]> {
      const rows = await db
        .select()
        .from(crmSyncJobs)
        .where(and(eq(crmSyncJobs.companyId, companyId), ...(provider ? [eq(crmSyncJobs.provider, provider)] : [])))
        .orderBy(desc(crmSyncJobs.createdAt))
        .limit(Math.min(Math.max(limit, 1), 50));
      return rows.map(summarize);
    },

    async getJob(companyId: string, jobId: string): Promise<JobSummary> {
      const [row] = await db.select().from(crmSyncJobs).where(and(eq(crmSyncJobs.id, jobId), eq(crmSyncJobs.companyId, companyId))).limit(1);
      if (!row) throw notFound("Sync job not found");
      return summarize(row);
    },

    /** Links that need a person: conflicts, uncertain creates and errors. */
    async listAttention(companyId: string, provider?: CrmSyncProvider) {
      const rows = await db
        .select()
        .from(crmSyncLinks)
        .where(and(eq(crmSyncLinks.companyId, companyId), inArray(crmSyncLinks.status, ["conflict", "uncertain", "error"]), ...(provider ? [eq(crmSyncLinks.provider, provider)] : [])))
        .orderBy(desc(crmSyncLinks.updatedAt))
        .limit(100);
      return rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        entityKind: row.entityKind,
        localId: row.localId,
        externalId: row.externalId,
        status: row.status,
        conflict: row.conflict,
        updatedAt: row.updatedAt.toISOString(),
      }));
    },

    /**
     * Settles one link that needs a person.
     * - conflict + keep_local: writes the local record to the provider (needs the connector);
     * - conflict + keep_external: applies the provider values captured when the conflict was found,
     *   only if the local record has not changed since;
     * - uncertain + retry_create: the person checked the provider has no such record; the next job creates it;
     * - uncertain + link_external: the person found the record; its id is linked and reconciled by the next job.
     */
    async resolveLink(
      companyId: string,
      linkId: string,
      input: { resolution: "keep_local" | "keep_external" | "retry_create" | "link_external"; externalId?: string },
      userId: string,
    ) {
      const [link] = await db.select().from(crmSyncLinks).where(and(eq(crmSyncLinks.id, linkId), eq(crmSyncLinks.companyId, companyId))).limit(1);
      if (!link) throw notFound("Sync link not found");
      const provider = link.provider as CrmSyncProvider;
      const kind = link.entityKind as CrmSyncEntityKind;
      const adapter = crmProviderAdapter(provider);

      if (link.status === "uncertain") {
        if (input.resolution === "retry_create") {
          await db.delete(crmSyncLinks).where(and(eq(crmSyncLinks.id, link.id), eq(crmSyncLinks.status, "uncertain")));
        } else if (input.resolution === "link_external") {
          const externalId = input.externalId?.trim();
          if (!externalId) throw unprocessable("Indica el identificador del registro en el proveedor");
          try {
            await patchLink(link.id, { status: "linked", externalId, localHash: null, externalHash: null, conflict: null });
          } catch (error) {
            if (isUniqueViolation(error)) throw conflict("Ese registro del proveedor ya está vinculado a otro registro local");
            throw error;
          }
        } else {
          throw unprocessable("Un vínculo sin confirmar solo admite retry_create o link_external");
        }
      } else if (link.status === "conflict") {
        const snapshot = (link.conflict ?? {}) as { local?: CanonicalFields; external?: CanonicalFields };
        if (input.resolution === "keep_external") {
          if (!snapshot.external || !snapshot.local) throw conflict("The conflict has no captured provider values; run the sync again");
          const current = await loadLocal(companyId, kind, link.localId);
          if (!current) throw conflict("El registro local ya no existe");
          if (sha256(adapter.project(kind, current)) !== sha256(snapshot.local)) {
            throw conflict("El registro local cambió después de detectar el conflicto; sincroniza de nuevo");
          }
          await updateLocal(companyId, provider, kind, link.localId, snapshot.external);
          const after = await loadLocal(companyId, kind, link.localId);
          await patchLink(link.id, {
            status: "linked",
            localHash: sha256(adapter.project(kind, after ?? snapshot.external)),
            externalHash: sha256(adapter.project(kind, snapshot.external)),
            conflict: null,
            lastSyncedAt: now(),
          });
        } else if (input.resolution === "keep_local") {
          if (!options.invoke) throw unprocessable("Este servidor no tiene conectado el invocador de conectores; no se puede escribir en el proveedor.");
          const config = await loadConfig(companyId, provider);
          const { blockers } = await blockersFor(companyId, provider, config);
          if (!config || blockers.length > 0) throw unprocessable(blockers[0] ?? "La sincronización no está configurada.", { blockers });
          if (config.direction === "import") throw unprocessable("La sincronización es solo de importación; no puede escribir en el proveedor.");
          const local = await loadLocal(companyId, kind, link.localId);
          if (!local || !link.externalId) throw conflict("No hay registro local o externo que escribir");
          const [open] = await db.select({ id: crmSyncJobs.id }).from(crmSyncJobs).where(and(
            eq(crmSyncJobs.companyId, companyId), eq(crmSyncJobs.provider, provider), inArray(crmSyncJobs.status, ["queued", "running"]),
          )).limit(1);
          if (open) throw conflict("Ya hay una sincronización en curso para este proveedor", { jobId: open.id });
          const [phase, otherPhase] = kind === "customer" ? ["export:customer", "export:contact"] : ["export:contact", "export:customer"];
          const cursors = { [phase]: null, [otherPhase]: "done", __resolutionTarget: `${kind}:${link.localId}` } as Record<string, string | null>;
          const [resolutionJob] = await db.transaction(async (tx) => {
            const [claimedLink] = await tx.update(crmSyncLinks).set({ status: "linked", localHash: null, updatedAt: now() })
              .where(and(eq(crmSyncLinks.id, link.id), eq(crmSyncLinks.status, "conflict"))).returning({ id: crmSyncLinks.id });
            if (!claimedLink) throw conflict("El conflicto cambió antes de crear el trabajo de resolución");
            const [job] = await tx.insert(crmSyncJobs).values({
              companyId, provider, direction: "export", status: "queued", idempotencyKey: randomUUID(), requestedByUserId: userId, cursors,
            }).returning();
            if (!job) throw new Error("Could not create the durable CRM resolution job");
            return [job] as const;
          });
          await logActivity(db, { companyId, actorType: "user", actorId: userId, action: "crm_sync.resolution_job_started", entityType: "crm_sync_job", entityId: resolutionJob.id, details: { provider, entityKind: kind, linkId: link.id } });
          const completed = await runJob(resolutionJob.id);
          const [after] = await db.select().from(crmSyncLinks).where(eq(crmSyncLinks.id, link.id)).limit(1);
          const resolved = Boolean(after?.status === "linked" && after.localHash === sha256(adapter.project(kind, local)) && after.lastSyncedAt);
          if (!resolved) await patchLink(link.id, { status: "conflict" });
          await logActivity(db, {
            companyId, actorType: "user", actorId: userId, action: resolved ? "crm_sync.link_resolved" : "crm_sync.resolution_pending",
            entityType: "crm_sync_link", entityId: link.id,
            details: { provider, entityKind: kind, resolution: input.resolution, jobId: completed.id, status: completed.status },
          });
          return { id: link.id, resolved, job: completed };
        } else {
          throw unprocessable("Un conflicto solo admite keep_local o keep_external");
        }
      } else {
        throw conflict(`El vínculo está en estado ${link.status} y no necesita resolución`);
      }
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: userId,
        action: "crm_sync.link_resolved",
        entityType: "crm_sync_link",
        entityId: link.id,
        details: { provider, entityKind: kind, resolution: input.resolution },
      });
      return { id: link.id, resolved: true as const };
    },
  };
}

export type CrmSyncService = ReturnType<typeof crmSyncService>;
