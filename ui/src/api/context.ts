import { api } from "./client";
import type { CompanyFile } from "@/api/company-files";

export type ContextRole = "offer" | "brand" | "procedure" | "customer" | "other";
export type ContextFolder = { id: string; name: string; systemKey: string; position: number };
export type ContextFile = Pick<CompanyFile, "id" | "name" | "contentType" | "audienceKind" | "audienceId" | "validUntil" | "contextRole" | "currentVersionId">;
export interface ContextResponse { folders: ContextFolder[]; files: ContextFile[]; truncated: boolean }

export const contextApi = {
  list: (companyId: string, role?: ContextRole, includeExpired = false) => {
    const params = new URLSearchParams({ limit: "50" });
    if (role) params.set("roles", role);
    if (includeExpired) params.set("includeExpired", "true");
    return api.get<ContextResponse>(`/companies/${companyId}/context?${params}`);
  },
};
