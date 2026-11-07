import type {
  ResourceMemberships,
  ResourceMembershipUpdateResult,
  UpdateResourceMembership,
} from "@paperclipai/shared";
import { api } from "./client";

/** What the explorer can star. Documents keep their own endpoint and `starredDocumentIds` list. */
export type ExplorerStarTarget =
  | { kind: "company-file"; fileId: string }
  | { kind: "document"; documentId: string }
  | { kind: "artifact"; source: "attachment" | "work_product"; artifactId: string };

export const resourceMembershipsApi = {
  listMine: (companyId: string) =>
    api.get<ResourceMemberships>(`/companies/${companyId}/resource-memberships/me`),
  updateProject: (companyId: string, projectId: string, data: UpdateResourceMembership) =>
    api.put<ResourceMembershipUpdateResult>(
      `/companies/${companyId}/resource-memberships/me/projects/${projectId}`,
      data,
    ),
  updateAgent: (companyId: string, agentId: string, data: UpdateResourceMembership) =>
    api.put<ResourceMembershipUpdateResult>(
      `/companies/${companyId}/resource-memberships/me/agents/${agentId}`,
      data,
    ),
  updateCompanyFile: (companyId: string, companyFileId: string, data: { starred: boolean }) =>
    api.put<ResourceMembershipUpdateResult>(
      `/companies/${companyId}/resource-memberships/me/company-files/${companyFileId}`,
      data,
    ),
  updateDocument: (companyId: string, documentId: string, data: { starred: boolean }) =>
    api.put<ResourceMembershipUpdateResult>(
      `/companies/${companyId}/resource-memberships/me/documents/${documentId}`,
      data,
    ),
  updateArtifact: (companyId: string, source: "attachment" | "work_product", artifactId: string, data: { starred: boolean }) =>
    api.put<ResourceMembershipUpdateResult>(
      `/companies/${companyId}/resource-memberships/me/artifacts/${source}/${artifactId}`,
      data,
    ),
};
