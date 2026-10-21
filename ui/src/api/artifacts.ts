import { api } from "./client";
import type {
  CompanyArtifact,
  CompanyArtifactGroupBy,
  CompanyArtifactMediaKind,
  CompanyArtifactSortDir,
  CompanyArtifactSortKey,
  CompanyArtifactTreeResponse,
  CompanyArtifactsResponse,
} from "@paperclipai/shared";

export type {
  CompanyArtifact,
  CompanyArtifactGroup,
  CompanyArtifactGroupBy as ArtifactGroupBy,
  CompanyArtifactMediaKind as ArtifactMediaKind,
  CompanyArtifactsResponse,
  CompanyArtifactSource as ArtifactSource,
  CompanyArtifactSortKey,
  CompanyArtifactSortDir,
  CompanyArtifactTreeNode,
  CompanyArtifactTreeResponse,
} from "@paperclipai/shared";

/**
 * Company-level Artifacts client (PAP-10359).
 *
 * Talks to the company-scoped artifacts projection endpoint
 * (`GET /api/companies/:companyId/artifacts`) defined by the approved
 * Artifacts plan (PAP-10353). The endpoint flattens agent-produced issue
 * documents, direct attachments, and `artifact` work products into a single
 * card-ready list so the UI never has to stitch issue-specific endpoints
 * together.
 *
 * The `CompanyArtifact` shape is imported from `@paperclipai/shared` so the
 * frontend and server stay synchronized as the contract evolves.
 */

export type ArtifactKindFilter = Exclude<CompanyArtifactMediaKind, "empty"> | "all";

export interface ListArtifactsParams {
  kind?: ArtifactKindFilter;
  projectId?: string;
  /** Only artifacts attributed to this agent. */
  agentId?: string;
  q?: string;
  /** Grouping mode. `none` (default) returns the flat artifact grid. */
  groupBy?: CompanyArtifactGroupBy;
  /** When grouping, selects a single stack to expand into its artifacts. */
  groupIssueId?: string;
  /** Keyed groupings (agent, media_kind, day): selects one group's artifacts. */
  groupKey?: string;
  /** Only artifacts produced by this issue (folder listing for a tree node). */
  issueId?: string;
  /** Sort key for the flat list. Server default is `date`. */
  sort?: CompanyArtifactSortKey;
  /** Sort direction. Server default is `desc`. */
  dir?: CompanyArtifactSortDir;
  /** Only artifacts the current viewer has starred (documents, attachments and work products). */
  starred?: boolean;
  limit?: number;
  cursor?: string;
}

function buildArtifactsQuery(params?: ListArtifactsParams): string {
  const search = new URLSearchParams();
  if (params?.kind && params.kind !== "all") search.set("kind", params.kind);
  if (params?.projectId) search.set("projectId", params.projectId);
  if (params?.agentId) search.set("agentId", params.agentId);
  if (params?.q) search.set("q", params.q);
  if (params?.groupBy && params.groupBy !== "none") search.set("groupBy", params.groupBy);
  if (params?.groupIssueId) search.set("groupIssueId", params.groupIssueId);
  if (params?.groupKey) search.set("groupKey", params.groupKey);
  if (params?.issueId) search.set("issueId", params.issueId);
  if (params?.sort && params.sort !== "date") search.set("sort", params.sort);
  if (params?.dir && params.dir !== "desc") search.set("dir", params.dir);
  if (params?.starred) search.set("starred", "true");
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Normalize the endpoint response. The contract is an envelope
 * (`{ artifacts, groups?, selectedGroup?, nextCursor }`), but we also tolerate a
 * bare array so the page keeps working if the backend ships the simpler shape.
 */
function normalizeArtifactsResponse(
  raw: CompanyArtifactsResponse | CompanyArtifact[],
): CompanyArtifactsResponse {
  if (Array.isArray(raw)) {
    return { artifacts: raw, nextCursor: null };
  }
  return {
    artifacts: raw.artifacts ?? [],
    groups: raw.groups,
    selectedGroup: raw.selectedGroup,
    nextCursor: raw.nextCursor ?? null,
  };
}

/** ZIP of every artifact under a Salida node (`issue:<id>` or `project:<id>`, board only). */
export function companyArtifactsArchivePath(companyId: string, node: string): string {
  const search = new URLSearchParams({ node });
  return `/api/companies/${companyId}/artifacts/archive?${search.toString()}`;
}

export const artifactsApi = {
  list: async (companyId: string, params?: ListArtifactsParams): Promise<CompanyArtifactsResponse> => {
    const raw = await api.get<CompanyArtifactsResponse | CompanyArtifact[]>(
      `/companies/${companyId}/artifacts${buildArtifactsQuery(params)}`,
    );
    return normalizeArtifactsResponse(raw);
  },
  /** Folder tree node and its direct children (`root`, `projects`, `no_project`, `project:<id>`, `issue:<id>`). */
  tree: async (companyId: string, node = "root"): Promise<CompanyArtifactTreeResponse> => {
    const search = new URLSearchParams({ node });
    return api.get<CompanyArtifactTreeResponse>(`/companies/${companyId}/artifacts/tree?${search.toString()}`);
  },
};
