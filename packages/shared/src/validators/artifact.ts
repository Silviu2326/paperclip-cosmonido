import { z } from "zod";

export const COMPANY_ARTIFACTS_DEFAULT_LIMIT = 30;
export const COMPANY_ARTIFACTS_MAX_LIMIT = 100;
export const COMPANY_ARTIFACTS_MAX_QUERY_LENGTH = 160;

export const companyArtifactSourceSchema = z.enum(["document", "attachment", "work_product"]);

export const companyArtifactMediaKindSchema = z.enum(["image", "video", "text", "document", "file", "empty"]);

export const companyArtifactGroupBySchema = z.enum([
  "none",
  "task",
  "parent_task",
  "agent",
  "media_kind",
  "day",
]);

export const companyArtifactSortKeySchema = z.enum(["name", "type", "size", "date", "agent", "task"]);

export const companyArtifactSortDirSchema = z.enum(["asc", "desc"]);

/**
 * Tree node ids: `root`, `projects`, `no_project`, `project:<uuid>`, `issue:<uuid>`.
 */
export const companyArtifactTreeNodeIdSchema = z.string().regex(
  /^(root|projects|no_project|project:[0-9a-fA-F-]{36}|issue:[0-9a-fA-F-]{36})$/,
  "Invalid tree node id",
);

export const companyArtifactsQuerySchema = z.object({
  kind: z.enum(["image", "video", "text", "document", "file", "all"]).optional().default("all"),
  projectId: z.string().guid().optional(),
  /** Only artifacts attributed to this agent (the `createdByAgent` on each result). */
  agentId: z.string().guid().optional(),
  q: z.string().trim().max(COMPANY_ARTIFACTS_MAX_QUERY_LENGTH).optional(),
  groupBy: companyArtifactGroupBySchema.optional().default("none"),
  groupIssueId: z.string().guid().optional(),
  /** Selects one group for the keyed groupings (agent, media_kind, day). */
  groupKey: z.string().trim().min(1).max(64).optional(),
  /** Only artifacts produced by this issue (task). */
  issueId: z.string().guid().optional(),
  sort: companyArtifactSortKeySchema.optional().default("date"),
  dir: companyArtifactSortDirSchema.optional().default("desc"),
  starred: z.preprocess(
    (value) => value === "true" ? true : value === "false" ? false : value,
    z.boolean(),
  ).optional().default(false),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(COMPANY_ARTIFACTS_MAX_LIMIT)
    .optional()
    .default(COMPANY_ARTIFACTS_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});

export const companyArtifactsTreeQuerySchema = z.object({
  node: companyArtifactTreeNodeIdSchema.optional().default("root"),
});

export const companyArtifactSchema = z.object({
  id: z.string().min(1),
  source: companyArtifactSourceSchema,
  mediaKind: companyArtifactMediaKindSchema,
  title: z.string(),
  previewText: z.string().nullable(),
  contentType: z.string().nullable(),
  byteSize: z.number().int().min(0).nullable(),
  contentPath: z.string().nullable(),
  openPath: z.string().nullable(),
  downloadPath: z.string().nullable(),
  issue: z.object({
    id: z.string().guid(),
    identifier: z.string(),
    title: z.string(),
  }),
  project: z.object({
    id: z.string().guid(),
    name: z.string(),
  }).nullable(),
  createdByAgent: z.object({
    id: z.string().guid(),
    name: z.string(),
  }).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  href: z.string().min(1),
});

export const companyArtifactGroupSchema = z.object({
  id: z.string().min(1),
  groupBy: companyArtifactGroupBySchema.exclude(["none"]),
  key: z.string().min(1),
  label: z.string(),
  issue: z.object({
    /** Real issue id for task groupings; the group key for synthetic groupings. */
    id: z.string().min(1),
    identifier: z.string(),
    title: z.string(),
  }),
  title: z.string(),
  count: z.number().int().min(0),
  mediaKinds: z.array(companyArtifactMediaKindSchema),
  previewArtifacts: z.array(companyArtifactSchema),
  updatedAt: z.string().datetime(),
  href: z.string().min(1),
});

export const companyArtifactTreeNodeKindSchema = z.enum(["root", "projects", "no_project", "project", "issue"]);

export const companyArtifactTreeNodeSchema = z.object({
  id: z.string().min(1),
  kind: companyArtifactTreeNodeKindSchema,
  label: z.string(),
  projectId: z.string().nullable(),
  issueId: z.string().nullable(),
  issueIdentifier: z.string().nullable(),
  count: z.number().int().min(0),
  totalByteSize: z.number().min(0),
  updatedAt: z.string().datetime().nullable(),
  mediaKinds: z.array(companyArtifactMediaKindSchema),
  hasChildren: z.boolean(),
});

export const companyArtifactTreeResponseSchema = z.object({
  node: companyArtifactTreeNodeSchema,
  children: z.array(companyArtifactTreeNodeSchema),
});

export const companyArtifactsResponseSchema = z.object({
  artifacts: z.array(companyArtifactSchema),
  groups: z.array(companyArtifactGroupSchema).optional(),
  selectedGroup: companyArtifactGroupSchema.nullable().optional(),
  nextCursor: z.string().nullable(),
});

export type CompanyArtifactsQuery = z.infer<typeof companyArtifactsQuerySchema>;
export type CompanyArtifactsTreeQuery = z.infer<typeof companyArtifactsTreeQuerySchema>;
