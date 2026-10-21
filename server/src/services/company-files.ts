import { and, asc, eq, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  assets,
  authUsers,
  companyFileMemberships,
  companyFileReads,
  companyFiles,
  companyFileVersions,
  documents,
  folders,
  issueAttachments,
  issueWorkProducts,
  issues,
} from "@paperclipai/db";
import type {
  CompanyFile,
  CompanyFileFolderNode,
  CompanyFileUsage,
  CompanyFileVersion,
  CompanyFilesListResponse,
} from "@paperclipai/shared/types/company-file";
import type {
  CreateCompanyFileFolder,
  CreateCompanyFileFromArtifact,
  ListCompanyFilesQuery,
  UpdateCompanyFile,
  UpdateCompanyFileFolder,
} from "@paperclipai/shared/validators/company-file";
import { COMPANY_FILES_DEFAULT_ROOT_FOLDERS } from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { MAX_ATTACHMENT_BYTES, formatAttachmentSize, isAllowedContentType } from "../attachment-types.js";
import type { StorageService } from "../storage/types.js";
import { isThumbnailableContentType } from "./thumbnails.js";

type CompanyFileRow = typeof companyFiles.$inferSelect;
type FolderRow = typeof folders.$inferSelect;
type AssetRow = typeof assets.$inferSelect;

export const COMPANY_FILE_KIND = "company_files" as const;
const COMPANY_FILES_NAMESPACE = "company-files";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function slugifyCompanyFileName(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return slug || "file";
}

function contentPathFor(fileId: string) {
  return `/api/company-files/${fileId}/content`;
}

function thumbnailPathFor(fileId: string) {
  return `/api/company-files/${fileId}/thumbnail`;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

/**
 * Folder ids hidden from agents: a folder with agentVisible = false and every descendant of it.
 * Files whose folder is in this set are invisible to agents (wake index, list, read, content).
 */
export function agentHiddenFolderIds(rows: Array<{ id: string; parentId: string | null; agentVisible: boolean }>): Set<string> {
  const hidden = new Set(rows.filter((row) => !row.agentVisible).map((row) => row.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (!hidden.has(row.id) && row.parentId && hidden.has(row.parentId)) {
        hidden.add(row.id);
        grew = true;
      }
    }
  }
  return hidden;
}

/** Agent-hidden folder ids for one company. Empty when no folder is hidden. */
export async function loadAgentHiddenFolderIds(db: Db, companyId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: folders.id, parentId: folders.parentId, agentVisible: folders.agentVisible })
    .from(folders)
    .where(and(eq(folders.companyId, companyId), eq(folders.kind, COMPANY_FILE_KIND)));
  return agentHiddenFolderIds(rows);
}

/** Drizzle condition that keeps only files outside the hidden folders (root files always pass). */
export function agentVisibleFileCondition(hiddenFolderIds: Set<string>) {
  if (hiddenFolderIds.size === 0) return undefined;
  return or(isNull(companyFiles.folderId), notInArray(companyFiles.folderId, [...hiddenFolderIds]));
}

export type CompanyFileWriteContext = {
  userId?: string | null;
  agentId?: string | null;
};

export type CompanyFileContent = {
  file: CompanyFileRow;
  version: CompanyFileVersion & { objectKey: string; provider: string };
  asset: AssetRow;
};

/** Display name for a user: the auth user's name, else email. Missing users are absent from the map. */
export async function loadUserDisplayNames(db: Db, userIds: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set([...userIds].filter((id): id is string => typeof id === "string" && id.length > 0))];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const rows = await db
    .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
    .from(authUsers)
    .where(inArray(authUsers.id, ids));
  for (const row of rows) {
    const label = row.name?.trim() || row.email?.trim() || null;
    if (label) names.set(row.id, label);
  }
  return names;
}

export function companyFilesService(db: Db, storage: StorageService) {
  // ---------- folders ----------

  async function folderRows(companyId: string): Promise<FolderRow[]> {
    return db
      .select()
      .from(folders)
      .where(and(eq(folders.companyId, companyId), eq(folders.kind, COMPANY_FILE_KIND)))
      .orderBy(asc(folders.position), asc(folders.name), asc(folders.id));
  }

  /** Slash-joined folder path from the root, keyed by folder id, for every company files folder of the company. */
  async function folderPaths(companyId: string): Promise<Map<string, string>> {
    const rows = await folderRows(companyId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const paths = new Map<string, string>();
    const pathFor = (id: string, depth = 0): string => {
      const cached = paths.get(id);
      if (cached !== undefined) return cached;
      const row = byId.get(id)!;
      const parentPath = row.parentId && byId.has(row.parentId) && depth < 64 ? pathFor(row.parentId, depth + 1) : "";
      const full = parentPath ? `${parentPath}/${row.name}` : row.name;
      paths.set(id, full);
      return full;
    };
    for (const row of rows) pathFor(row.id);
    return paths;
  }

  async function getFolderRow(companyId: string, folderId: string): Promise<FolderRow | null> {
    return db
      .select()
      .from(folders)
      .where(and(eq(folders.companyId, companyId), eq(folders.id, folderId), eq(folders.kind, COMPANY_FILE_KIND)))
      .then((rows) => rows[0] ?? null);
  }

  async function assertFolderTarget(companyId: string, folderId: string | null | undefined) {
    if (!folderId) return null;
    const folder = await getFolderRow(companyId, folderId);
    if (!folder) throw unprocessable("Folder must be a company files folder of this company");
    return folder;
  }

  async function ensureDefaultFolders(companyId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const txDb = tx as unknown as Db;
      for (const [position, entry] of COMPANY_FILES_DEFAULT_ROOT_FOLDERS.entries()) {
        await txDb
          .insert(folders)
          .values({
            companyId,
            kind: COMPANY_FILE_KIND,
            parentId: null,
            name: entry.name,
            slug: slugifyCompanyFileName(entry.name),
            systemKey: entry.systemKey,
            position,
          })
          .onConflictDoNothing();
      }
    });
  }

  async function ensureDefaultFoldersIfEmpty(companyId: string): Promise<void> {
    const existing = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.companyId, companyId), eq(folders.kind, COMPANY_FILE_KIND)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (!existing) await ensureDefaultFolders(companyId);
  }

  async function fileAggregates(companyId: string) {
    return db
      .select({
        folderId: companyFiles.folderId,
        count: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${companyFiles.byteSize}), 0)::bigint`,
      })
      .from(companyFiles)
      .where(and(eq(companyFiles.companyId, companyId), isNull(companyFiles.deletedAt)))
      .groupBy(companyFiles.folderId);
  }

  function buildTree(rows: FolderRow[], direct: Map<string | null, { count: number; bytes: number }>) {
    const nodes = new Map<string, CompanyFileFolderNode>();
    for (const row of rows) {
      const own = direct.get(row.id) ?? { count: 0, bytes: 0 };
      nodes.set(row.id, {
        id: row.id,
        parentId: row.parentId,
        name: row.name,
        slug: row.slug,
        systemKey: row.systemKey ?? null,
        position: row.position,
        agentVisible: row.agentVisible,
        fileCount: own.count,
        totalByteSize: own.bytes,
        children: [],
      });
    }
    const roots: CompanyFileFolderNode[] = [];
    for (const row of rows) {
      const node = nodes.get(row.id)!;
      if (row.parentId && nodes.has(row.parentId)) nodes.get(row.parentId)!.children.push(node);
      else roots.push(node);
    }
    // Recursive totals: each node absorbs its descendants' counts and bytes.
    const rollup = (node: CompanyFileFolderNode): { count: number; bytes: number } => {
      let count = node.fileCount;
      let bytes = node.totalByteSize;
      for (const child of node.children) {
        const sub = rollup(child);
        count += sub.count;
        bytes += sub.bytes;
      }
      node.fileCount = count;
      node.totalByteSize = bytes;
      return { count, bytes };
    };
    roots.forEach(rollup);
    return { roots, nodes };
  }

  /** agentView drops hidden folders and their subtrees, so their files are not counted anywhere. */
  async function listFolderTree(companyId: string, options: { agentView?: boolean } = {}): Promise<CompanyFileFolderNode[]> {
    const [allRows, aggregates] = await Promise.all([folderRows(companyId), fileAggregates(companyId)]);
    const hidden = options.agentView ? agentHiddenFolderIds(allRows) : new Set<string>();
    const rows = hidden.size ? allRows.filter((row) => !hidden.has(row.id)) : allRows;
    const direct = new Map<string | null, { count: number; bytes: number }>();
    for (const agg of aggregates) {
      direct.set(agg.folderId ?? null, { count: Number(agg.count), bytes: Number(agg.bytes) });
    }
    return buildTree(rows, direct).roots;
  }

  async function descendantIds(companyId: string, folderId: string): Promise<Set<string>> {
    const rows = await folderRows(companyId);
    const result = new Set<string>([folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of rows) {
        if (row.parentId && result.has(row.parentId) && !result.has(row.id)) {
          result.add(row.id);
          grew = true;
        }
      }
    }
    return result;
  }

  async function createFolder(companyId: string, input: CreateCompanyFileFolder): Promise<FolderRow> {
    const parent = await assertFolderTarget(companyId, input.parentId ?? null);
    const name = input.name.trim();
    try {
      const [row] = await db
        .insert(folders)
        .values({
          companyId,
          kind: COMPANY_FILE_KIND,
          parentId: parent?.id ?? null,
          name,
          slug: slugifyCompanyFileName(name),
          position: 1000000,
        })
        .returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A folder with this name already exists here");
      throw error;
    }
  }

  async function updateFolder(
    companyId: string,
    folderId: string,
    input: UpdateCompanyFileFolder,
  ): Promise<FolderRow & { previousAgentVisible: boolean }> {
    const existing = await getFolderRow(companyId, folderId);
    if (!existing) throw notFound("Folder not found");
    let parentId = existing.parentId;
    if (input.parentId !== undefined) {
      if (input.parentId === folderId) throw unprocessable("A folder cannot be its own parent");
      if (input.parentId) {
        await assertFolderTarget(companyId, input.parentId);
        const blocked = await descendantIds(companyId, folderId);
        if (blocked.has(input.parentId)) throw unprocessable("A folder cannot be moved under its own descendant");
      }
      parentId = input.parentId ?? null;
    }
    const name = input.name?.trim() ?? existing.name;
    try {
      const [row] = await db
        .update(folders)
        .set({
          name,
          slug: slugifyCompanyFileName(name),
          parentId,
          position: input.position ?? existing.position,
          agentVisible: input.agentVisible ?? existing.agentVisible,
          updatedAt: new Date(),
        })
        .where(and(eq(folders.companyId, companyId), eq(folders.id, folderId)))
        .returning();
      return { ...row!, previousAgentVisible: existing.agentVisible };
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A folder with this name already exists here");
      throw error;
    }
  }

  async function deleteFolder(companyId: string, folderId: string): Promise<FolderRow> {
    const existing = await getFolderRow(companyId, folderId);
    if (!existing) throw notFound("Folder not found");
    const child = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.companyId, companyId), eq(folders.parentId, folderId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (child) throw unprocessable("Folder is not empty: move or delete its subfolders first");
    // Soft-deleted files still reference the folder (set null on delete), so count only live files.
    const file = await db
      .select({ id: companyFiles.id })
      .from(companyFiles)
      .where(and(eq(companyFiles.companyId, companyId), eq(companyFiles.folderId, folderId), isNull(companyFiles.deletedAt)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (file) throw unprocessable("Folder is not empty: move or delete its files first");
    await db.delete(folders).where(and(eq(folders.companyId, companyId), eq(folders.id, folderId)));
    return existing;
  }

  // ---------- files: read ----------

  async function hydrate(rows: CompanyFileRow[]): Promise<CompanyFile[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const folderPathById = new Map<string, string>();
    for (const companyId of new Set(rows.map((row) => row.companyId))) {
      for (const [folderId, path] of await folderPaths(companyId)) folderPathById.set(folderId, path);
    }
    const userNames = await loadUserDisplayNames(db, rows.flatMap((row) => [row.createdByUserId, row.updatedByUserId]));
    const hiddenByCompany = new Map<string, Set<string>>();
    for (const companyId of new Set(rows.map((row) => row.companyId))) {
      hiddenByCompany.set(companyId, await loadAgentHiddenFolderIds(db, companyId));
    }
    const [versions, reads] = await Promise.all([
      db
        .select({
          id: companyFileVersions.id,
          fileId: companyFileVersions.fileId,
          versionNumber: companyFileVersions.versionNumber,
        })
        .from(companyFileVersions)
        .where(inArray(companyFileVersions.fileId, ids)),
      db
        .select({
          fileId: companyFileReads.fileId,
          count: sql<number>`count(distinct ${companyFileReads.issueId})::int`,
        })
        .from(companyFileReads)
        .where(and(inArray(companyFileReads.fileId, ids), sql`${companyFileReads.issueId} is not null`))
        .groupBy(companyFileReads.fileId),
    ]);
    const versionCount = new Map<string, number>();
    const versionNumberById = new Map<string, number>();
    for (const version of versions) {
      versionCount.set(version.fileId, (versionCount.get(version.fileId) ?? 0) + 1);
      versionNumberById.set(version.id, version.versionNumber);
    }
    const usedBy = new Map(reads.map((read) => [read.fileId, Number(read.count)]));
    return rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      folderId: row.folderId ?? null,
      folderPath: row.folderId ? (folderPathById.get(row.folderId) ?? "") : "",
      name: row.name,
      slug: row.slug,
      contentType: row.contentType,
      byteSize: Number(row.byteSize),
      currentVersionId: row.currentVersionId ?? null,
      currentVersionNumber: row.currentVersionId ? (versionNumberById.get(row.currentVersionId) ?? null) : null,
      versionCount: versionCount.get(row.id) ?? 0,
      createdByUserId: row.createdByUserId ?? null,
      createdByName: row.createdByUserId ? (userNames.get(row.createdByUserId) ?? null) : null,
      updatedByUserId: row.updatedByUserId ?? null,
      updatedByName: row.updatedByUserId ? (userNames.get(row.updatedByUserId) ?? null) : null,
      contentPath: contentPathFor(row.id),
      downloadPath: `${contentPathFor(row.id)}?download=1`,
      usedInIssueCount: usedBy.get(row.id) ?? 0,
      agentVisible: !(row.folderId && hiddenByCompany.get(row.companyId)?.has(row.folderId)),
      thumbnailPath: isThumbnailableContentType(row.contentType) ? thumbnailPathFor(row.id) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Current version of every live file under a folder (recursively), with paths relative to
   * that folder. Used by the folder ZIP download. Throws 404 for an unknown folder.
   */
  async function folderArchiveEntries(companyId: string, folderId: string) {
    const rows = await folderRows(companyId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const root = byId.get(folderId);
    if (!root) throw notFound("Folder not found");
    const subtree = await descendantIds(companyId, folderId);
    const relativeFolderSegments = (id: string) => {
      const segments: string[] = [];
      const seen = new Set<string>();
      let current = byId.get(id);
      while (current && current.id !== folderId && !seen.has(current.id)) {
        seen.add(current.id);
        segments.unshift(current.name);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return segments;
    };
    const files = await db
      .select({
        id: companyFiles.id,
        folderId: companyFiles.folderId,
        name: companyFiles.name,
        objectKey: assets.objectKey,
        byteSize: assets.byteSize,
      })
      .from(companyFiles)
      .innerJoin(companyFileVersions, eq(companyFileVersions.id, companyFiles.currentVersionId))
      .innerJoin(assets, and(eq(assets.id, companyFileVersions.assetId), eq(assets.companyId, companyId)))
      .where(and(
        eq(companyFiles.companyId, companyId),
        isNull(companyFiles.deletedAt),
        inArray(companyFiles.folderId, [...subtree]),
      ))
      .orderBy(asc(companyFiles.name), asc(companyFiles.id));
    const entries = files.map((file) => ({
      path: [...relativeFolderSegments(file.folderId!), file.name].map((segment) => segment.replace(/[\\/]/g, "-")).join("/"),
      objectKey: file.objectKey,
      byteSize: Number(file.byteSize),
    }));
    return { folderName: root.name, entries };
  }

  /** Whether an agent may see a file in this folder. Board callers do not use this check. */
  async function isAgentVisible(companyId: string, folderId: string | null): Promise<boolean> {
    if (!folderId) return true;
    return !(await loadAgentHiddenFolderIds(db, companyId)).has(folderId);
  }

  async function getRow(fileId: string): Promise<CompanyFileRow | null> {
    return db
      .select()
      .from(companyFiles)
      .where(eq(companyFiles.id, fileId))
      .then((rows) => rows[0] ?? null);
  }

  async function getById(fileId: string): Promise<CompanyFile | null> {
    const row = await getRow(fileId);
    if (!row) return null;
    return (await hydrate([row]))[0] ?? null;
  }

  async function getActiveRow(companyId: string, fileId: string): Promise<CompanyFileRow> {
    const row = await db
      .select()
      .from(companyFiles)
      .where(and(eq(companyFiles.companyId, companyId), eq(companyFiles.id, fileId), isNull(companyFiles.deletedAt)))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("File not found");
    return row;
  }

  function compareFiles(a: CompanyFile, b: CompanyFile, sort: ListCompanyFilesQuery["sort"], dir: ListCompanyFilesQuery["dir"]) {
    let result: number;
    switch (sort) {
      case "type":
        result = a.contentType.localeCompare(b.contentType);
        break;
      case "size":
        result = a.byteSize - b.byteSize;
        break;
      case "date":
        result = a.updatedAt.getTime() - b.updatedAt.getTime();
        break;
      case "uploadedBy":
        result = (a.createdByUserId ?? "").localeCompare(b.createdByUserId ?? "");
        break;
      case "usedBy":
        result = a.usedInIssueCount - b.usedInIssueCount;
        break;
      default:
        result = a.name.localeCompare(b.name);
    }
    if (result === 0) result = a.name.localeCompare(b.name);
    return dir === "desc" ? -result : result;
  }

  /**
   * Folder-scoped listing (folderId, null = root) or, when `q` is set, a search across
   * all folders. scope "all" ignores folderId and lists every folder. Folders are returned
   * as the children of the current level (none for search and scope "all").
   * createdByMe and starred need context.userId; without it they match nothing.
   */
  async function list(
    companyId: string,
    query: ListCompanyFilesQuery,
    context: { userId?: string | null; agentView?: boolean } = {},
  ): Promise<CompanyFilesListResponse> {
    const q = query.q?.trim();
    const conditions = [eq(companyFiles.companyId, companyId)];
    if (!query.includeDeleted) conditions.push(isNull(companyFiles.deletedAt));
    const visibleToAgent = agentVisibleFileCondition(
      context.agentView ? await loadAgentHiddenFolderIds(db, companyId) : new Set<string>(),
    );
    if (visibleToAgent) conditions.push(visibleToAgent);
    if ((query.createdByMe || query.starred) && !context.userId) {
      conditions.push(sql`false`);
    }
    if (query.createdByMe && context.userId) {
      conditions.push(eq(companyFiles.createdByUserId, context.userId));
    }
    if (query.starred && context.userId) {
      conditions.push(inArray(
        companyFiles.id,
        db
          .select({ id: companyFileMemberships.companyFileId })
          .from(companyFileMemberships)
          .where(and(
            eq(companyFileMemberships.companyId, companyId),
            eq(companyFileMemberships.userId, context.userId),
            isNotNull(companyFileMemberships.starredAt),
          )),
      ));
    }
    let folder: CompanyFileFolderNode | null = null;
    let childFolders: CompanyFileFolderNode[] = [];
    if (q) {
      conditions.push(sql`${companyFiles.name} ilike ${`%${escapeLike(q)}%`}`);
    } else if (query.scope === "all") {
      // Every folder: no folder condition and no folder children.
    } else if (query.folderId) {
      const tree = await listFolderTree(companyId, { agentView: context.agentView });
      const stack = [...tree];
      while (stack.length) {
        const node = stack.pop()!;
        if (node.id === query.folderId) {
          folder = node;
          break;
        }
        stack.push(...node.children);
      }
      if (!folder) throw notFound("Folder not found");
      conditions.push(eq(companyFiles.folderId, query.folderId));
      childFolders = folder.children;
    } else {
      conditions.push(isNull(companyFiles.folderId));
      childFolders = await listFolderTree(companyId, { agentView: context.agentView });
    }
    const rows = await db.select().from(companyFiles).where(and(...conditions));
    const files = (await hydrate(rows)).sort((a, b) => compareFiles(a, b, query.sort, query.dir));
    const noFolders = Boolean(q) || query.scope === "all";
    return { folder: noFolders ? null : folder, folders: noFolders ? [] : childFolders, files };
  }

  async function getVersions(fileId: string): Promise<CompanyFileVersion[]> {
    const rows = await db
      .select({ version: companyFileVersions, asset: assets })
      .from(companyFileVersions)
      .innerJoin(assets, eq(companyFileVersions.assetId, assets.id))
      .where(eq(companyFileVersions.fileId, fileId))
      .orderBy(asc(companyFileVersions.versionNumber));
    const userNames = await loadUserDisplayNames(db, rows.map(({ version }) => version.uploadedByUserId));
    return rows.map(({ version, asset }) => ({
      id: version.id,
      fileId: version.fileId,
      versionNumber: version.versionNumber,
      assetId: version.assetId,
      byteSize: Number(asset.byteSize),
      contentType: asset.contentType,
      uploadedByUserId: version.uploadedByUserId ?? null,
      uploadedByName: version.uploadedByUserId ? (userNames.get(version.uploadedByUserId) ?? null) : null,
      note: version.note ?? null,
      contentPath: `${contentPathFor(fileId)}?version=${version.versionNumber}`,
      downloadPath: `${contentPathFor(fileId)}?version=${version.versionNumber}&download=1`,
      createdAt: version.createdAt,
    }));
  }

  async function getUsage(fileId: string): Promise<CompanyFileUsage[]> {
    const rows = await db
      .select({
        issueId: companyFileReads.issueId,
        agentId: companyFileReads.agentId,
        createdAt: companyFileReads.createdAt,
        issueIdentifier: issues.identifier,
        issueTitle: issues.title,
        agentName: agents.name,
      })
      .from(companyFileReads)
      .innerJoin(issues, eq(companyFileReads.issueId, issues.id))
      .leftJoin(agents, eq(companyFileReads.agentId, agents.id))
      .where(and(eq(companyFileReads.fileId, fileId), sql`${companyFileReads.issueId} is not null`));
    const grouped = new Map<string, CompanyFileUsage>();
    for (const row of rows) {
      const key = `${row.issueId}:${row.agentId ?? ""}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          issueId: row.issueId!,
          issueIdentifier: row.issueIdentifier ?? null,
          issueTitle: row.issueTitle,
          agentId: row.agentId ?? null,
          agentName: row.agentName ?? null,
          lastReadAt: row.createdAt,
          readCount: 1,
        });
        continue;
      }
      existing.readCount += 1;
      if (row.createdAt > existing.lastReadAt) existing.lastReadAt = row.createdAt;
    }
    return [...grouped.values()].sort((a, b) => b.lastReadAt.getTime() - a.lastReadAt.getTime());
  }

  /** Resolves the bytes to stream for the content route. Throws 404 for missing or deleted files. */
  async function getContent(fileId: string, versionNumber?: number): Promise<CompanyFileContent> {
    const file = await getRow(fileId);
    if (!file || file.deletedAt) throw notFound("File not found");
    const versionRow = await db
      .select({ version: companyFileVersions, asset: assets })
      .from(companyFileVersions)
      .innerJoin(assets, eq(companyFileVersions.assetId, assets.id))
      .where(
        and(
          eq(companyFileVersions.fileId, fileId),
          versionNumber === undefined
            ? eq(companyFileVersions.id, file.currentVersionId ?? "00000000-0000-0000-0000-000000000000")
            : eq(companyFileVersions.versionNumber, versionNumber),
        ),
      )
      .then((rows) => rows[0] ?? null);
    if (!versionRow) throw notFound("Version not found");
    const { version, asset } = versionRow;
    const uploaderName = version.uploadedByUserId
      ? (await loadUserDisplayNames(db, [version.uploadedByUserId])).get(version.uploadedByUserId) ?? null
      : null;
    return {
      file,
      asset,
      version: {
        id: version.id,
        fileId,
        versionNumber: version.versionNumber,
        assetId: version.assetId,
        byteSize: Number(asset.byteSize),
        contentType: asset.contentType,
        uploadedByUserId: version.uploadedByUserId ?? null,
        uploadedByName: uploaderName,
        note: version.note ?? null,
        contentPath: `${contentPathFor(fileId)}?version=${version.versionNumber}`,
        downloadPath: `${contentPathFor(fileId)}?version=${version.versionNumber}&download=1`,
        createdAt: version.createdAt,
        objectKey: asset.objectKey,
        provider: asset.provider,
      },
    };
  }

  // ---------- files: write ----------

  async function assertNameFree(companyId: string, folderId: string | null, slug: string, excludeFileId?: string) {
    const existing = await db
      .select({ id: companyFiles.id })
      .from(companyFiles)
      .where(
        and(
          eq(companyFiles.companyId, companyId),
          folderId === null ? isNull(companyFiles.folderId) : eq(companyFiles.folderId, folderId),
          eq(companyFiles.slug, slug),
          isNull(companyFiles.deletedAt),
        ),
      )
      .then((rows) => rows[0] ?? null);
    if (existing && existing.id !== excludeFileId) {
      throw conflict("A file with this name already exists in this folder");
    }
  }

  function assertUploadable(contentType: string, byteSize: number) {
    if (!isAllowedContentType(contentType)) {
      throw unprocessable(`File type ${contentType} is not allowed`);
    }
    if (byteSize <= 0) throw unprocessable("File is empty");
    if (byteSize > MAX_ATTACHMENT_BYTES) {
      throw unprocessable(`File is larger than the ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)} limit`);
    }
  }

  /** Stores bytes once and inserts the asset row. The object is removed if the DB insert fails. */
  async function storeAsset(
    companyId: string,
    input: { name: string; contentType: string; buffer: Buffer },
    ctx: CompanyFileWriteContext,
  ): Promise<AssetRow> {
    const stored = await storage.putFile({
      companyId,
      namespace: `${COMPANY_FILES_NAMESPACE}/${companyId}`,
      originalFilename: input.name,
      contentType: input.contentType,
      body: input.buffer,
    });
    try {
      const [asset] = await db
        .insert(assets)
        .values({
          companyId,
          provider: stored.provider,
          objectKey: stored.objectKey,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          sha256: stored.sha256,
          originalFilename: stored.originalFilename,
          createdByAgentId: ctx.agentId ?? null,
          createdByUserId: ctx.userId ?? null,
        })
        .returning();
      return asset!;
    } catch (error) {
      await storage.deleteObject(companyId, stored.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async function create(
    companyId: string,
    input: { folderId?: string | null; name: string; contentType: string; buffer: Buffer } & CompanyFileWriteContext,
  ): Promise<CompanyFile> {
    assertUploadable(input.contentType, input.buffer.length);
    await assertFolderTarget(companyId, input.folderId ?? null);
    const name = input.name.trim();
    const slug = slugifyCompanyFileName(name);
    await assertNameFree(companyId, input.folderId ?? null, slug);
    const asset = await storeAsset(companyId, { name, contentType: input.contentType, buffer: input.buffer }, input);
    return insertFileWithVersion(companyId, {
      folderId: input.folderId ?? null,
      name,
      slug,
      asset,
      userId: input.userId ?? null,
      note: null,
    });
  }

  async function insertFileWithVersion(
    companyId: string,
    input: { folderId: string | null; name: string; slug: string; asset: AssetRow; userId: string | null; note: string | null },
  ): Promise<CompanyFile> {
    try {
      const fileId = await db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        const [file] = await txDb
          .insert(companyFiles)
          .values({
            companyId,
            folderId: input.folderId,
            name: input.name,
            slug: input.slug,
            contentType: input.asset.contentType,
            byteSize: Number(input.asset.byteSize),
            createdByUserId: input.userId,
            updatedByUserId: input.userId,
          })
          .returning();
        const [version] = await txDb
          .insert(companyFileVersions)
          .values({
            companyId,
            fileId: file!.id,
            versionNumber: 1,
            assetId: input.asset.id,
            uploadedByUserId: input.userId,
            note: input.note,
          })
          .returning();
        await txDb
          .update(companyFiles)
          .set({ currentVersionId: version!.id })
          .where(eq(companyFiles.id, file!.id));
        return file!.id;
      });
      return (await getById(fileId))!;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A file with this name already exists in this folder");
      throw error;
    }
  }

  async function addVersion(
    fileId: string,
    input: { buffer: Buffer; contentType: string; note?: string | null } & CompanyFileWriteContext,
  ): Promise<CompanyFile> {
    const file = await db
      .select()
      .from(companyFiles)
      .where(and(eq(companyFiles.id, fileId), isNull(companyFiles.deletedAt)))
      .then((rows) => rows[0] ?? null);
    if (!file) throw notFound("File not found");
    assertUploadable(input.contentType, input.buffer.length);
    const asset = await storeAsset(file.companyId, { name: file.name, contentType: input.contentType, buffer: input.buffer }, input);
    try {
      await db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        const [latest] = await txDb
          .select({ value: sql<number>`coalesce(max(${companyFileVersions.versionNumber}), 0)::int` })
          .from(companyFileVersions)
          .where(eq(companyFileVersions.fileId, fileId));
        const [version] = await txDb
          .insert(companyFileVersions)
          .values({
            companyId: file.companyId,
            fileId,
            versionNumber: Number(latest?.value ?? 0) + 1,
            assetId: asset.id,
            uploadedByUserId: input.userId ?? null,
            note: input.note ?? null,
          })
          .returning();
        await txDb
          .update(companyFiles)
          .set({
            contentType: asset.contentType,
            byteSize: Number(asset.byteSize),
            currentVersionId: version!.id,
            updatedByUserId: input.userId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(companyFiles.id, fileId));
      });
    } catch (error) {
      throw error;
    }
    return (await getById(fileId))!;
  }

  /** Renames and/or moves. Name collisions in the target folder return 409. */
  async function update(companyId: string, fileId: string, input: UpdateCompanyFile & CompanyFileWriteContext): Promise<CompanyFile> {
    const existing = await getActiveRow(companyId, fileId);
    const targetFolderId = input.folderId === undefined ? existing.folderId ?? null : input.folderId;
    await assertFolderTarget(companyId, targetFolderId);
    const name = input.name?.trim() ?? existing.name;
    const slug = slugifyCompanyFileName(name);
    await assertNameFree(companyId, targetFolderId, slug, fileId);
    try {
      await db
        .update(companyFiles)
        .set({
          name,
          slug,
          folderId: targetFolderId,
          updatedByUserId: input.userId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(companyFiles.id, fileId));
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("A file with this name already exists in this folder");
      throw error;
    }
    return (await getById(fileId))!;
  }

  async function softDelete(companyId: string, fileId: string, ctx: CompanyFileWriteContext = {}): Promise<CompanyFile> {
    await getActiveRow(companyId, fileId);
    await db
      .update(companyFiles)
      .set({ deletedAt: new Date(), updatedByUserId: ctx.userId ?? null, updatedAt: new Date() })
      .where(eq(companyFiles.id, fileId));
    return (await getById(fileId))!;
  }

  async function restore(companyId: string, fileId: string, ctx: CompanyFileWriteContext = {}): Promise<CompanyFile> {
    const row = await getRow(fileId);
    if (!row || row.companyId !== companyId) throw notFound("File not found");
    if (!row.deletedAt) return (await getById(fileId))!;
    await assertNameFree(companyId, row.folderId ?? null, row.slug, fileId);
    await db
      .update(companyFiles)
      .set({ deletedAt: null, updatedByUserId: ctx.userId ?? null, updatedAt: new Date() })
      .where(eq(companyFiles.id, fileId));
    return (await getById(fileId))!;
  }

  async function recordRead(input: {
    companyId: string;
    fileId: string;
    versionId: string | null;
    issueId: string | null;
    agentId: string | null;
    runId: string | null;
  }) {
    await db.insert(companyFileReads).values({
      companyId: input.companyId,
      fileId: input.fileId,
      versionId: input.versionId,
      issueId: input.issueId,
      agentId: input.agentId,
      runId: input.runId,
    });
  }

  /**
   * "Pasar a Entrada". Attachments and work products have their bytes copied into a
   * new company-files asset, so deleting the source attachment never removes the file.
   * Documents are exported as a new text asset from latestBody.
   */
  async function createFromArtifact(
    companyId: string,
    input: CreateCompanyFileFromArtifact & CompanyFileWriteContext,
  ): Promise<CompanyFile> {
    let asset: AssetRow | null = null;
    let defaultName: string;

    if (input.source === "attachment" || input.source === "work_product") {
      let attachmentId = "";
      if (input.source === "attachment") {
        attachmentId = input.id;
      } else {
        const workProduct = await db
          .select({ id: issueWorkProducts.id, metadata: issueWorkProducts.metadata })
          .from(issueWorkProducts)
          .where(and(eq(issueWorkProducts.companyId, companyId), eq(issueWorkProducts.id, input.id)))
          .then((rows) => rows[0] ?? null);
        if (!workProduct) throw notFound("Work product not found");
        const metadataAttachmentId = (workProduct.metadata as Record<string, unknown> | null)?.attachmentId;
        if (typeof metadataAttachmentId !== "string") {
          throw unprocessable("Work product has no attached file to copy");
        }
        attachmentId = metadataAttachmentId;
      }
      // Attachment ids are UUIDs; a malformed id from work product metadata must be a 404, not a DB cast error.
      if (!UUID_PATTERN.test(attachmentId)) throw notFound("Attachment not found");
      const row = await db
        .select({ asset: assets })
        .from(issueAttachments)
        .innerJoin(assets, eq(issueAttachments.assetId, assets.id))
        .where(and(eq(issueAttachments.companyId, companyId), eq(issueAttachments.id, attachmentId)))
        .then((rows) => rows[0] ?? null);
      if (!row) throw notFound("Attachment not found");
      if (row.asset.companyId !== companyId) throw notFound("Attachment not found");
      defaultName = row.asset.originalFilename ?? "archivo";
      // Copy the bytes: the issue attachment owns its object and DELETE /api/attachments/:id removes it.
      const source = await storage.getObject(companyId, row.asset.objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of source.stream) chunks.push(Buffer.from(chunk as Buffer));
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) throw unprocessable("File is empty");
      asset = await storeAsset(
        companyId,
        { name: defaultName, contentType: row.asset.contentType, buffer },
        input,
      );
    } else {
      const doc = await db
        .select({ id: documents.id, title: documents.title, format: documents.format, body: documents.latestBody })
        .from(documents)
        .where(and(eq(documents.companyId, companyId), eq(documents.id, input.id)))
        .then((rows) => rows[0] ?? null);
      if (!doc) throw notFound("Document not found");
      if (doc.format !== "markdown") {
        throw unprocessable(`Document format ${doc.format} is not supported for Entrada yet; only markdown documents can be copied`);
      }
      const buffer = Buffer.from(doc.body, "utf8");
      if (buffer.length === 0) throw unprocessable("Document is empty");
      const baseName = (doc.title?.trim() || `documento-${doc.id.slice(0, 8)}`).replace(/[\\/]/g, "-");
      defaultName = baseName.toLowerCase().endsWith(".md") ? baseName : `${baseName}.md`;
      assertUploadable("text/markdown", buffer.length);
      asset = await storeAsset(companyId, { name: defaultName, contentType: "text/markdown", buffer }, input);
    }

    const name = (input.name?.trim() || defaultName).slice(0, 255);
    const folderId = input.folderId ?? null;
    await assertFolderTarget(companyId, folderId);
    const slug = slugifyCompanyFileName(name);
    await assertNameFree(companyId, folderId, slug);
    return insertFileWithVersion(companyId, {
      folderId,
      name,
      slug,
      asset: asset!,
      userId: input.userId ?? null,
      note: `Copied from ${input.source}`,
    });
  }

  return {
    ensureDefaultFolders,
    ensureDefaultFoldersIfEmpty,
    listFolderTree,
    folderPaths,
    createFolder,
    updateFolder,
    deleteFolder,
    list,
    getById,
    getRow,
    getVersions,
    getUsage,
    getContent,
    isAgentVisible,
    folderArchiveEntries,
    create,
    addVersion,
    update,
    softDelete,
    restore,
    recordRead,
    createFromArtifact,
  };
}
