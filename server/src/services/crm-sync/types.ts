// External CRM sync (pista L): shared types. Nothing in this folder pretends a remote write
// happened: a write counts only when the provider answered with a receipt (a record id).

export const CRM_SYNC_PROVIDERS = ["hubspot", "pipedrive"] as const;
export type CrmSyncProvider = (typeof CRM_SYNC_PROVIDERS)[number];

export const CRM_SYNC_ENTITY_KINDS = ["customer", "contact"] as const;
export type CrmSyncEntityKind = (typeof CRM_SYNC_ENTITY_KINDS)[number];

export type CrmSyncDirection = "import" | "export" | "both";
export type CrmSyncPrimarySystem = "paperclip" | "external" | "manual";

export interface CustomerSyncFields {
  name: string;
  domain: string | null;
}

export interface ContactSyncFields {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
}

export type CanonicalFields = CustomerSyncFields | ContactSyncFields;

/** Who is calling the provider. The invoker maps this to the tool gateway's own authority. */
export type CrmConnectorAuthority = {
  kind: "crm_sync_job";
  jobId: string;
  requestedByUserId: string | null;
  leaseAttempt: number;
  task: string;
  cursor: string | null;
  operation: CrmSyncOperation;
  entityKind: CrmSyncEntityKind;
  argumentsHash: string;
  localRecordId: string | null;
};

export interface CrmConnectorCall {
  companyId: string;
  connectionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  authority: CrmConnectorAuthority;
  provider: CrmSyncProvider;
  configId: string;
  configUpdatedAt: string;
}

/** Calls one tool of a company's connection and returns the parsed result. Not wired by default. */
export type CrmConnectorInvoker = (call: CrmConnectorCall) => Promise<unknown>;

export interface ExternalRecord {
  externalId: string;
  /** Provider's own last-modified marker, kept as text for display only; change detection uses hashes. */
  updatedAt: string | null;
  fields: CanonicalFields;
}

export interface ExternalPage {
  records: ExternalRecord[];
  /** Null when there are no more pages. */
  nextCursor: string | null;
}

export interface ProviderReceipt {
  externalId: string;
  updatedAt: string | null;
  /** The record as the provider echoed it, when the receipt carries it. */
  fields: CanonicalFields | null;
}

export type CrmSyncOperation = "list" | "create" | "update";

export interface CrmProviderAdapter {
  provider: CrmSyncProvider;
  /** Upstream tool name for an operation; `overrides` come from the company's sync config. */
  toolName(kind: CrmSyncEntityKind, operation: CrmSyncOperation, overrides: Record<string, string>): string;
  /** Keeps only the fields this provider can store, normalized, so hashes ignore unsupported edits. */
  project(kind: CrmSyncEntityKind, fields: CanonicalFields): CanonicalFields;
  listArguments(kind: CrmSyncEntityKind, cursor: string | null, limit: number): Record<string, unknown>;
  parsePage(kind: CrmSyncEntityKind, response: unknown): ExternalPage;
  writeArguments(kind: CrmSyncEntityKind, externalId: string | null, fields: CanonicalFields): Record<string, unknown>;
  /** Throws CrmProviderResponseError when the answer carries no record id. */
  parseReceipt(kind: CrmSyncEntityKind, response: unknown): ProviderReceipt;
}

/** The provider answered with something this adapter cannot read as a record or a receipt. */
export class CrmProviderResponseError extends Error {
  /** True when the provider itself said the write failed, so nothing was written. */
  readonly definite: boolean;
  constructor(message: string, options: { definite?: boolean } = {}) {
    super(message);
    this.name = "CrmProviderResponseError";
    this.definite = options.definite === true;
  }
}

export interface CrmSyncStats {
  importedCreated: number;
  importedUpdated: number;
  exportedCreated: number;
  exportedUpdated: number;
  unchanged: number;
  skipped: number;
  conflicts: number;
  errors: number;
}

export function emptyStats(): CrmSyncStats {
  return { importedCreated: 0, importedUpdated: 0, exportedCreated: 0, exportedUpdated: 0, unchanged: 0, skipped: 0, conflicts: 0, errors: 0 };
}
