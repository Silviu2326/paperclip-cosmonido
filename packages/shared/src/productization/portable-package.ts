import { z } from "zod";

/**
 * Safe, declarative package interchange contract. This describes content for a
 * future import draft; it does not represent an installation or grant authority.
 */
const localIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const catalogKeySchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);
const copySchema = z.string().trim().min(1).max(4_000);
const shortCopySchema = z.string().trim().min(1).max(240);
const localRefSchema = z.object({ kind: z.literal("local"), id: localIdSchema }).strict();
const catalogRefSchema = z.object({
  kind: z.literal("catalog"),
  key: catalogKeySchema,
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
}).strict();

export const portablePackageReferenceSchema = z.discriminatedUnion("kind", [
  localRefSchema,
  catalogRefSchema,
]);

export const portablePackageTeamMemberSchema = z.object({
  id: localIdSchema,
  title: shortCopySchema,
  purpose: copySchema,
  deploymentMode: z.enum(["persistent", "assignment_specialist"]),
  deliveryCriteria: z.array(copySchema).max(40),
  suggestedCostLimit: z.object({
    amountMinor: z.number().int().nonnegative().max(100_000_000),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }).strict().nullable(),
  reportsTo: localIdSchema.nullable(),
  skillRefs: z.array(portablePackageReferenceSchema).max(40),
}).strict();

export const portablePackageTeamSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  description: copySchema,
  members: z.array(portablePackageTeamMemberSchema).min(1).max(100),
}).strict();

export const portablePackagePlaybookSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  description: copySchema,
  steps: z.array(z.object({
    id: localIdSchema,
    title: shortCopySchema,
    guidance: copySchema,
    channel: z.enum(["email", "phone", "messaging", "meeting", "internal"]),
    waitDays: z.number().int().min(0).max(365),
    templateRefs: z.array(localRefSchema).max(40),
  }).strict()).min(1).max(100),
}).strict();

export const portablePackageRequestTemplateSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  outcome: copySchema,
  acceptanceCriteria: z.array(copySchema).min(1).max(40),
  expectedDeliverable: shortCopySchema,
  suggestedPlaybookRefs: z.array(portablePackageReferenceSchema).max(40),
}).strict();

export const portablePackageBrandPresetSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  voice: copySchema,
  audience: copySchema,
  preferredTerms: z.array(shortCopySchema).max(100),
  avoidedTerms: z.array(shortCopySchema).max(100),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict();

export const portablePackageFormSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  fields: z.array(z.object({
    id: localIdSchema,
    label: shortCopySchema,
    helpText: z.string().max(1_000).optional(),
    type: z.enum(["text", "long_text", "email", "phone", "url", "choice", "date"]),
    required: z.boolean(),
    choices: z.array(shortCopySchema).max(100).optional(),
  }).strict()).min(1).max(100),
}).strict().superRefine((form, ctx) => {
  const ids = new Set<string>();
  form.fields.forEach((field, index) => {
    if (ids.has(field.id)) {
      ctx.addIssue({ code: "custom", path: ["fields", index, "id"], message: "Duplicate field id" });
    }
    ids.add(field.id);
    if (field.type === "choice") {
      const choices = field.choices ?? [];
      if (choices.length < 2 || new Set(choices).size !== choices.length) {
        ctx.addIssue({ code: "custom", path: ["fields", index, "choices"], message: "Choice fields require at least two unique choices" });
      }
    } else if (field.choices !== undefined) {
      ctx.addIssue({ code: "custom", path: ["fields", index, "choices"], message: "Only choice fields may define choices" });
    }
  });
});

export const portablePackageMeetingTypeSchema = z.object({
  id: localIdSchema,
  name: shortCopySchema,
  description: copySchema,
  durationMinutes: z.number().int().min(5).max(480),
  preparation: z.array(copySchema).max(40),
}).strict();

export const portablePackageConnectionRequestSchema = z.object({
  provider: z.enum(["google_workspace", "hubspot", "pipedrive", "salesforce", "slack", "stripe"]),
  reason: shortCopySchema,
  capabilities: z.array(z.enum([
    "read_calendar", "write_calendar", "read_email", "send_email",
    "read_contacts", "write_contacts", "read_opportunities", "write_opportunities",
    "read_messages", "send_messages", "read_billing",
  ])).min(1).max(11),
}).strict();

/** Version 1 intentionally contains no identity, authority, secret, or executable fields. */
export const portablePackageSchema = z.object({
  format: z.literal("paperclip.portable-package"),
  version: z.literal(1),
  packageKey: catalogKeySchema,
  packageVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
  name: shortCopySchema,
  description: copySchema,
  teams: z.array(portablePackageTeamSchema).max(100),
  skills: z.array(z.object({
    id: localIdSchema,
    catalogKey: catalogKeySchema,
    catalogVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
  }).strict()).max(200),
  playbooks: z.array(portablePackagePlaybookSchema).max(100),
  requestTemplates: z.array(portablePackageRequestTemplateSchema).max(100),
  brandPresets: z.array(portablePackageBrandPresetSchema).max(100),
  forms: z.array(portablePackageFormSchema).max(100),
  meetingTypes: z.array(portablePackageMeetingTypeSchema).max(100),
  connectionRequests: z.array(portablePackageConnectionRequestSchema).max(30),
}).strict().superRefine((value, ctx) => {
  const checkUnique = (ids: string[], path: (string | number)[]) => {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      if (seen.has(id)) ctx.addIssue({ code: "custom", path: [...path, index], message: "Duplicate local id" });
      seen.add(id);
    });
  };
  checkUnique(value.teams.map((item) => item.id), ["teams"]);
  checkUnique(value.skills.map((item) => item.id), ["skills"]);
  checkUnique(value.playbooks.map((item) => item.id), ["playbooks"]);
  checkUnique(value.requestTemplates.map((item) => item.id), ["requestTemplates"]);
  checkUnique(value.brandPresets.map((item) => item.id), ["brandPresets"]);
  checkUnique(value.forms.map((item) => item.id), ["forms"]);
  checkUnique(value.meetingTypes.map((item) => item.id), ["meetingTypes"]);

  const skillIds = new Set(value.skills.map((item) => item.id));
  const playbookIds = new Set(value.playbooks.map((item) => item.id));
  const templateIds = new Set(value.requestTemplates.map((item) => item.id));
  value.teams.forEach((team, teamIndex) => {
    const memberIds = new Set(team.members.map((member) => member.id));
    checkUnique(team.members.map((member) => member.id), ["teams", teamIndex, "members"]);
    const managerByMember = new Map(team.members.map((member) => [member.id, member.reportsTo]));
    team.members.forEach((member, memberIndex) => {
      if (member.reportsTo && !memberIds.has(member.reportsTo)) {
        ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "reportsTo"], message: "Manager must refer to a member of this team" });
      }
      if (member.reportsTo === member.id) {
        ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "reportsTo"], message: "A member cannot report to themselves" });
      }
      const visited = new Set<string>([member.id]);
      let manager = member.reportsTo;
      while (manager) {
        if (visited.has(manager)) {
          ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "reportsTo"], message: "Reporting relationships cannot contain cycles" });
          break;
        }
        visited.add(manager);
        manager = managerByMember.get(manager) ?? null;
      }
      if (member.deploymentMode === "assignment_specialist" && member.deliveryCriteria.length === 0) {
        ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "deliveryCriteria"], message: "Assignment specialists require delivery criteria" });
      }
      member.skillRefs.forEach((ref, refIndex) => {
        if (ref.kind === "local" && !skillIds.has(ref.id)) {
          ctx.addIssue({ code: "custom", path: ["teams", teamIndex, "members", memberIndex, "skillRefs", refIndex], message: "Local skill reference does not resolve" });
        }
      });
    });
  });
  value.playbooks.forEach((playbook, playbookIndex) => {
    checkUnique(playbook.steps.map((step) => step.id), ["playbooks", playbookIndex, "steps"]);
    playbook.steps.forEach((step, stepIndex) => step.templateRefs.forEach((ref, refIndex) => {
      if (!templateIds.has(ref.id)) {
        ctx.addIssue({ code: "custom", path: ["playbooks", playbookIndex, "steps", stepIndex, "templateRefs", refIndex], message: "Request template reference does not resolve" });
      }
    }));
  });
  value.requestTemplates.forEach((template, templateIndex) => template.suggestedPlaybookRefs.forEach((ref, refIndex) => {
    if (ref.kind === "local" && !playbookIds.has(ref.id)) {
      ctx.addIssue({ code: "custom", path: ["requestTemplates", templateIndex, "suggestedPlaybookRefs", refIndex], message: "Local playbook reference does not resolve" });
    }
  }));
  checkUnique(value.skills.map((item) => item.catalogKey), ["skills", "catalogKey"]);
  for (const issue of findPackagePrivacyIssues(value)) {
    ctx.addIssue({ code: "custom", path: issue.path, message: `Package text must not contain ${issue.label}` });
  }
});

/**
 * Publication privacy guard. A package is shareable content: it must carry no credentials, contact
 * details or private identifiers. This is a pattern heuristic over every string value, not a proof that
 * free text is clean, so human review (and the publish attestation) stays mandatory. Messages never echo
 * the offending text.
 */
const PACKAGE_PRIVACY_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "an email address", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/ },
  { label: "a phone number", pattern: /(?:\+\d[\d\s().-]{7,}\d|(?<!\d)\d{3}[\s.-]\d{3}[\s.-]\d{3,4}(?!\d)|(?<!\d)[6-9]\d{8}(?!\d))/ },
  { label: "a private identifier (UUID)", pattern: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/ },
  { label: "a private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "a credential or API token", pattern: /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|\bBearer\s+[A-Za-z0-9._~+/-]{16,}/ },
  { label: "a URL with embedded credentials", pattern: /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i },
  { label: "a URL with a secret query parameter", pattern: /[?&](?:token|access_token|api[_-]?key|secret|password|signature|sig)=/i },
  { label: "a long opaque token", pattern: /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{40,}\b/ },
];

export function findPackagePrivacyIssues(value: unknown): Array<{ path: (string | number)[]; label: string }> {
  const issues: Array<{ path: (string | number)[]; label: string }> = [];
  const visit = (node: unknown, path: (string | number)[]) => {
    if (typeof node === "string") {
      for (const { label, pattern } of PACKAGE_PRIVACY_PATTERNS) {
        if (pattern.test(node)) issues.push({ path, label });
      }
    } else if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, [...path, index]));
    } else if (node !== null && typeof node === "object") {
      for (const [key, entry] of Object.entries(node as Record<string, unknown>)) visit(entry, [...path, key]);
    }
  };
  visit(value, []);
  return issues;
}

export type PortablePackage = z.infer<typeof portablePackageSchema>;
export type PortablePackageConnectionRequest = z.infer<typeof portablePackageConnectionRequestSchema>;

/* ------------------------------------------------------------------------- */
/* Company-private catalog + installation receipt contracts (S4 E).           */
/* ------------------------------------------------------------------------- */

export const PORTABLE_PACKAGE_STATUSES = ["draft", "in_review", "published", "withdrawn"] as const;
export type PortablePackageStatus = (typeof PORTABLE_PACKAGE_STATUSES)[number];

/**
 * Every section name an acknowledgement may carry. The first four were reported as unsupported before
 * the resource installer existed; they stay in the enum only so receipts written earlier still type-check.
 * Only `PACKAGE_NO_INSTALLER_SECTIONS` is reported (and must be acknowledged) today.
 */
export const PACKAGE_UNSUPPORTED_SECTIONS = [
  "playbooks",
  "requestTemplates",
  "brandPresets",
  "forms",
  "meetingTypes",
  "connectionRequests",
  "assignmentSpecialists",
] as const;
export type PackageUnsupportedSection = (typeof PACKAGE_UNSUPPORTED_SECTIONS)[number];

/** Sections with no installer at all. They are reported individually and must be acknowledged explicitly. */
export const PACKAGE_NO_INSTALLER_SECTIONS = ["meetingTypes", "connectionRequests", "assignmentSpecialists"] as const satisfies readonly PackageUnsupportedSection[];

export const PACKAGE_UNSUPPORTED_REASONS: Record<PackageUnsupportedSection, string> = {
  playbooks: "Los playbooks se instalan como borradores seleccionados uno a uno; los que no se pueden representar fielmente se informan por recurso.",
  requestTemplates: "Las plantillas de encargo se instalan como borradores seleccionados uno a uno.",
  brandPresets: "Los presets de marca se instalan como borradores inertes seleccionados uno a uno; nunca se aplican al negocio automáticamente.",
  forms: "Los formularios se instalan como borradores no publicados; los que no caben en los campos del formulario de captación se informan por recurso.",
  meetingTypes: "No existe un instalador de tipos de reunión desde paquetes (requieren horarios, zona horaria y calendario conectado); se conservan solo en el paquete.",
  connectionRequests: "Las conexiones son requisitos informativos: no se crean conexiones, credenciales ni permisos.",
  assignmentSpecialists: "Los especialistas por encargo no tienen ejecución soportada todavía: no se contratan ni se crean como agentes persistentes.",
};

/* ------------------------------------------------------------------------- */
/* Installable resources (playbooks, lead forms, brand presets, request templates) */
/* ------------------------------------------------------------------------- */

export const PACKAGE_RESOURCE_KINDS = ["playbook", "lead_form", "brand_preset", "request_template"] as const;
export type PackageResourceKind = (typeof PACKAGE_RESOURCE_KINDS)[number];

/** Typed kind of an installation item: the agent profile or one of the resource kinds. */
export const PACKAGE_ITEM_KINDS = ["persistent_agent", ...PACKAGE_RESOURCE_KINDS] as const;
export type PackageItemKind = (typeof PACKAGE_ITEM_KINDS)[number];

export function isPackageResourceKind(kind: string): kind is PackageResourceKind {
  return (PACKAGE_RESOURCE_KINDS as readonly string[]).includes(kind);
}

/** Package section that holds each resource kind. */
export const PACKAGE_RESOURCE_SECTION: Record<PackageResourceKind, "playbooks" | "forms" | "brandPresets" | "requestTemplates"> = {
  playbook: "playbooks",
  lead_form: "forms",
  brand_preset: "brandPresets",
  request_template: "requestTemplates",
};

export const packageResourceSelectionSchema = z.object({
  kind: z.enum(PACKAGE_RESOURCE_KINDS),
  localId: localIdSchema,
}).strict();
export type PackageResourceSelection = z.infer<typeof packageResourceSelectionSchema>;

/**
 * Immutable snapshot of what one resource item will create, pinned when the receipt is written:
 * `payload` is the exact domain input, `sourceContentHash` the hash of the resource as it was in the
 * published package, and `domainIdentity` the deterministic key/slug that makes creation recoverable.
 * Nothing here is ever re-derived at install time, so a later code change cannot alter a pinned item.
 */
export const packageResourceItemReviewSchema = z.object({
  resourceKind: z.enum(PACKAGE_RESOURCE_KINDS),
  localId: localIdSchema,
  title: z.string().max(240),
  packageKey: z.string().max(128),
  packageVersion: z.string().max(64),
  packageContentHash: z.string().length(64),
  sourceContentHash: z.string().length(64),
  domainIdentity: z.string().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
  /** Cross references resolved against other selected resources of the same receipt. */
  references: z.array(z.object({
    kind: z.enum(PACKAGE_RESOURCE_KINDS),
    localId: localIdSchema,
    domainIdentity: z.string().min(1).max(120),
  }).strict()).max(100),
  /** Source detail the target cannot store (for example labels); shown before selection, never silent. */
  notRepresented: z.array(z.string().max(240)).max(20),
}).strict();
export type PackageResourceItemReview = z.infer<typeof packageResourceItemReviewSchema>;

export function isPackageResourceReview(
  review: PackageInstallationItemReview | PackageResourceItemReview,
): review is PackageResourceItemReview {
  return "resourceKind" in review;
}

/** Durable mapping from a receipt item to the domain row it produced. */
export interface PackageResourceResult {
  domainTable: "playbooks" | "lead_forms" | "productization_brand_presets" | "productization_request_templates";
  resourceId: string;
  domainIdentity: string;
  /** Always `draft` / unpublished: installing never publishes, sends, connects or grants autonomy. */
  state: "draft" | "unpublished";
  /** True when recovery found the row left by an interrupted attempt and linked it instead of creating it. */
  adopted: boolean;
}

/** Why a resource of the package cannot be installed faithfully. Reported per resource, never skipped silently. */
export interface PackageResourcePlanEntry {
  kind: PackageResourceKind;
  localId: string;
  title: string;
  domainIdentity: string;
  installable: boolean;
  blockers: string[];
  notRepresented: string[];
  dependsOn: Array<{ kind: PackageResourceKind; localId: string }>;
}

export const portablePackageStatusActionSchema = z.object({
  /** Reviewer confirms the package holds no customer data, credentials or private material. */
  privacyAttested: z.literal(true),
  note: z.string().trim().max(1_000).optional(),
}).strict();

export const packageInstallSkillRequirementSchema = z.object({
  key: catalogKeySchema,
  version: z.string().min(1).max(64),
  /** `unavailable`: the exact version does not resolve to a compatible markdown-only catalog entry. */
  status: z.enum(["installed", "missing", "unavailable"]),
  versionId: z.string().uuid().nullable(),
}).strict();
export type PackageInstallSkillRequirement = z.infer<typeof packageInstallSkillRequirementSchema>;

/** Human-reviewed configuration for one persistent profile. Never contains adapter config, secrets or permissions. */
export const packageInstallationItemReviewSchema = z.object({
  teamId: localIdSchema,
  memberId: localIdSchema,
  title: shortCopySchema,
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(40),
  adapterType: z.string().trim().min(1).max(120),
  /** Manager inside the package (`teamId/memberId`); resolved to the created agent at hire time. */
  reportsToLocalKey: z.string().max(130).nullable(),
  /** Manager already existing in the company; mutually exclusive with `reportsToLocalKey`. */
  reportsToExistingAgentId: z.string().uuid().nullable(),
  defaultEnvironmentId: z.string().uuid().nullable(),
  /** Purpose/criteria only become agent instructions when this reviewed text is supplied. */
  instructionsText: z.string().trim().min(1).max(20_000).nullable(),
  skills: z.array(z.object({ key: catalogKeySchema, version: z.string().min(1).max(64) }).strict()).max(40),
  acceptPendingSkills: z.boolean(),
}).strict();
export type PackageInstallationItemReview = z.infer<typeof packageInstallationItemReviewSchema>;

export const packageInstallationPlanSchema = z.object({
  unsupported: z.array(z.object({
    section: z.enum(PACKAGE_UNSUPPORTED_SECTIONS),
    count: z.number().int().nonnegative(),
    reason: z.string(),
  }).strict()),
  acknowledgedUnsupported: z.array(z.enum(PACKAGE_UNSUPPORTED_SECTIONS)),
  skills: z.array(packageInstallSkillRequirementSchema),
  specialists: z.array(z.object({ localKey: z.string(), title: z.string() }).strict()),
  /**
   * Resources of the package as they stood when the receipt was written: selected ones become items,
   * the rest are recorded with the reason they were left out. Absent on receipts written before the
   * resource installer existed.
   */
  resources: z.array(z.object({
    kind: z.enum(PACKAGE_RESOURCE_KINDS),
    localId: localIdSchema,
    title: z.string(),
    outcome: z.enum(["selected", "not_selected", "not_installable"]),
    blockers: z.array(z.string()),
  }).strict()).optional(),
}).strict();
export type PackageInstallationPlan = z.infer<typeof packageInstallationPlanSchema>;

export const createPackageInstallationSchema = z.object({
  /** Must list exactly the unsupported sections the plan reports; nothing is installed silently. */
  acknowledgeUnsupported: z.array(z.enum(PACKAGE_UNSUPPORTED_SECTIONS)).max(PACKAGE_UNSUPPORTED_SECTIONS.length),
  items: z.array(packageInstallationItemReviewSchema).max(100).default([]),
  /** Human selection of resources to install as drafts. Unlisted resources are recorded as not selected. */
  resources: z.array(packageResourceSelectionSchema).max(400).default([]),
}).strict().refine((value) => value.items.length + value.resources.length > 0, {
  message: "Select at least one profile or resource to install.",
  path: ["items"],
});
export type CreatePackageInstallationInput = z.infer<typeof createPackageInstallationSchema>;
export type CreatePackageInstallationRequest = z.input<typeof createPackageInstallationSchema>;

/**
 * Agent items use planned → submitting → pending_approval | hired | unknown (claimed, never released).
 * Resource items use planned → creating → created | conflict. `creating` may be resumed because the
 * domain identity is unique, so a repeat can only link the same row; `conflict` means the identity is
 * held by something that is not the pinned snapshot and is never overwritten.
 */
export const PACKAGE_INSTALLATION_ITEM_STATUSES = [
  "planned", "submitting", "pending_approval", "hired", "unknown", "blocked", "cancelled",
  "creating", "created", "conflict",
] as const;
export type PackageInstallationItemStatus = (typeof PACKAGE_INSTALLATION_ITEM_STATUSES)[number];

/** Sections without any installer that the given package contains. */
export function detectUnsupportedPackageSections(pkg: PortablePackage): Array<{ section: PackageUnsupportedSection; count: number; reason: string }> {
  const counts: Record<(typeof PACKAGE_NO_INSTALLER_SECTIONS)[number], number> = {
    meetingTypes: pkg.meetingTypes.length,
    connectionRequests: pkg.connectionRequests.length,
    assignmentSpecialists: pkg.teams.reduce(
      (sum, team) => sum + team.members.filter((member) => member.deploymentMode === "assignment_specialist").length,
      0,
    ),
  };
  return PACKAGE_NO_INSTALLER_SECTIONS
    .filter((section) => counts[section] > 0)
    .map((section) => ({ section, count: counts[section], reason: PACKAGE_UNSUPPORTED_REASONS[section] }));
}


/** Wire contract for portable catalog previews; consumed by browser and server. */
export const portableCatalogPreviewResponseSchema = z.object({
  package: z.object({ packageKey: z.string(), packageVersion: z.string(), name: z.string(), description: z.string() }).strict(),
  compatible: z.boolean(),
  incompatibilities: z.array(z.string()),
  requirements: z.array(z.object({ key: z.string(), version: z.string(), status: z.enum(["resolved", "unavailable"]) }).strict()),
  mapping: z.array(z.object({ teamId: z.string(), memberId: z.string(), slug: z.string(), role: z.string(), title: z.string(), deploymentMode: z.literal("persistent") }).strict()),
  omittedProfileCount: z.number().int().nonnegative(),
  portabilityPreview: z.object({
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    plan: z.object({ agentPlans: z.array(z.object({ slug: z.string(), action: z.enum(["create", "update", "skip"]), plannedName: z.string() })) }),
  }).passthrough().nullable(),
}).strict();
