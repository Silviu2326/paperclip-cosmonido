import { z } from "zod";

export const companyFileSortKeySchema = z.enum(["name", "type", "size", "date", "uploadedBy", "usedBy"]);

export const companyFileListScopeSchema = z.enum(["folder", "all"]);

export const listCompanyFilesQuerySchema = z.object({
  folderId: z.string().guid().optional(),
  q: z.string().trim().max(200).optional(),
  sort: companyFileSortKeySchema.optional().default("name"),
  dir: z.enum(["asc", "desc"]).optional().default("asc"),
  includeDeleted: z.boolean().optional(),
  /** "folder" (default) lists one folder level, or root when folderId is absent. "all" ignores folderId and lists every folder. */
  scope: companyFileListScopeSchema.optional().default("folder"),
  /** Board users only: files whose createdByUserId is the current user. */
  createdByMe: z.boolean().optional(),
  /** Board users only: files the current user starred. */
  starred: z.boolean().optional(),
});

export const updateCompanyFileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().guid().nullable().optional(),
});

export const createCompanyFileFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().guid().nullable().optional(),
});

export const updateCompanyFileFolderSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().guid().nullable().optional(),
  position: z.number().int().min(0).optional(),
  agentVisible: z.boolean().optional(),
});

export const createCompanyFileFromArtifactSchema = z.object({
  source: z.enum(["attachment", "work_product", "document"]),
  id: z.string().guid(),
  folderId: z.string().guid().nullable().optional(),
  name: z.string().trim().min(1).max(255).optional(),
});

export const updateCompanyFileResourceMembershipSchema = z.object({
  starred: z.boolean(),
}).strict();

export const addCompanyFileVersionNoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type ListCompanyFilesQuery = z.infer<typeof listCompanyFilesQuerySchema>;
export type UpdateCompanyFile = z.infer<typeof updateCompanyFileSchema>;
export type CreateCompanyFileFolder = z.infer<typeof createCompanyFileFolderSchema>;
export type UpdateCompanyFileFolder = z.infer<typeof updateCompanyFileFolderSchema>;
export type CreateCompanyFileFromArtifact = z.infer<typeof createCompanyFileFromArtifactSchema>;
export type AddCompanyFileVersionNote = z.infer<typeof addCompanyFileVersionNoteSchema>;
export type UpdateCompanyFileResourceMembership = z.infer<typeof updateCompanyFileResourceMembershipSchema>;
