export type CompanyArtifactSource = "document" | "attachment" | "work_product";

export type CompanyArtifactMediaKind = "image" | "video" | "text" | "document" | "file" | "empty";

export type CompanyArtifactGroupBy =
  | "none"
  | "task"
  | "parent_task"
  | "agent"
  | "media_kind"
  | "day";

/** Sort keys for the flat artifact list. `date` is updatedAt; default is date desc. */
export type CompanyArtifactSortKey = "name" | "type" | "size" | "date" | "agent" | "task";

export type CompanyArtifactSortDir = "asc" | "desc";

export interface CompanyArtifactIssueSummary {
  id: string;
  identifier: string;
  title: string;
}

export interface CompanyArtifactProjectSummary {
  id: string;
  name: string;
}

export interface CompanyArtifactAgentSummary {
  id: string;
  name: string;
}

export interface CompanyArtifact {
  /** Studio identity and the exact review target for the selected version. */
  assetId?: string | null;
  mediaProjectId?: string | null;
  reviewTargetId?: string | null;
  id: string;
  source: CompanyArtifactSource;
  mediaKind: CompanyArtifactMediaKind;
  title: string;
  previewText: string | null;
  contentType: string | null;
  /** Size in bytes when known (attachments: asset size; documents: UTF-8 body length; work products: metadata.byteSize). */
  byteSize: number | null;
  contentPath: string | null;
  openPath: string | null;
  downloadPath: string | null;
  /** Thumbnail URL (320px WebP) for image attachments and work products; null otherwise. */
  thumbnailPath: string | null;
  issue: CompanyArtifactIssueSummary;
  project: CompanyArtifactProjectSummary | null;
  createdByAgent: CompanyArtifactAgentSummary | null;
  /** When the underlying record was created. */
  createdAt: string;
  updatedAt: string;
  href: string;
}

export interface CompanyArtifactGroup {
  id: string;
  groupBy: Exclude<CompanyArtifactGroupBy, "none">;
  /**
   * Stable group key: issue id for task / parent_task; agent id (or "none") for
   * agent; media kind for media_kind; YYYY-MM-DD for day.
   */
  key: string;
  /** Human label for the group. */
  label: string;
  /**
   * Issue summary. For task / parent_task this is the real issue. For agent,
   * media_kind and day groupings it is synthetic: `{ id: key, identifier: "", title: label }`.
   */
  issue: CompanyArtifactIssueSummary;
  title: string;
  count: number;
  mediaKinds: CompanyArtifactMediaKind[];
  previewArtifacts: CompanyArtifact[];
  updatedAt: string;
  href: string;
}

export interface CompanyArtifactsResponse {
  artifacts: CompanyArtifact[];
  groups?: CompanyArtifactGroup[];
  selectedGroup?: CompanyArtifactGroup | null;
  nextCursor: string | null;
}

export type CompanyArtifactTreeNodeKind = "root" | "projects" | "no_project" | "project" | "issue";

export interface CompanyArtifactTreeNode {
  /** `root`, `projects`, `no_project`, `project:<id>` or `issue:<id>`. */
  id: string;
  kind: CompanyArtifactTreeNodeKind;
  label: string;
  projectId: string | null;
  issueId: string | null;
  issueIdentifier: string | null;
  count: number;
  totalByteSize: number;
  updatedAt: string | null;
  mediaKinds: CompanyArtifactMediaKind[];
  hasChildren: boolean;
}

export interface CompanyArtifactTreeResponse {
  node: CompanyArtifactTreeNode;
  children: CompanyArtifactTreeNode[];
}
