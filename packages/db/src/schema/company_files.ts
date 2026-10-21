import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { folders } from "./folders.js";
import { assets } from "./assets.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const companyFiles = pgTable(
  "company_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    audienceKind: text("audience_kind").notNull().default("company"),
    audienceId: uuid("audience_id"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    contextRole: text("context_role"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull().default(0),
    // No FK to company_file_versions to avoid a circular reference; kept consistent by the service layer.
    currentVersionId: uuid("current_version_id"),
    createdByUserId: text("created_by_user_id"),
    updatedByUserId: text("updated_by_user_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAudienceIdx: index("company_files_company_audience_idx").on(table.companyId, table.audienceKind, table.audienceId),
    companyFolderSlugUniqueIdx: uniqueIndex("company_files_company_folder_slug_uq")
      .on(table.companyId, table.folderId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    companyUpdatedIdx: index("company_files_company_updated_idx").on(table.companyId, table.updatedAt),
    companyFolderIdx: index("company_files_company_folder_idx").on(table.companyId, table.folderId),
  }),
);

export const companyFileVersions = pgTable(
  "company_file_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").notNull().references(() => companyFiles.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
    uploadedByUserId: text("uploaded_by_user_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fileVersionUniqueIdx: uniqueIndex("company_file_versions_file_version_uq").on(
      table.fileId,
      table.versionNumber,
    ),
  }),
);

export const companyFileReads = pgTable(
  "company_file_reads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").notNull().references(() => companyFiles.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => companyFileVersions.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyFileIssueIdx: index("company_file_reads_company_file_issue_idx").on(
      table.companyId,
      table.fileId,
      table.issueId,
    ),
  }),
);
