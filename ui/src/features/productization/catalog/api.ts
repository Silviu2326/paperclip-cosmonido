import { api } from "@/api/client";
import type { PortablePackage } from "@paperclipai/shared/productization/portable-package";
import { portableCatalogPreviewResponseSchema as previewResponseSchema } from "@paperclipai/shared/productization/portable-package";

export interface PortableCatalogPreviewResponse {
  package: { packageKey: string; packageVersion: string; name: string; description: string };
  compatible: boolean;
  incompatibilities: string[];
  requirements: Array<{ key: string; version: string; status: "resolved" | "unavailable" }>;
  mapping: Array<{ teamId: string; memberId: string; slug: string; role: string; title: string; deploymentMode: "persistent" }>;
  omittedProfileCount: number;
  portabilityPreview: {
    warnings: string[];
    errors: string[];
    plan: { agentPlans: Array<{ slug: string; action: "create" | "update" | "skip"; plannedName: string }> };
  } | null;
}



export type CatalogPackageStatus = "draft" | "in_review" | "published" | "withdrawn";

export interface CatalogPackageSummary {
  id: string;
  companyId: string;
  packageKey: string;
  packageVersion: string;
  status: CatalogPackageStatus;
  name: string;
  description: string;
  contentHash: string;
  privacyAttestedAt: string | null;
  createdByUserId: string | null;
  reviewRequestedAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  publishedByUserId: string | null;
  publishedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts: Record<"teams" | "profiles" | "skills" | "playbooks" | "requestTemplates" | "brandPresets" | "forms" | "meetingTypes" | "connectionRequests", number>;
}

export interface CatalogPackageDetail extends CatalogPackageSummary {
  content: PortablePackage;
}

export interface InstallSkillStatus {
  key: string;
  version: string;
  status: "installed" | "missing" | "unavailable";
  versionId: string | null;
}

export interface InstallPlanProfile {
  localKey: string;
  teamId: string;
  teamName: string;
  memberId: string;
  title: string;
  purpose: string;
  deliveryCriteria: string[];
  suggestedRole: string;
  reportsToLocalKey: string | null;
  skills: InstallSkillStatus[];
  suggestedCostLimit: { amountMinor: number; currency: string } | null;
}

export interface InstallationItemReview {
  teamId: string;
  memberId: string;
  title: string;
  name: string;
  role: string;
  adapterType: string;
  reportsToLocalKey: string | null;
  reportsToExistingAgentId: string | null;
  defaultEnvironmentId: string | null;
  instructionsText: string | null;
  skills: Array<{ key: string; version: string }>;
  acceptPendingSkills: boolean;
}

export type InstallationItemStatus =
  | "planned" | "submitting" | "pending_approval" | "hired" | "unknown" | "blocked" | "cancelled"
  | "creating" | "created" | "conflict";

export type PackageResourceKind = "playbook" | "lead_form" | "brand_preset" | "request_template";
export type InstallationItemKind = "persistent_agent" | PackageResourceKind;

export const PACKAGE_RESOURCE_KIND_LABELS: Record<PackageResourceKind, string> = {
  playbook: "Playbook",
  lead_form: "Formulario de captación",
  brand_preset: "Preset de marca",
  request_template: "Plantilla de encargo",
};

export function isResourceKind(kind: string): kind is PackageResourceKind {
  return kind in PACKAGE_RESOURCE_KIND_LABELS;
}

/** One resource of the package as the server plans it: installable as a draft, or blocked with reasons. */
export interface InstallPlanResource {
  kind: PackageResourceKind;
  localId: string;
  title: string;
  domainIdentity: string;
  installable: boolean;
  blockers: string[];
  notRepresented: string[];
  dependsOn: Array<{ kind: PackageResourceKind; localId: string }>;
}

/** Pinned snapshot of a resource item. `payload` is deliberately not typed: the UI never edits it. */
export interface ResourceItemReview {
  resourceKind: PackageResourceKind;
  localId: string;
  title: string;
  domainIdentity: string;
  references: Array<{ kind: PackageResourceKind; localId: string; domainIdentity: string }>;
  notRepresented: string[];
}

export interface ResourceItemResult {
  domainTable: string;
  resourceId: string;
  domainIdentity: string;
  state: "draft" | "unpublished";
  adopted: boolean;
}

export function isResourceReview(review: InstallationItemReview | ResourceItemReview): review is ResourceItemReview {
  return "resourceKind" in review;
}

export interface InstallationItem {
  id: string;
  installationId: string;
  localKey: string;
  kind: InstallationItemKind;
  status: InstallationItemStatus;
  review: InstallationItemReview | ResourceItemReview;
  resourceId: string | null;
  domainIdentity: string | null;
  result: ResourceItemResult | null;
  agentId: string | null;
  approvalId: string | null;
  claimedAt: string | null;
  resolvedAt: string | null;
  note: string | null;
}

export interface PackageInstallation {
  id: string;
  packageId: string;
  packageKey: string;
  packageVersion: string;
  status: "planned" | "in_progress" | "completed" | "needs_attention" | "cancelled";
  plan: {
    unsupported: Array<{ section: string; count: number; reason: string }>;
    acknowledgedUnsupported: string[];
    skills: InstallSkillStatus[];
    specialists: Array<{ localKey: string; title: string }>;
    /** Absent on receipts written before the resource installer existed. */
    resources?: Array<{ kind: PackageResourceKind; localId: string; title: string; outcome: "selected" | "not_selected" | "not_installable"; blockers: string[] }>;
  };
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  items: InstallationItem[];
}

export interface InstallPlan {
  package: CatalogPackageSummary;
  unsupported: Array<{ section: string; count: number; reason: string }>;
  resources: InstallPlanResource[];
  profiles: InstallPlanProfile[];
  specialists: Array<{ localKey: string; title: string }>;
  installation: PackageInstallation | null;
}

export interface ClaimResult {
  item: InstallationItem;
  hireRequest: Record<string, unknown>;
  endpoint: string;
  /** Stable item-specific value for the `Idempotency-Key` header of the one hire POST. */
  idempotencyKey: string;
}

const catalogBase = (companyId: string) => `/companies/${encodeURIComponent(companyId)}/productization/catalog`;

export const portableCatalogApi = {
  list: (companyId: string) => api.get<CatalogPackageSummary[]>(`${catalogBase(companyId)}/packages`),
  get: (companyId: string, packageId: string) =>
    api.get<CatalogPackageDetail>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}`),
  createDraft: (companyId: string, payload: PortablePackage) =>
    api.post<CatalogPackageDetail>(`${catalogBase(companyId)}/packages`, payload),
  updateDraft: (companyId: string, packageId: string, payload: PortablePackage) =>
    api.put<CatalogPackageDetail>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}`, payload),
  deleteDraft: (companyId: string, packageId: string) =>
    api.delete<unknown>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}`),
  requestReview: (companyId: string, packageId: string) =>
    api.post<CatalogPackageSummary>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}/request-review`, {}),
  returnToDraft: (companyId: string, packageId: string) =>
    api.post<CatalogPackageSummary>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}/return-to-draft`, {}),
  publish: (companyId: string, packageId: string) =>
    api.post<CatalogPackageSummary>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}/publish`, { privacyAttested: true }),
  withdraw: (companyId: string, packageId: string) =>
    api.post<CatalogPackageSummary>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}/withdraw`, {}),
  exportPackage: (companyId: string, packageId: string) =>
    api.get<{ contentHash: string; package: PortablePackage }>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}/export`),
  installPlan: (companyId: string, packageId: string) =>
    api.get<InstallPlan>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}/install-plan`),
  createInstallation: (companyId: string, packageId: string, payload: {
    acknowledgeUnsupported: string[];
    items: InstallationItemReview[];
    resources: Array<{ kind: PackageResourceKind; localId: string }>;
  }) =>
    api.post<{ reused: boolean; installation: PackageInstallation }>(`${catalogBase(companyId)}/packages/${encodeURIComponent(packageId)}/installations`, payload),
  getInstallation: (companyId: string, installationId: string) =>
    api.get<PackageInstallation>(`${catalogBase(companyId)}/installations/${encodeURIComponent(installationId)}`),
  discardInstallation: (companyId: string, installationId: string) =>
    api.delete<unknown>(`${catalogBase(companyId)}/installations/${encodeURIComponent(installationId)}`),
  claimItem: (companyId: string, installationId: string, itemId: string) =>
    api.post<ClaimResult>(`${catalogBase(companyId)}/installations/${encodeURIComponent(installationId)}/items/${encodeURIComponent(itemId)}/claim`, {}),
  /**
   * Resource items only. The server claims the item, creates the draft under its unique identity and links it.
   * Calling it again after a failure or a lost response resumes the same item and can only link the same row.
   */
  installResource: (companyId: string, installationId: string, itemId: string) =>
    api.post<{ item: InstallationItem; outcome: "created" | "adopted" | "already_created" | "conflict" | "creating" }>(
      `${catalogBase(companyId)}/installations/${encodeURIComponent(installationId)}/items/${encodeURIComponent(itemId)}/install`, {}),
  reconcileItem: (companyId: string, installationId: string, itemId: string) =>
    api.post<{ found: boolean; item: InstallationItem }>(`${catalogBase(companyId)}/installations/${encodeURIComponent(installationId)}/items/${encodeURIComponent(itemId)}/reconcile`, {}),
  /** Only valid for an item that was never claimed; claimed items resolve through `reconcileItem` only. */
  cancelItem: (companyId: string, installationId: string, itemId: string) =>
    api.post<InstallationItem>(`${catalogBase(companyId)}/installations/${encodeURIComponent(installationId)}/items/${encodeURIComponent(itemId)}/cancel`, {}),
  /**
   * The single hire POST for a claimed item, to the existing endpoint of the claimed company, with the
   * claim's stable `Idempotency-Key`. Callers must never invoke it twice for the same claim.
   */
  submitHire: (companyId: string, claim: ClaimResult) =>
    api.post<unknown>(`/companies/${encodeURIComponent(companyId)}/agent-hires`, claim.hireRequest, {
      headers: { "Idempotency-Key": claim.idempotencyKey },
    }),
};

export function requestPortableCatalogPreview(companyId: string, payload: PortablePackage, signal: AbortSignal) {
  return api.post<unknown>(
    `/companies/${encodeURIComponent(companyId)}/productization/catalog/preview`,
    payload,
    { signal },
  ).then((response) => {
    const parsed = previewResponseSchema.safeParse(response);
    if (!parsed.success) throw new Error("El servidor devolvió una vista previa con formato no válido.");
    return parsed.data as PortableCatalogPreviewResponse;
  });
}
