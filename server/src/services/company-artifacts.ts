import { buffer } from "node:stream/consumers";
import { and, desc, eq, inArray, isNotNull, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@paperclipai/db";
import {
  agents,
  assets,
  companies,
  artifactMemberships,
  documentMemberships,
  documents,
  heartbeatRuns,
  issueAttachments,
  issueDocuments,
  issues,
  issueWorkProducts,
  projects,
} from "@paperclipai/db";
import {
  attachmentArtifactWorkProductMetadataSchema,
  COMPANY_ARTIFACTS_MAX_LIMIT,
  companyArtifactsQuerySchema,
  companyArtifactsTreeQuerySchema,
  SYSTEM_ISSUE_DOCUMENT_KEYS,
  type CompanyArtifact,
  type CompanyArtifactGroup,
  type CompanyArtifactGroupBy,
  type CompanyArtifactMediaKind,
  type CompanyArtifactSortDir,
  type CompanyArtifactSortKey,
  type CompanyArtifactTreeNode,
  type CompanyArtifactTreeResponse,
  type CompanyArtifactsQuery,
  type CompanyArtifactsResponse,
  type CompanyArtifactsTreeQuery,
} from "@paperclipai/shared";
import { badRequest, notFound, payloadTooLarge, unprocessable } from "../errors.js";
import type { StorageService } from "../storage/types.js";
import { isThumbnailableContentType } from "./thumbnails.js";
import {
  ARCHIVE_MAX_TOTAL_BYTES,
  archiveTotalBytes,
  safeZipSegment,
  uniqueZipPath,
  type ZipEntry,
} from "./zip-archive.js";

const TEXT_PREVIEW_BYTES = 4096;
const PREVIEW_TEXT_MAX_LENGTH = 280;
const GROUP_PREVIEW_ARTIFACT_LIMIT = 3;
const GROUPED_ARTIFACT_FETCH_LIMIT = COMPANY_ARTIFACTS_MAX_LIMIT * 10;

type ArtifactCursor = {
  updatedAt: string;
  id: string;
};

type ArtifactGroupBy = Exclude<CompanyArtifactGroupBy, "none">;

type IssueGroupingRow = {
  id: string;
  parentId: string | null;
  identifier: string | null;
  title: string;
  updatedAt: Date;
};

function encodeCursor(cursor: ArtifactCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): ArtifactCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<ArtifactCursor>;
    if (typeof parsed.id !== "string" || typeof parsed.updatedAt !== "string") {
      throw new Error("Invalid cursor");
    }
    const date = new Date(parsed.updatedAt);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid cursor date");
    }
    return { id: parsed.id, updatedAt: date.toISOString() };
  } catch {
    throw badRequest("Invalid artifacts cursor");
  }
}

function cursorCondition(updatedAt: SQL<Date>, artifactId: SQL<string>, cursor: ArtifactCursor | null) {
  if (!cursor) return undefined;
  return sql`(${updatedAt} < ${cursor.updatedAt}::timestamptz OR (${updatedAt} = ${cursor.updatedAt}::timestamptz AND ${artifactId} < ${cursor.id}))`;
}

function isAfterCursor(item: { updatedAt: string; id: string }, cursor: ArtifactCursor | null) {
  if (!cursor) return true;
  const dateDiff = Date.parse(item.updatedAt) - Date.parse(cursor.updatedAt);
  return dateDiff < 0 || (dateDiff === 0 && item.id < cursor.id);
}

/**
 * Sort cursors (non-default `sort` / `dir`) are keyset tuples `{v, id, s, d}`.
 * They are applied in memory over the candidate window fetched per source
 * (GROUPED_ARTIFACT_FETCH_LIMIT rows each), so they page correctly within that
 * window. The default date-desc flat list keeps the original SQL cursor path.
 */
type SortValue = string | number;

type SortCursor = {
  v: SortValue;
  id: string;
  s: CompanyArtifactSortKey;
  d: CompanyArtifactSortDir;
};

function isDefaultSort(sort: CompanyArtifactSortKey, dir: CompanyArtifactSortDir) {
  return sort === "date" && dir === "desc";
}

function encodeSortCursor(cursor: SortCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeSortCursor(
  cursor: string | undefined,
  sort: CompanyArtifactSortKey,
  dir: CompanyArtifactSortDir,
): SortCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<SortCursor>;
    if (
      typeof parsed.id !== "string"
      || (typeof parsed.v !== "string" && typeof parsed.v !== "number")
      || parsed.s !== sort
      || parsed.d !== dir
    ) {
      throw new Error("Invalid sort cursor");
    }
    return { v: parsed.v, id: parsed.id, s: sort, d: dir };
  } catch {
    throw badRequest("Invalid artifacts cursor");
  }
}

function compareSortValues(a: SortValue, b: SortValue) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function artifactSortValue(
  artifact: CompanyArtifact,
  sort: CompanyArtifactSortKey,
  sortDates: Map<string, string>,
): SortValue {
  switch (sort) {
    case "name":
      return artifact.title;
    case "type":
      return `${artifact.mediaKind}/${artifact.contentType ?? ""}`;
    case "size":
      return artifact.byteSize ?? -1;
    case "date":
      return Date.parse(sortDates.get(artifact.id) ?? artifact.updatedAt);
    case "agent":
      return artifact.createdByAgent?.name ?? "";
    case "task":
      return artifact.issue.identifier;
  }
}

function compareSortOrder(
  aValue: SortValue,
  aId: string,
  bValue: SortValue,
  bId: string,
  dir: CompanyArtifactSortDir,
) {
  const valueDiff = compareSortValues(aValue, bValue);
  const diff = valueDiff !== 0 ? valueDiff : (aId < bId ? -1 : aId > bId ? 1 : 0);
  return dir === "asc" ? diff : -diff;
}

function sortArtifactsBy(
  artifacts: CompanyArtifact[],
  sort: CompanyArtifactSortKey,
  dir: CompanyArtifactSortDir,
  sortDates: Map<string, string>,
) {
  return [...artifacts].sort((a, b) =>
    compareSortOrder(artifactSortValue(a, sort, sortDates), a.id, artifactSortValue(b, sort, sortDates), b.id, dir)
  );
}

function pageBySortCursor(
  artifacts: CompanyArtifact[],
  limit: number,
  cursor: SortCursor | null,
  sort: CompanyArtifactSortKey,
  dir: CompanyArtifactSortDir,
  sortDates: Map<string, string>,
) {
  const ordered = sortArtifactsBy(artifacts, sort, dir, sortDates);
  const filtered = cursor
    ? ordered.filter((item) =>
      compareSortOrder(artifactSortValue(item, sort, sortDates), item.id, cursor.v, cursor.id, dir) > 0
    )
    : ordered;
  const page = filtered.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = filtered.length > limit && last
    ? encodeSortCursor({ v: artifactSortValue(last, sort, sortDates), id: last.id, s: sort, d: dir })
    : null;
  return { page, nextCursor };
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function normalizePreviewText(input: string | null | undefined) {
  if (!input) return null;
  const stripped = input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_\-~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;
  return stripped.length > PREVIEW_TEXT_MAX_LENGTH
    ? `${stripped.slice(0, PREVIEW_TEXT_MAX_LENGTH - 3).trimEnd()}...`
    : stripped;
}

function classifyMediaKind(contentType: string | null | undefined, fallback: CompanyArtifactMediaKind = "file") {
  const normalized = (contentType ?? "").toLowerCase();
  if (!normalized) return fallback;
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized.endsWith("+json") ||
    normalized === "application/xml" ||
    normalized.endsWith("+xml") ||
    normalized === "application/markdown"
  ) {
    return "text";
  }
  return "file";
}

function contentTypeKindCondition(contentTypeExpression: SQL<string>, kind: CompanyArtifactsQuery["kind"]) {
  if (!kind || kind === "all") return undefined;
  if (kind === "image") return sql`${contentTypeExpression} ILIKE 'image/%'`;
  if (kind === "video") return sql`${contentTypeExpression} ILIKE 'video/%'`;
  if (kind === "text") {
    return sql`(${contentTypeExpression} ILIKE 'text/%' OR ${contentTypeExpression} IN ('application/json', 'application/xml', 'application/markdown') OR ${contentTypeExpression} ILIKE '%+json' OR ${contentTypeExpression} ILIKE '%+xml')`;
  }
  if (kind === "file") {
    return sql`NOT (${contentTypeExpression} ILIKE 'image/%' OR ${contentTypeExpression} ILIKE 'video/%' OR ${contentTypeExpression} ILIKE 'text/%' OR ${contentTypeExpression} IN ('application/json', 'application/xml', 'application/markdown') OR ${contentTypeExpression} ILIKE '%+json' OR ${contentTypeExpression} ILIKE '%+xml')`;
  }
  return undefined;
}

function buildIssueHref(companyPrefix: string, identifier: string, anchor: string) {
  return `/${encodeURIComponent(companyPrefix)}/issues/${encodeURIComponent(identifier)}#${anchor}`;
}

function buildArtifactsGroupHref(
  companyPrefix: string,
  query: CompanyArtifactsQuery,
  groupBy: ArtifactGroupBy,
  groupIssueId: string,
) {
  const params = new URLSearchParams();
  params.set("groupBy", groupBy);
  params.set("groupIssueId", groupIssueId);
  if (query.kind !== "all") params.set("kind", query.kind);
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.agentId) params.set("agentId", query.agentId);
  if (query.q) params.set("q", query.q);
  return `/${encodeURIComponent(companyPrefix)}/artifacts?${params.toString()}`;
}

function attachmentContentPath(attachmentId: string) {
  return `/api/attachments/${attachmentId}/content`;
}

function attachmentThumbnailPath(attachmentId: string, contentType: string | null | undefined) {
  return isThumbnailableContentType(contentType) ? `/api/attachments/${attachmentId}/thumbnail` : null;
}

const ATTACHMENT_ID_IN_CONTENT_PATH = /^\/api\/attachments\/([0-9a-f-]{36})\/content$/i;

async function readTextAttachmentPreview(
  storage: StorageService | undefined,
  input: { companyId: string; objectKey: string; byteSize: number },
) {
  if (!storage || input.byteSize <= 0) return null;
  try {
    const object = await storage.getObject(input.companyId, input.objectKey, {
      range: { start: 0, end: Math.min(input.byteSize, TEXT_PREVIEW_BYTES) - 1 },
    });
    const body = await buffer(object.stream);
    return normalizePreviewText(body.toString("utf8"));
  } catch {
    return null;
  }
}

function sortArtifacts(artifacts: CompanyArtifact[], sortDates = new Map<string, string>()) {
  return artifacts.sort((a, b) => {
    const dateDiff = Date.parse(sortDates.get(b.id) ?? b.updatedAt)
      - Date.parse(sortDates.get(a.id) ?? a.updatedAt);
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id);
  });
}

function pageByCursor<T extends { id: string; updatedAt: string }>(
  items: T[],
  limit: number,
  cursor: ArtifactCursor | null,
) {
  const filtered = items.filter((item) => isAfterCursor(item, cursor));
  const page = filtered.slice(0, limit);
  const nextCursor = filtered.length > limit
    ? encodeCursor({ id: page[page.length - 1]?.id ?? "", updatedAt: page[page.length - 1]?.updatedAt ?? new Date(0).toISOString() })
    : null;
  return { page, nextCursor };
}

async function loadIssueGroupingRows(db: Db, companyId: string, seedIssueIds: Iterable<string>) {
  const rowsById = new Map<string, IssueGroupingRow>();
  let pending = [...new Set(seedIssueIds)];

  while (pending.length > 0) {
    const rows = await db
      .select({
        id: issues.id,
        parentId: issues.parentId,
        identifier: issues.identifier,
        title: issues.title,
        updatedAt: issues.updatedAt,
      })
      .from(issues)
      .where(and(eq(issues.companyId, companyId), inArray(issues.id, pending)));

    const nextPending = new Set<string>();
    for (const row of rows) {
      rowsById.set(row.id, row);
      if (row.parentId && !rowsById.has(row.parentId)) {
        nextPending.add(row.parentId);
      }
    }
    pending = [...nextPending];
  }

  return rowsById;
}

function getIssueSummary(issue: IssueGroupingRow) {
  return {
    id: issue.id,
    identifier: issue.identifier ?? issue.id,
    title: issue.title,
  };
}

function resolveRootIssueId(issueId: string, issueRows: Map<string, IssueGroupingRow>) {
  let current = issueRows.get(issueId);
  if (!current) return issueId;
  const seen = new Set<string>();
  while (current.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = issueRows.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

function resolveGroupIssueId(groupBy: ArtifactGroupBy, issueId: string, issueRows: Map<string, IssueGroupingRow>) {
  return groupBy === "task" ? issueId : resolveRootIssueId(issueId, issueRows);
}

function emptyGroup(input: {
  companyPrefix: string;
  query: CompanyArtifactsQuery;
  groupBy: ArtifactGroupBy;
  issue: IssueGroupingRow;
}): CompanyArtifactGroup {
  const summary = getIssueSummary(input.issue);
  return {
    id: `${input.groupBy}:${input.issue.id}`,
    groupBy: input.groupBy,
    key: summary.id,
    label: summary.title,
    issue: summary,
    title: summary.title,
    count: 0,
    mediaKinds: [],
    previewArtifacts: [],
    updatedAt: input.issue.updatedAt.toISOString(),
    href: buildArtifactsGroupHref(input.companyPrefix, input.query, input.groupBy, input.issue.id),
  };
}

function buildArtifactGroups(input: {
  artifacts: CompanyArtifact[];
  companyPrefix: string;
  query: CompanyArtifactsQuery;
  groupBy: ArtifactGroupBy;
  issueRows: Map<string, IssueGroupingRow>;
}) {
  const groups = new Map<string, CompanyArtifactGroup>();

  for (const artifact of input.artifacts) {
    const groupIssueId = resolveGroupIssueId(input.groupBy, artifact.issue.id, input.issueRows);
    const groupIssue = input.issueRows.get(groupIssueId) ?? {
      id: artifact.issue.id,
      parentId: null,
      identifier: artifact.issue.identifier,
      title: artifact.issue.title,
      updatedAt: new Date(artifact.updatedAt),
    };
    const groupId = `${input.groupBy}:${groupIssueId}`;
    const existing = groups.get(groupId);
    const group = existing ?? emptyGroup({
      companyPrefix: input.companyPrefix,
      query: input.query,
      groupBy: input.groupBy,
      issue: groupIssue,
    });
    if (!existing) groups.set(groupId, group);

    group.count += 1;
    if (!group.mediaKinds.includes(artifact.mediaKind)) {
      group.mediaKinds.push(artifact.mediaKind);
    }
    if (group.previewArtifacts.length < GROUP_PREVIEW_ARTIFACT_LIMIT) {
      group.previewArtifacts.push(artifact);
    }
    if (Date.parse(artifact.updatedAt) > Date.parse(group.updatedAt)) {
      group.updatedAt = artifact.updatedAt;
    }
  }

  return [...groups.values()].sort((a, b) => {
    const dateDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id);
  });
}

type KeyedGroupBy = Exclude<ArtifactGroupBy, "task" | "parent_task">;

function isTaskGroupBy(groupBy: ArtifactGroupBy): groupBy is "task" | "parent_task" {
  return groupBy === "task" || groupBy === "parent_task";
}

/** Group key and label for the keyed groupings. `day` uses the artifact's UTC updatedAt date. */
function keyedGroupFor(groupBy: KeyedGroupBy, artifact: CompanyArtifact): { key: string; label: string } {
  if (groupBy === "agent") {
    return artifact.createdByAgent
      ? { key: artifact.createdByAgent.id, label: artifact.createdByAgent.name }
      : { key: "none", label: "Sin agente" };
  }
  if (groupBy === "media_kind") return { key: artifact.mediaKind, label: artifact.mediaKind };
  const day = artifact.updatedAt.slice(0, 10);
  return { key: day, label: day };
}

function buildKeyedGroupHref(
  companyPrefix: string,
  query: CompanyArtifactsQuery,
  groupBy: KeyedGroupBy,
  groupKey: string,
) {
  const params = new URLSearchParams();
  params.set("groupBy", groupBy);
  params.set("groupKey", groupKey);
  if (query.kind !== "all") params.set("kind", query.kind);
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.agentId) params.set("agentId", query.agentId);
  if (query.issueId) params.set("issueId", query.issueId);
  if (query.q) params.set("q", query.q);
  return `/${encodeURIComponent(companyPrefix)}/artifacts?${params.toString()}`;
}

function buildKeyedArtifactGroups(input: {
  artifacts: CompanyArtifact[];
  companyPrefix: string;
  query: CompanyArtifactsQuery;
  groupBy: KeyedGroupBy;
}) {
  const groups = new Map<string, CompanyArtifactGroup>();

  for (const artifact of input.artifacts) {
    const { key, label } = keyedGroupFor(input.groupBy, artifact);
    const groupId = `${input.groupBy}:${key}`;
    let group = groups.get(groupId);
    if (!group) {
      group = {
        id: groupId,
        groupBy: input.groupBy,
        key,
        label,
        // Synthetic issue summary: keyed groupings have no issue. Kept so existing clients compile.
        issue: { id: key, identifier: "", title: label },
        title: label,
        count: 0,
        mediaKinds: [],
        previewArtifacts: [],
        updatedAt: artifact.updatedAt,
        href: buildKeyedGroupHref(input.companyPrefix, input.query, input.groupBy, key),
      };
      groups.set(groupId, group);
    }

    group.count += 1;
    if (!group.mediaKinds.includes(artifact.mediaKind)) {
      group.mediaKinds.push(artifact.mediaKind);
    }
    if (group.previewArtifacts.length < GROUP_PREVIEW_ARTIFACT_LIMIT) {
      group.previewArtifacts.push(artifact);
    }
    if (Date.parse(artifact.updatedAt) > Date.parse(group.updatedAt)) {
      group.updatedAt = artifact.updatedAt;
    }
  }

  return [...groups.values()].sort((a, b) => {
    const dateDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id);
  });
}

// ---------------------------------------------------------------------------
// Folder tree (Salida explorer). Aggregates are computed with SQL per source,
// grouped by issue and content type, then rolled up in memory to issue,
// project and root nodes.
// ---------------------------------------------------------------------------

const MEDIA_KIND_ORDER: CompanyArtifactMediaKind[] = ["document", "image", "video", "text", "file", "empty"];

type TreeAgg = {
  count: number;
  totalByteSize: number;
  updatedMs: number | null;
  mediaKinds: Set<CompanyArtifactMediaKind>;
};

type TreeIssueRow = {
  issueId: string;
  identifier: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  agg: TreeAgg;
};

type TreeSourceRow = {
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string;
  projectId: string | null;
  projectName: string | null;
  count: number;
  bytes: number;
  updatedAt: Date | string | null;
  mediaKind: CompanyArtifactMediaKind;
};

function emptyTreeAgg(): TreeAgg {
  return { count: 0, totalByteSize: 0, updatedMs: null, mediaKinds: new Set() };
}

function addTreeAgg(
  target: TreeAgg,
  source: { count: number; totalByteSize: number; updatedMs: number | null; mediaKinds: Iterable<CompanyArtifactMediaKind> },
) {
  target.count += source.count;
  target.totalByteSize += source.totalByteSize;
  if (source.updatedMs !== null && (target.updatedMs === null || source.updatedMs > target.updatedMs)) {
    target.updatedMs = source.updatedMs;
  }
  for (const kind of source.mediaKinds) target.mediaKinds.add(kind);
}

function aggregateTreeRows(rows: TreeIssueRow[]) {
  const agg = emptyTreeAgg();
  for (const row of rows) addTreeAgg(agg, row.agg);
  return agg;
}

function recordTreeSourceRow(rows: Map<string, TreeIssueRow>, row: TreeSourceRow) {
  let entry = rows.get(row.issueId);
  if (!entry) {
    entry = {
      issueId: row.issueId,
      identifier: row.issueIdentifier ?? row.issueId,
      title: row.issueTitle,
      projectId: row.projectId,
      projectName: row.projectName,
      agg: emptyTreeAgg(),
    };
    rows.set(row.issueId, entry);
  }
  addTreeAgg(entry.agg, {
    count: row.count,
    totalByteSize: row.bytes,
    updatedMs: row.updatedAt ? new Date(row.updatedAt).getTime() : null,
    mediaKinds: [row.mediaKind],
  });
}

async function loadTreeIssueRows(db: Db, companyId: string, issueConditions: SQL[]) {
  const rows = new Map<string, TreeIssueRow>();

  // Documents: same filters as the flat list (agent-written, non-system keys).
  const documentRows = await db
    .select({
      issueId: issues.id,
      issueIdentifier: issues.identifier,
      issueTitle: issues.title,
      projectId: projects.id,
      projectName: projects.name,
      count: sql<number>`count(*)::int`.mapWith(Number),
      bytes: sql<number>`coalesce(sum(octet_length(${documents.latestBody})), 0)`.mapWith(Number),
      updatedAt: sql<Date | null>`max(${documents.updatedAt})`,
    })
    .from(issueDocuments)
    .innerJoin(
      documents,
      and(eq(issueDocuments.documentId, documents.id), eq(documents.companyId, issueDocuments.companyId)),
    )
    .innerJoin(
      issues,
      and(eq(issueDocuments.issueId, issues.id), eq(issues.companyId, issueDocuments.companyId)),
    )
    .leftJoin(projects, and(eq(issues.projectId, projects.id), eq(projects.companyId, issues.companyId)))
    .where(and(
      eq(issueDocuments.companyId, companyId),
      eq(documents.companyId, companyId),
      ...issueConditions,
      or(isNotNull(documents.createdByAgentId), isNotNull(documents.updatedByAgentId))!,
      notInArray(issueDocuments.key, [...SYSTEM_ISSUE_DOCUMENT_KEYS]),
    ))
    .groupBy(issues.id, projects.id);

  for (const row of documentRows) {
    recordTreeSourceRow(rows, { ...row, mediaKind: "document" });
  }

  // Work products (type artifact). Attachment-backed rows mirror the list's mediaKind rules.
  const wpContentType = sql<string>`coalesce(${issueWorkProducts.metadata}->>'contentType', '')`;
  const wpHasAttachment = sql<boolean>`((${issueWorkProducts.metadata}->>'attachmentId') IS NOT NULL)`;
  const workProductRows = await db
    .select({
      issueId: issues.id,
      issueIdentifier: issues.identifier,
      issueTitle: issues.title,
      projectId: projects.id,
      projectName: projects.name,
      contentType: wpContentType,
      hasAttachment: wpHasAttachment,
      count: sql<number>`count(*)::int`.mapWith(Number),
      bytes: sql<number>`coalesce(sum(CASE WHEN jsonb_typeof(${issueWorkProducts.metadata}->'byteSize') = 'number' THEN (${issueWorkProducts.metadata}->>'byteSize')::float8 ELSE 0 END), 0)`.mapWith(Number),
      updatedAt: sql<Date | null>`max(${issueWorkProducts.updatedAt})`,
    })
    .from(issueWorkProducts)
    .innerJoin(issues, and(eq(issueWorkProducts.issueId, issues.id), eq(issues.companyId, issueWorkProducts.companyId)))
    .leftJoin(projects, and(eq(issues.projectId, projects.id), eq(projects.companyId, issueWorkProducts.companyId)))
    .where(and(
      eq(issueWorkProducts.companyId, companyId),
      eq(issueWorkProducts.type, "artifact"),
      eq(issueWorkProducts.provider, "paperclip"),
      ...issueConditions,
    ))
    .groupBy(issues.id, projects.id, wpContentType, wpHasAttachment);

  for (const row of workProductRows) {
    recordTreeSourceRow(rows, {
      ...row,
      mediaKind: row.hasAttachment ? classifyMediaKind(row.contentType || null, "file") : "empty",
    });
  }

  // Direct agent attachments, deduplicated against attachment-backed work products.
  const attachmentRows = await db
    .select({
      issueId: issues.id,
      issueIdentifier: issues.identifier,
      issueTitle: issues.title,
      projectId: projects.id,
      projectName: projects.name,
      contentType: assets.contentType,
      count: sql<number>`count(*)::int`.mapWith(Number),
      bytes: sql<number>`coalesce(sum(${assets.byteSize}), 0)`.mapWith(Number),
      updatedAt: sql<Date | null>`max(${issueAttachments.updatedAt})`,
    })
    .from(issueAttachments)
    .innerJoin(assets, and(eq(issueAttachments.assetId, assets.id), eq(assets.companyId, issueAttachments.companyId)))
    .innerJoin(issues, and(eq(issueAttachments.issueId, issues.id), eq(issues.companyId, issueAttachments.companyId)))
    .leftJoin(projects, and(eq(issues.projectId, projects.id), eq(projects.companyId, issues.companyId)))
    .where(and(
      eq(issueAttachments.companyId, companyId),
      isNull(issueAttachments.issueCommentId),
      isNotNull(assets.createdByAgentId),
      ...issueConditions,
      sql`NOT EXISTS (
        SELECT 1 FROM ${issueWorkProducts} AS dedupe_wp
        WHERE dedupe_wp.company_id = ${companyId}
          AND dedupe_wp.type = 'artifact'
          AND dedupe_wp.provider = 'paperclip'
          AND (dedupe_wp.metadata->>'attachmentId') = (${issueAttachments.id})::text
      )`,
    ))
    .groupBy(issues.id, projects.id, assets.contentType);

  for (const row of attachmentRows) {
    recordTreeSourceRow(rows, { ...row, mediaKind: classifyMediaKind(row.contentType) });
  }

  return rows;
}

function treeNode(input: {
  id: string;
  kind: CompanyArtifactTreeNode["kind"];
  label: string;
  projectId: string | null;
  issueId: string | null;
  issueIdentifier: string | null;
  agg: TreeAgg;
  hasChildren: boolean;
}): CompanyArtifactTreeNode {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    projectId: input.projectId,
    issueId: input.issueId,
    issueIdentifier: input.issueIdentifier,
    count: input.agg.count,
    totalByteSize: input.agg.totalByteSize,
    updatedAt: input.agg.updatedMs === null ? null : new Date(input.agg.updatedMs).toISOString(),
    mediaKinds: MEDIA_KIND_ORDER.filter((kind) => input.agg.mediaKinds.has(kind)),
    hasChildren: input.hasChildren,
  };
}

function issueTreeNode(row: TreeIssueRow): CompanyArtifactTreeNode {
  return treeNode({
    id: `issue:${row.issueId}`,
    kind: "issue",
    label: `${row.identifier} · ${row.title}`,
    projectId: row.projectId,
    issueId: row.issueId,
    issueIdentifier: row.identifier,
    agg: row.agg,
    hasChildren: false,
  });
}

function sortTreeIssueRows(rows: TreeIssueRow[]) {
  return [...rows].sort((a, b) => {
    const diff = (b.agg.updatedMs ?? 0) - (a.agg.updatedMs ?? 0);
    if (diff !== 0) return diff;
    return compareSortValues(a.identifier, b.identifier);
  });
}

async function buildArtifactTree(
  db: Db,
  companyId: string,
  nodeId: string,
  issueConditions: SQL[],
): Promise<CompanyArtifactTreeResponse> {
  const rows = [...(await loadTreeIssueRows(db, companyId, issueConditions)).values()];
  const withProject = rows.filter((row) => row.projectId !== null);
  const withoutProject = rows.filter((row) => row.projectId === null);

  const projectGroups = new Map<string, { name: string; rows: TreeIssueRow[] }>();
  for (const row of withProject) {
    const projectId = row.projectId!;
    const group = projectGroups.get(projectId) ?? { name: row.projectName ?? projectId, rows: [] };
    group.rows.push(row);
    projectGroups.set(projectId, group);
  }

  if (nodeId === "root") {
    const children: CompanyArtifactTreeNode[] = [];
    if (withProject.length > 0) {
      children.push(treeNode({
        id: "projects",
        kind: "projects",
        label: "Proyectos",
        projectId: null,
        issueId: null,
        issueIdentifier: null,
        agg: aggregateTreeRows(withProject),
        hasChildren: projectGroups.size > 0,
      }));
    }
    if (withoutProject.length > 0) {
      children.push(treeNode({
        id: "no_project",
        kind: "no_project",
        label: "Sin proyecto",
        projectId: null,
        issueId: null,
        issueIdentifier: null,
        agg: aggregateTreeRows(withoutProject),
        hasChildren: true,
      }));
    }
    return {
      node: treeNode({
        id: "root",
        kind: "root",
        label: "Salida",
        projectId: null,
        issueId: null,
        issueIdentifier: null,
        agg: aggregateTreeRows(rows),
        hasChildren: children.length > 0,
      }),
      children,
    };
  }

  if (nodeId === "projects") {
    const children = [...projectGroups.entries()]
      .map(([projectId, group]) => treeNode({
        id: `project:${projectId}`,
        kind: "project",
        label: group.name,
        projectId,
        issueId: null,
        issueIdentifier: null,
        agg: aggregateTreeRows(group.rows),
        hasChildren: group.rows.length > 0,
      }))
      .sort((a, b) => {
        const diff = Date.parse(b.updatedAt ?? "0") - Date.parse(a.updatedAt ?? "0");
        return diff !== 0 ? diff : compareSortValues(a.label, b.label);
      });
    return {
      node: treeNode({
        id: "projects",
        kind: "projects",
        label: "Proyectos",
        projectId: null,
        issueId: null,
        issueIdentifier: null,
        agg: aggregateTreeRows(withProject),
        hasChildren: children.length > 0,
      }),
      children,
    };
  }

  if (nodeId === "no_project") {
    return {
      node: treeNode({
        id: "no_project",
        kind: "no_project",
        label: "Sin proyecto",
        projectId: null,
        issueId: null,
        issueIdentifier: null,
        agg: aggregateTreeRows(withoutProject),
        hasChildren: withoutProject.length > 0,
      }),
      children: sortTreeIssueRows(withoutProject).map(issueTreeNode),
    };
  }

  if (nodeId.startsWith("project:")) {
    const projectId = nodeId.slice("project:".length);
    const group = projectGroups.get(projectId);
    let label = group?.name ?? null;
    if (!label) {
      const project = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)))
        .then((result) => result[0] ?? null);
      if (!project) throw notFound("Project not found");
      label = project.name;
    }
    const projectRows = group?.rows ?? [];
    return {
      node: treeNode({
        id: nodeId,
        kind: "project",
        label,
        projectId,
        issueId: null,
        issueIdentifier: null,
        agg: aggregateTreeRows(projectRows),
        hasChildren: projectRows.length > 0,
      }),
      children: sortTreeIssueRows(projectRows).map(issueTreeNode),
    };
  }

  // issue:<id>. Clients list the files of an issue with GET /artifacts?issueId=.
  const issueId = nodeId.slice("issue:".length);
  const row = rows.find((candidate) => candidate.issueId === issueId);
  if (row) {
    return { node: issueTreeNode(row), children: [] };
  }
  const issue = await db
    .select({
      id: issues.id,
      identifier: issues.identifier,
      title: issues.title,
      projectId: issues.projectId,
    })
    .from(issues)
    .where(and(eq(issues.id, issueId), eq(issues.companyId, companyId), ...issueConditions))
    .then((result) => result[0] ?? null);
  if (!issue) throw notFound("Issue not found");
  const identifier = issue.identifier ?? issue.id;
  return {
    node: treeNode({
      id: nodeId,
      kind: "issue",
      label: `${identifier} · ${issue.title}`,
      projectId: issue.projectId,
      issueId: issue.id,
      issueIdentifier: identifier,
      agg: emptyTreeAgg(),
      hasChildren: false,
    }),
    children: [],
  };
}

export function companyArtifactsService(db: Db, storage?: StorageService) {
  const service = {
    list: async (
      companyId: string,
      rawQuery: Partial<CompanyArtifactsQuery> = {},
      options: { issueConditions?: SQL[]; userId?: string } = {},
    ): Promise<CompanyArtifactsResponse> => {
      const query = companyArtifactsQuerySchema.parse(rawQuery);
      const groupBy = query.groupBy === "none" ? null : query.groupBy;
      const nonDefaultSort = !isDefaultSort(query.sort, query.dir);
      // Sort cursors cover the flat list and a selected group's artifacts; group lists stay date-ordered.
      const needsSortCursor = nonDefaultSort && (!groupBy || Boolean(query.groupIssueId) || Boolean(query.groupKey));
      const sortCursor = needsSortCursor ? decodeSortCursor(query.cursor, query.sort, query.dir) : null;
      const cursor = needsSortCursor ? null : decodeCursor(query.cursor);
      // SQL-level keyset pagination only serves the default date-desc flat list.
      const sqlCursor = !groupBy && !nonDefaultSort ? cursor : null;
      const company = await db
        .select({ id: companies.id, issuePrefix: companies.issuePrefix })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);
      if (!company) throw notFound("Company not found");

      if (query.starred && !options.userId) {
        return { artifacts: [], nextCursor: null };
      }

      const fetchLimit = Math.min(query.limit + 1, COMPANY_ARTIFACTS_MAX_LIMIT + 1);
      const sourceFetchLimit = groupBy || nonDefaultSort ? GROUPED_ARTIFACT_FETCH_LIMIT : fetchLimit;
      const q = query.q ? `%${escapeLikePattern(query.q)}%` : null;
      const issueConditions: SQL[] = [
        isNull(issues.hiddenAt),
        isNull(issues.harnessKind),
        ...(query.issueId ? [eq(issues.id, query.issueId)] : []),
        ...(options.issueConditions ?? []),
      ];
      const artifacts: CompanyArtifact[] = [];
      const artifactSortDates = new Map<string, string>();
      const workProductAttachmentIds = new Set<string>();

      if (query.kind === "all" || query.kind === "document") {
        const createdAgent = alias(agents, "document_created_agent");
        const updatedAgent = alias(agents, "document_updated_agent");
        const documentArtifactId = sql<string>`concat('document:', ${documents.id})`;
        const documentConditions: SQL[] = [
          eq(issueDocuments.companyId, companyId),
          eq(documents.companyId, companyId),
          ...issueConditions,
          ...(query.starred
            ? [
              eq(documentMemberships.companyId, companyId),
              eq(documentMemberships.userId, options.userId!),
              isNotNull(documentMemberships.starredAt),
            ]
            : [
              or(isNotNull(documents.createdByAgentId), isNotNull(documents.updatedByAgentId))!,
              notInArray(issueDocuments.key, [...SYSTEM_ISSUE_DOCUMENT_KEYS]),
            ]),
        ];
        const documentSortDate = query.starred
          ? sql<Date>`${documentMemberships.starredAt}`
          : sql<Date>`${documents.updatedAt}`;
        const documentCursor = cursorCondition(documentSortDate, documentArtifactId, sqlCursor);
        if (documentCursor) documentConditions.push(documentCursor);
        if (groupBy === "task" && query.groupIssueId) documentConditions.push(eq(issues.id, query.groupIssueId));
        if (query.projectId) documentConditions.push(eq(issues.projectId, query.projectId));
        if (query.agentId) documentConditions.push(sql`coalesce(${createdAgent.id}, ${updatedAgent.id}) = ${query.agentId}`);
        if (q) {
          documentConditions.push(sql`(
            coalesce(${documents.title}, '') ILIKE ${q} ESCAPE '\\'
            OR ${documents.latestBody} ILIKE ${q} ESCAPE '\\'
            OR coalesce(${issues.identifier}, '') ILIKE ${q} ESCAPE '\\'
            OR ${issues.title} ILIKE ${q} ESCAPE '\\'
          )`);
        }

        const documentRowsQuery = db
          .select({
            artifactId: documentArtifactId,
            documentId: documents.id,
            issueId: issues.id,
            issueIdentifier: issues.identifier,
            issueTitle: issues.title,
            projectId: projects.id,
            projectName: projects.name,
            key: issueDocuments.key,
            title: documents.title,
            latestBody: documents.latestBody,
            createdByAgentId: sql<string | null>`coalesce(${createdAgent.id}, ${updatedAgent.id})`,
            createdByAgentName: sql<string | null>`coalesce(${createdAgent.name}, ${updatedAgent.name})`,
            createdAt: documents.createdAt,
            updatedAt: documents.updatedAt,
            starredAt: documentMemberships.starredAt,
          })
          .from(issueDocuments)
          .innerJoin(
            documents,
            and(
              eq(issueDocuments.documentId, documents.id),
              eq(documents.companyId, issueDocuments.companyId),
            ),
          )
          .leftJoin(
            documentMemberships,
            and(
              eq(documentMemberships.documentId, documents.id),
              eq(documentMemberships.companyId, documents.companyId),
              eq(documentMemberships.userId, options.userId ?? ""),
            ),
          )
          .innerJoin(
            issues,
            and(
              eq(issueDocuments.issueId, issues.id),
              eq(issues.companyId, issueDocuments.companyId),
            ),
          )
          .leftJoin(
            projects,
            and(
              eq(issues.projectId, projects.id),
              eq(projects.companyId, issues.companyId),
            ),
          )
          .leftJoin(
            createdAgent,
            and(
              eq(documents.createdByAgentId, createdAgent.id),
              eq(createdAgent.companyId, documents.companyId),
            ),
          )
          .leftJoin(
            updatedAgent,
            and(
              eq(documents.updatedByAgentId, updatedAgent.id),
              eq(updatedAgent.companyId, documents.companyId),
            ),
          )
          .where(and(...documentConditions))
          .orderBy(desc(documentSortDate), desc(documentArtifactId));
        const documentRows = await documentRowsQuery.limit(sourceFetchLimit);

        for (const row of documentRows) {
          const identifier = row.issueIdentifier ?? row.issueId;
          artifactSortDates.set(row.artifactId, (row.starredAt ?? row.updatedAt).toISOString());
          artifacts.push({
            id: row.artifactId,
            source: "document",
            mediaKind: "document",
            title: row.title ?? row.key,
            previewText: normalizePreviewText(row.latestBody),
            contentType: "text/markdown",
            byteSize: row.latestBody === null ? null : Buffer.byteLength(row.latestBody, "utf8"),
            contentPath: null,
            openPath: null,
            downloadPath: null,
            thumbnailPath: null,
            issue: { id: row.issueId, identifier, title: row.issueTitle },
            project: row.projectId && row.projectName ? { id: row.projectId, name: row.projectName } : null,
            createdByAgent: row.createdByAgentId && row.createdByAgentName
              ? { id: row.createdByAgentId, name: row.createdByAgentName }
              : null,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            href: buildIssueHref(company.issuePrefix, identifier, `document-${row.key}`),
          });
        }
      }

      if (query.kind !== "document") {
        const workProductAgent = alias(agents, "work_product_agent");
        const workProductArtifactId = sql<string>`concat('work_product:', ${issueWorkProducts.id})`;
        const workProductSortDate = query.starred
          ? sql<Date>`${artifactMemberships.starredAt}`
          : sql<Date>`${issueWorkProducts.updatedAt}`;
        const workProductContentType = sql<string>`coalesce(${issueWorkProducts.metadata}->>'contentType', '')`;
        const workProductBaseConditions: SQL[] = [
          eq(issueWorkProducts.companyId, companyId),
          eq(issueWorkProducts.type, "artifact"),
          eq(issueWorkProducts.provider, "paperclip"),
          ...issueConditions,
        ];
        const workProductConditions: SQL[] = [...workProductBaseConditions];
        const workProductCursor = cursorCondition(workProductSortDate, workProductArtifactId, sqlCursor);
        const workProductKind = contentTypeKindCondition(workProductContentType, query.kind);
        if (workProductCursor) workProductConditions.push(workProductCursor);
        if (groupBy === "task" && query.groupIssueId) {
          const selectedIssueCondition = eq(issues.id, query.groupIssueId);
          workProductBaseConditions.push(selectedIssueCondition);
          workProductConditions.push(selectedIssueCondition);
        }
        if (workProductKind) {
          workProductBaseConditions.push(workProductKind);
          workProductConditions.push(workProductKind);
        }
        if (query.starred) workProductConditions.push(isNotNull(artifactMemberships.starredAt));
        if (query.projectId) {
          const projectCondition = eq(issues.projectId, query.projectId);
          workProductBaseConditions.push(projectCondition);
          workProductConditions.push(projectCondition);
        }
        // Agent filter applies to the listed rows only; the attachment dedupe
        // below stays company-wide so a work product's file never re-lists.
        if (query.agentId) workProductConditions.push(eq(workProductAgent.id, query.agentId));
        if (q) {
          const searchCondition = sql`(
            ${issueWorkProducts.title} ILIKE ${q} ESCAPE '\\'
            OR coalesce(${issueWorkProducts.summary}, '') ILIKE ${q} ESCAPE '\\'
            OR coalesce(${issues.identifier}, '') ILIKE ${q} ESCAPE '\\'
            OR ${issues.title} ILIKE ${q} ESCAPE '\\'
          )`;
          workProductBaseConditions.push(searchCondition);
          workProductConditions.push(searchCondition);
        }

        const workProductRowsQuery = db
          .select({
            artifactId: workProductArtifactId,
            workProductId: issueWorkProducts.id,
            issueId: issues.id,
            issueIdentifier: issues.identifier,
            issueTitle: issues.title,
            projectId: projects.id,
            projectName: projects.name,
            title: issueWorkProducts.title,
            summary: issueWorkProducts.summary,
            metadata: issueWorkProducts.metadata,
            createdByAgentId: workProductAgent.id,
            createdByAgentName: workProductAgent.name,
            createdAt: issueWorkProducts.createdAt,
            updatedAt: issueWorkProducts.updatedAt,
            starredAt: query.starred ? artifactMemberships.starredAt : sql<Date | null>`null`,
          })
          .from(issueWorkProducts)
          .leftJoin(
            artifactMemberships,
            and(
              eq(artifactMemberships.companyId, companyId),
              eq(artifactMemberships.userId, options.userId ?? ""),
              eq(artifactMemberships.artifactRef, sql`concat('work_product:', ${issueWorkProducts.id}::text)`),
            ),
          )
          .innerJoin(
            issues,
            and(
              eq(issueWorkProducts.issueId, issues.id),
              eq(issues.companyId, issueWorkProducts.companyId),
            ),
          )
          .leftJoin(
            projects,
            and(
              eq(issues.projectId, projects.id),
              eq(projects.companyId, issueWorkProducts.companyId),
            ),
          )
          .leftJoin(
            heartbeatRuns,
            and(
              eq(issueWorkProducts.createdByRunId, heartbeatRuns.id),
              eq(heartbeatRuns.companyId, issueWorkProducts.companyId),
            ),
          )
          .leftJoin(
            workProductAgent,
            and(
              eq(heartbeatRuns.agentId, workProductAgent.id),
              eq(workProductAgent.companyId, issueWorkProducts.companyId),
            ),
          )
          .where(and(...workProductConditions))
          .orderBy(desc(workProductSortDate), desc(workProductArtifactId));
        const workProductRows = await workProductRowsQuery.limit(sourceFetchLimit);

        // Company-wide dedupe set. Starred listings dedupe against the starred work products they show instead.
        const workProductAttachmentRows = query.starred ? [] : await db
          .select({
            attachmentId: sql<string | null>`${issueWorkProducts.metadata}->>'attachmentId'`,
          })
          .from(issueWorkProducts)
          .innerJoin(
            issues,
            and(
              eq(issueWorkProducts.issueId, issues.id),
              eq(issues.companyId, issueWorkProducts.companyId),
            ),
          )
          .where(and(...workProductBaseConditions, sql`${issueWorkProducts.metadata}->>'attachmentId' IS NOT NULL`))
          .limit(sourceFetchLimit);

        for (const row of workProductAttachmentRows) {
          if (row.attachmentId) {
            workProductAttachmentIds.add(row.attachmentId);
          }
        }

        for (const row of workProductRows) {
          const metadata = attachmentArtifactWorkProductMetadataSchema.safeParse(row.metadata);
          const attachmentMetadata = metadata.success ? metadata.data : null;
          if (attachmentMetadata) {
            workProductAttachmentIds.add(attachmentMetadata.attachmentId);
          }
          const contentType = attachmentMetadata?.contentType ?? null;
          const identifier = row.issueIdentifier ?? row.issueId;
          if (query.starred && row.starredAt) artifactSortDates.set(row.artifactId, row.starredAt.toISOString());
          artifacts.push({
            id: row.artifactId,
            source: "work_product",
            mediaKind: classifyMediaKind(contentType, attachmentMetadata ? "file" : "empty"),
            title: row.title,
            previewText: normalizePreviewText(row.summary),
            contentType,
            byteSize: attachmentMetadata?.byteSize
              ?? (typeof row.metadata?.byteSize === "number" ? row.metadata.byteSize : null),
            contentPath: attachmentMetadata?.contentPath ?? null,
            openPath: attachmentMetadata?.openPath ?? (typeof row.metadata?.openPath === "string" ? row.metadata.openPath : null),
            downloadPath: attachmentMetadata?.downloadPath ?? null,
            thumbnailPath: attachmentMetadata
              ? attachmentThumbnailPath(attachmentMetadata.attachmentId, contentType)
              : null,
            issue: { id: row.issueId, identifier, title: row.issueTitle },
            project: row.projectId && row.projectName ? { id: row.projectId, name: row.projectName } : null,
            createdByAgent: row.createdByAgentId && row.createdByAgentName
              ? { id: row.createdByAgentId, name: row.createdByAgentName }
              : null,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            href: buildIssueHref(company.issuePrefix, identifier, `work-product-${row.workProductId}`),
          });
        }

        const attachmentAgent = alias(agents, "attachment_agent");
        const attachmentArtifactId = sql<string>`concat('attachment:', ${issueAttachments.id})`;
        // Default listing shows agent-created files; a starred file is shown whoever uploaded it.
        const attachmentConditions: SQL[] = [
          eq(issueAttachments.companyId, companyId),
          isNull(issueAttachments.issueCommentId),
          ...(query.starred ? [] : [isNotNull(assets.createdByAgentId)]),
          ...issueConditions,
        ];
        const attachmentSortDate = query.starred
          ? sql<Date>`${artifactMemberships.starredAt}`
          : sql<Date>`${issueAttachments.updatedAt}`;
        if (query.starred) attachmentConditions.push(isNotNull(artifactMemberships.starredAt));
        const attachmentCursor = cursorCondition(attachmentSortDate, attachmentArtifactId, sqlCursor);
        const attachmentKind = contentTypeKindCondition(sql<string>`${assets.contentType}`, query.kind);
        if (attachmentCursor) attachmentConditions.push(attachmentCursor);
        if (groupBy === "task" && query.groupIssueId) attachmentConditions.push(eq(issues.id, query.groupIssueId));
        if (attachmentKind) attachmentConditions.push(attachmentKind);
        if (query.projectId) attachmentConditions.push(eq(issues.projectId, query.projectId));
        if (query.agentId) attachmentConditions.push(eq(attachmentAgent.id, query.agentId));
        if (q) {
          attachmentConditions.push(sql`(
            coalesce(${assets.originalFilename}, '') ILIKE ${q} ESCAPE '\\'
            OR coalesce(${issues.identifier}, '') ILIKE ${q} ESCAPE '\\'
            OR ${issues.title} ILIKE ${q} ESCAPE '\\'
          )`);
        }

        const attachmentRowsQuery = db
          .select({
            artifactId: attachmentArtifactId,
            attachmentId: issueAttachments.id,
            companyId: issueAttachments.companyId,
            issueId: issues.id,
            issueIdentifier: issues.identifier,
            issueTitle: issues.title,
            projectId: projects.id,
            projectName: projects.name,
            objectKey: assets.objectKey,
            contentType: assets.contentType,
            byteSize: assets.byteSize,
            originalFilename: assets.originalFilename,
            createdByAgentId: attachmentAgent.id,
            createdByAgentName: attachmentAgent.name,
            createdAt: issueAttachments.createdAt,
            updatedAt: issueAttachments.updatedAt,
            starredAt: query.starred ? artifactMemberships.starredAt : sql<Date | null>`null`,
          })
          .from(issueAttachments)
          .leftJoin(
            artifactMemberships,
            and(
              eq(artifactMemberships.companyId, companyId),
              eq(artifactMemberships.userId, options.userId ?? ""),
              eq(artifactMemberships.artifactRef, sql`concat('attachment:', ${issueAttachments.id}::text)`),
            ),
          )
          .innerJoin(
            assets,
            and(
              eq(issueAttachments.assetId, assets.id),
              eq(assets.companyId, issueAttachments.companyId),
            ),
          )
          .innerJoin(
            issues,
            and(
              eq(issueAttachments.issueId, issues.id),
              eq(issues.companyId, issueAttachments.companyId),
            ),
          )
          .leftJoin(
            projects,
            and(
              eq(issues.projectId, projects.id),
              eq(projects.companyId, issues.companyId),
            ),
          )
          .leftJoin(
            attachmentAgent,
            and(
              eq(assets.createdByAgentId, attachmentAgent.id),
              eq(attachmentAgent.companyId, assets.companyId),
            ),
          )
          .where(and(...attachmentConditions))
          .orderBy(desc(attachmentSortDate), desc(attachmentArtifactId));
        const attachmentRows = await attachmentRowsQuery.limit(sourceFetchLimit);

        const attachmentArtifacts = await Promise.all(attachmentRows.map(async (row): Promise<CompanyArtifact | null> => {
          if (workProductAttachmentIds.has(row.attachmentId)) return null;
          if (query.starred && row.starredAt) artifactSortDates.set(row.artifactId, row.starredAt.toISOString());
          const mediaKind = classifyMediaKind(row.contentType);
          const contentPath = attachmentContentPath(row.attachmentId);
          const identifier = row.issueIdentifier ?? row.issueId;
          return {
            id: row.artifactId,
            source: "attachment",
            mediaKind,
            title: row.originalFilename ?? "Attachment",
            previewText: mediaKind === "text"
              ? await readTextAttachmentPreview(storage, {
                companyId: row.companyId,
                objectKey: row.objectKey,
                byteSize: row.byteSize,
              })
              : null,
            contentType: row.contentType,
            byteSize: row.byteSize,
            contentPath,
            openPath: contentPath,
            downloadPath: `${contentPath}?download=1`,
            thumbnailPath: attachmentThumbnailPath(row.attachmentId, row.contentType),
            issue: { id: row.issueId, identifier, title: row.issueTitle },
            project: row.projectId && row.projectName ? { id: row.projectId, name: row.projectName } : null,
            createdByAgent: row.createdByAgentId && row.createdByAgentName
              ? { id: row.createdByAgentId, name: row.createdByAgentName }
              : null,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            href: buildIssueHref(company.issuePrefix, identifier, `attachment-${row.attachmentId}`),
          };
        }));

        artifacts.push(...attachmentArtifacts.filter((artifact): artifact is CompanyArtifact => artifact !== null));
      }

      if (!groupBy && nonDefaultSort) {
        // Candidate window is the GROUPED_ARTIFACT_FETCH_LIMIT most recent rows per source.
        const { page, nextCursor } = pageBySortCursor(
          artifacts,
          query.limit,
          sortCursor,
          query.sort,
          query.dir,
          artifactSortDates,
        );
        return { artifacts: page, nextCursor };
      }

      const sorted = sortArtifacts(artifacts, artifactSortDates);
      if (!groupBy) {
        const page = sorted.slice(0, query.limit);
        const last = page[page.length - 1];
        const nextCursor = sorted.length > query.limit
          ? encodeCursor({
            id: last?.id ?? "",
            updatedAt: last ? artifactSortDates.get(last.id) ?? last.updatedAt : new Date(0).toISOString(),
          })
          : null;

        return { artifacts: page, nextCursor };
      }

      if (!isTaskGroupBy(groupBy)) {
        const groups = buildKeyedArtifactGroups({
          artifacts: sorted,
          companyPrefix: company.issuePrefix,
          query,
          groupBy,
        });
        if (query.groupKey) {
          const selectedGroup = groups.find((group) => group.key === query.groupKey) ?? null;
          const selectedArtifacts = sorted.filter((artifact) => keyedGroupFor(groupBy, artifact).key === query.groupKey);
          const { page, nextCursor } = needsSortCursor
            ? pageBySortCursor(selectedArtifacts, query.limit, sortCursor, query.sort, query.dir, artifactSortDates)
            : pageByCursor(selectedArtifacts, query.limit, cursor);
          return { artifacts: page, selectedGroup, nextCursor };
        }
        const { page, nextCursor } = pageByCursor(groups, query.limit, cursor);
        return { artifacts: [], groups: page, nextCursor };
      }

      const issueSeedIds = new Set(artifacts.map((artifact) => artifact.issue.id));
      if (query.groupIssueId) issueSeedIds.add(query.groupIssueId);
      const issueRows = await loadIssueGroupingRows(db, companyId, issueSeedIds);
      const groups = buildArtifactGroups({
        artifacts: sorted,
        companyPrefix: company.issuePrefix,
        query,
        groupBy,
        issueRows,
      });

      if (query.groupIssueId) {
        const selectedIssue = issueRows.get(query.groupIssueId);
        if (!selectedIssue) {
          return { artifacts: [], selectedGroup: null, nextCursor: null };
        }

        const selectedGroupIssueId = resolveGroupIssueId(groupBy, selectedIssue.id, issueRows);
        const selectedGroup = groups.find((group) => group.issue.id === selectedGroupIssueId)
          ?? emptyGroup({
            companyPrefix: company.issuePrefix,
            query,
            groupBy,
            issue: issueRows.get(selectedGroupIssueId) ?? selectedIssue,
          });
        const selectedArtifacts = sorted.filter((artifact) =>
          resolveGroupIssueId(groupBy, artifact.issue.id, issueRows) === selectedGroupIssueId
        );
        const { page, nextCursor } = needsSortCursor
          ? pageBySortCursor(selectedArtifacts, query.limit, sortCursor, query.sort, query.dir, artifactSortDates)
          : pageByCursor(selectedArtifacts, query.limit, cursor);
        return { artifacts: page, selectedGroup, nextCursor };
      }

      const { page, nextCursor } = pageByCursor(groups, query.limit, cursor);
      return { artifacts: [], groups: page, nextCursor };
    },
    tree: async (
      companyId: string,
      rawQuery: Partial<CompanyArtifactsTreeQuery> = {},
      options: { issueConditions?: SQL[] } = {},
    ): Promise<CompanyArtifactTreeResponse> => {
      const query = companyArtifactsTreeQuerySchema.parse(rawQuery);
      const company = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);
      if (!company) throw notFound("Company not found");
      return buildArtifactTree(db, companyId, query.node, [
        isNull(issues.hiddenAt),
        isNull(issues.harnessKind),
        ...(options.issueConditions ?? []),
      ]);
    },
    /**
     * ZIP entries for every artifact of one task (`issue:<id>`) or project (`project:<id>`).
     * Attachments and attachment-backed work products are copied as stored bytes; documents
     * are written as markdown from their latest body. Paths are `<identifier>/<filename>`.
     */
    archiveEntries: async (
      companyId: string,
      node: string,
    ): Promise<{ entries: ZipEntry[]; totalByteSize: number }> => {
      const match = /^(issue|project):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(node);
      if (!match) throw badRequest("node must be issue:<id> or project:<id>");
      const scope = match[1] === "issue" ? { issueId: match[2]! } : { projectId: match[2]! };

      const artifacts: CompanyArtifact[] = [];
      let cursor: string | undefined;
      do {
        const page = await service.list(companyId, { ...scope, kind: "all", sort: "date", dir: "desc", limit: COMPANY_ARTIFACTS_MAX_LIMIT, cursor }, {});
        artifacts.push(...page.artifacts);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);

      const attachmentIds = new Set<string>();
      const documentIds = new Set<string>();
      for (const artifact of artifacts) {
        if (artifact.source === "document") {
          documentIds.add(artifact.id.slice("document:".length));
        } else if (artifact.source === "attachment") {
          attachmentIds.add(artifact.id.slice("attachment:".length));
        } else {
          const attachmentId = ATTACHMENT_ID_IN_CONTENT_PATH.exec(artifact.contentPath ?? "")?.[1];
          if (attachmentId) attachmentIds.add(attachmentId);
        }
      }

      const attachmentRows = attachmentIds.size === 0 ? [] : await db
        .select({
          id: issueAttachments.id,
          issueId: issueAttachments.issueId,
          objectKey: assets.objectKey,
          byteSize: assets.byteSize,
          originalFilename: assets.originalFilename,
        })
        .from(issueAttachments)
        .innerJoin(assets, and(eq(issueAttachments.assetId, assets.id), eq(assets.companyId, companyId)))
        .where(and(eq(issueAttachments.companyId, companyId), inArray(issueAttachments.id, [...attachmentIds])));
      const attachmentById = new Map(attachmentRows.map((row) => [row.id, row]));

      const documentRows = documentIds.size === 0 ? [] : await db
        .select({
          id: documents.id,
          key: issueDocuments.key,
          issueId: issueDocuments.issueId,
          body: documents.latestBody,
        })
        .from(documents)
        .innerJoin(issueDocuments, and(eq(issueDocuments.documentId, documents.id), eq(issueDocuments.companyId, companyId)))
        .where(and(eq(documents.companyId, companyId), inArray(documents.id, [...documentIds])));
      const documentById = new Map(documentRows.map((row) => [row.id, row]));

      const taken = new Set<string>();
      const entries: ZipEntry[] = [];
      const seenAttachments = new Set<string>();
      for (const artifact of artifacts) {
        const folder = safeZipSegment(artifact.issue.identifier || artifact.issue.id);
        if (artifact.source === "document") {
          const doc = documentById.get(artifact.id.slice("document:".length));
          if (!doc || doc.body === null) continue;
          entries.push({
            path: uniqueZipPath(`${folder}/${safeZipSegment(doc.key)}.md`, taken),
            byteSize: Buffer.byteLength(doc.body, "utf8"),
            text: doc.body,
          });
          continue;
        }
        const attachmentId = artifact.source === "attachment"
          ? artifact.id.slice("attachment:".length)
          : ATTACHMENT_ID_IN_CONTENT_PATH.exec(artifact.contentPath ?? "")?.[1];
        if (!attachmentId || seenAttachments.has(attachmentId)) continue;
        const attachment = attachmentById.get(attachmentId);
        if (!attachment) continue;
        seenAttachments.add(attachmentId);
        entries.push({
          path: uniqueZipPath(`${folder}/${safeZipSegment(attachment.originalFilename ?? artifact.title)}`, taken),
          byteSize: Number(attachment.byteSize),
          objectKey: attachment.objectKey,
        });
      }

      if (entries.length === 0) throw unprocessable("Nothing to archive: this node has no files or documents");
      const totalByteSize = archiveTotalBytes(entries);
      if (totalByteSize > ARCHIVE_MAX_TOTAL_BYTES) {
        throw payloadTooLarge(`Archive is larger than the ${ARCHIVE_MAX_TOTAL_BYTES / (1024 * 1024)} MB limit`);
      }
      return { entries, totalByteSize };
    },
  };
  return service;
}
