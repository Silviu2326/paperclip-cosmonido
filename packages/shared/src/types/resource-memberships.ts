export const RESOURCE_MEMBERSHIP_STATES = ["joined", "left"] as const;

export type ResourceMembershipState = (typeof RESOURCE_MEMBERSHIP_STATES)[number];
export type ResourceMembershipResourceType = "project" | "agent" | "document" | "company_file" | "artifact";

/** Salida artifacts that are not documents. The artifact ref is "<source>:<id>". */
export const ARTIFACT_MEMBERSHIP_SOURCES = ["attachment", "work_product"] as const;
export type ArtifactMembershipSource = (typeof ARTIFACT_MEMBERSHIP_SOURCES)[number];

export interface ResourceMemberships {
  projectMemberships: Record<string, ResourceMembershipState>;
  agentMemberships: Record<string, ResourceMembershipState>;
  starredProjectIds?: string[];
  starredAgentIds?: string[];
  starredDocumentIds: string[];
  projectStarredAt?: Record<string, Date>;
  agentStarredAt?: Record<string, Date>;
  documentStarredAt: Record<string, string>;
  /** Entrada company files starred by this user. */
  starredCompanyFileIds: string[];
  companyFileStarredAt: Record<string, string>;
  /** Salida attachments and work products starred by this user, as "<source>:<id>". */
  starredArtifactRefs: string[];
  artifactStarredAt: Record<string, string>;
  updatedAt: Date | null;
}

export interface UpdateResourceMembership {
  state?: ResourceMembershipState;
  starred?: boolean;
}

export interface ResourceMembershipUpdateResult {
  resourceType: ResourceMembershipResourceType;
  resourceId: string;
  state: ResourceMembershipState;
  starredAt: Date | null;
  updatedAt: Date;
}
