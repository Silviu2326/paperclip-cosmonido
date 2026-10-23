import type { ContextRole } from "@/api/context";
import type { CompanyFile, UpdateCompanyFileInput } from "@/api/company-files";

/**
 * Context properties of an Entrada file (role, audience, validity). The explorer
 * edits them in the file's properties panel and filters by them; there is no
 * separate context store.
 */
export const CONTEXT_ROLES: Array<{ role: ContextRole; labelKey: string; defaultLabel: string }> = [
  { role: "offer", labelKey: "context.roles.offer", defaultLabel: "Oferta" },
  { role: "brand", labelKey: "context.roles.brand", defaultLabel: "Marca" },
  { role: "procedure", labelKey: "context.roles.procedure", defaultLabel: "Procedimientos" },
  { role: "customer", labelKey: "context.roles.customer", defaultLabel: "Clientes" },
  { role: "other", labelKey: "context.roles.other", defaultLabel: "Otros" },
];

export type ContextAudienceKind = "company" | "project";

/** A requested project is only accepted when it is in the active company's project list. */
export function authorizedContextProjectId(projectId: string | null, projects: Array<{ id: string }> | undefined) {
  return projectId && projects?.some(project => project.id === projectId) ? projectId : null;
}

/* ---------- filter (URL <-> state) ---------- */

export type ContextValidity = "all" | "active" | "expired";
export type ContextAudienceFilter = "any" | "company" | "project" | "customer";

export interface ContextFilter {
  role: ContextRole | "any";
  validity: ContextValidity;
  audience: ContextAudienceFilter;
  /** Only meaningful with `audience: "project"`; unauthorized ids are dropped by the caller. */
  projectId: string | null;
}

const ROLE_VALUES: readonly string[] = CONTEXT_ROLES.map(item => item.role);
const AUDIENCE_VALUES: readonly string[] = ["company", "project", "customer"];

/** `?context=1` turns the Entrada listing into the context view; the other params narrow it. */
export function parseContextFilter(params: URLSearchParams): ContextFilter | null {
  if (params.get("context") !== "1") return null;
  const role = params.get("role");
  const validity = params.get("validity");
  const projectId = params.get("projectId");
  const audience = params.get("audience");
  return {
    role: role && ROLE_VALUES.includes(role) ? (role as ContextRole) : "any",
    validity: validity === "active" || validity === "expired" ? validity : "all",
    // A bare ?projectId (the link from a project) means "that project's audience".
    audience: audience && AUDIENCE_VALUES.includes(audience)
      ? (audience as ContextAudienceFilter)
      : projectId ? "project" : "any",
    projectId: projectId || null,
  };
}

/** URL patch for a filter; defaults are removed so the URL stays short. */
export function contextFilterParams(filter: ContextFilter): Record<string, string | null> {
  return {
    context: "1",
    role: filter.role === "any" ? null : filter.role,
    validity: filter.validity === "all" ? null : filter.validity,
    audience: filter.audience === "any" ? null : filter.audience,
    projectId: filter.audience === "project" ? filter.projectId : null,
  };
}

export function isExpired(file: Pick<CompanyFile, "validUntil">, now: Date): boolean {
  return Boolean(file.validUntil) && new Date(file.validUntil!) < now;
}

/** Files that carry a context role and match the filter. Pure: the caller supplies `now`. */
export function applyContextFilter(files: CompanyFile[], filter: ContextFilter, now: Date): CompanyFile[] {
  return files.filter(file => {
    if (file.contextRole === null) return false;
    if (filter.role !== "any" && file.contextRole !== filter.role) return false;
    if (filter.validity === "expired" && !isExpired(file, now)) return false;
    if (filter.validity === "active" && isExpired(file, now)) return false;
    if (filter.audience !== "any" && file.audienceKind !== filter.audience) return false;
    if (filter.audience === "project" && filter.projectId && file.audienceId !== filter.projectId) return false;
    return true;
  });
}

/* ---------- editing ---------- */

export interface ContextPropertiesDraft {
  role: ContextRole | null;
  audienceKind: ContextAudienceKind;
  audienceId: string;
  /** `yyyy-mm-dd` from a date input, or empty. */
  validUntil: string;
}

export function dateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Draft for the editor from a file. A customer audience is kept as is until the user changes it. */
export function draftFromFile(file: Pick<CompanyFile, "contextRole" | "audienceKind" | "audienceId" | "validUntil">): ContextPropertiesDraft {
  return {
    role: file.contextRole,
    audienceKind: file.audienceKind === "project" ? "project" : "company",
    audienceId: file.audienceKind === "project" ? file.audienceId ?? "" : "",
    validUntil: dateInputValue(file.validUntil),
  };
}

/** `null` when the draft cannot be saved yet (a project audience without a project). */
export function updateInputFromDraft(draft: ContextPropertiesDraft): UpdateCompanyFileInput | null {
  if (draft.audienceKind === "project" && !draft.audienceId) return null;
  return {
    contextRole: draft.role,
    audienceKind: draft.audienceKind,
    audienceId: draft.audienceKind === "project" ? draft.audienceId : null,
    validUntil: draft.validUntil ? new Date(draft.validUntil) : null,
  };
}

/**
 * Update payload for saving `draft` over `file`. A customer audience (not editable here) is left
 * out of the payload unless the user picked another audience, so saving a role never rewrites it.
 */
export function buildFileUpdate(file: Parameters<typeof draftFromFile>[0], draft: ContextPropertiesDraft): UpdateCompanyFileInput | null {
  const input = updateInputFromDraft(draft);
  if (!input) return null;
  const keepsCustomerAudience = file.audienceKind === "customer" && draft.audienceKind === "company" && draft.audienceId === "";
  if (keepsCustomerAudience) {
    delete input.audienceKind;
    delete input.audienceId;
  }
  return input;
}

/** Whether saving the draft would change the file. Customer audiences count as unchanged. */
export function draftChanged(file: Parameters<typeof draftFromFile>[0], draft: ContextPropertiesDraft): boolean {
  const base = draftFromFile(file);
  const sameAudience = file.audienceKind === "customer"
    ? draft.audienceKind === "company" && draft.audienceId === ""
    : base.audienceKind === draft.audienceKind && base.audienceId === draft.audienceId;
  return base.role !== draft.role || base.validUntil !== draft.validUntil || !sameAudience;
}
