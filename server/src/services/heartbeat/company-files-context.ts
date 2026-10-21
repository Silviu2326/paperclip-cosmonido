import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyFileVersions, companyFiles, folders } from "@paperclipai/db";
import { COMPANY_FILES_INDEX_MAX_ENTRIES } from "@paperclipai/shared";
import { COMPANY_FILE_KIND, agentVisibleFileCondition, loadAgentHiddenFolderIds } from "../company-files.js";

// Company files (Entrada) index injected into wake context. Metadata only: file
// bytes are never loaded here. Agents read contents through the REST route, the
// CLI, or the native runner tools, which record each read.

export type CompanyFilesIndexEntry = {
  fileId: string;
  path: string;
  name: string;
  contentType: string;
  byteSize: number;
  version: number;
  updatedAt: string;
};

export type CompanyFilesIndex = {
  entries: CompanyFilesIndexEntry[];
  truncated: boolean;
  total: number;
};

/** Resolves "Marca/Guias/file.pdf"-style paths from the company's file folder tree. */
export async function loadCompanyFilePathBuilder(db: Db, companyId: string) {
  const folderRows = await db
    .select({ id: folders.id, parentId: folders.parentId, name: folders.name })
    .from(folders)
    .where(and(eq(folders.companyId, companyId), eq(folders.kind, COMPANY_FILE_KIND)));
  const foldersById = new Map(folderRows.map((row) => [row.id, row]));
  return (folderId: string | null, name: string): string => {
    const segments: string[] = [];
    const seen = new Set<string>();
    let current = folderId ? foldersById.get(folderId) : undefined;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      segments.unshift(current.name);
      current = current.parentId ? foldersById.get(current.parentId) : undefined;
    }
    return [...segments, name].join("/");
  };
}

/**
 * Wake index for agents. Files in agent-hidden folders (folder.agentVisible = false, or any
 * ancestor hidden) are excluded from both the entries and the total.
 */
export async function loadCompanyFilesIndex(db: Db, companyId: string): Promise<CompanyFilesIndex> {
  const visibleToAgent = agentVisibleFileCondition(await loadAgentHiddenFolderIds(db, companyId));
  const [pathFor, fileRows, countRows] = await Promise.all([
    loadCompanyFilePathBuilder(db, companyId),
    db
      .select({
        fileId: companyFiles.id,
        folderId: companyFiles.folderId,
        name: companyFiles.name,
        contentType: companyFiles.contentType,
        byteSize: companyFiles.byteSize,
        version: companyFileVersions.versionNumber,
        updatedAt: companyFiles.updatedAt,
      })
      .from(companyFiles)
      .leftJoin(companyFileVersions, eq(companyFileVersions.id, companyFiles.currentVersionId))
      .where(and(eq(companyFiles.companyId, companyId), isNull(companyFiles.deletedAt), visibleToAgent))
      .orderBy(desc(companyFiles.updatedAt), desc(companyFiles.id))
      .limit(COMPANY_FILES_INDEX_MAX_ENTRIES + 1),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(companyFiles)
      .where(and(eq(companyFiles.companyId, companyId), isNull(companyFiles.deletedAt), visibleToAgent)),
  ]);

  const truncated = fileRows.length > COMPANY_FILES_INDEX_MAX_ENTRIES;
  const entries = fileRows.slice(0, COMPANY_FILES_INDEX_MAX_ENTRIES).map((row) => ({
    fileId: row.fileId,
    path: pathFor(row.folderId, row.name),
    name: row.name,
    contentType: row.contentType,
    byteSize: Number(row.byteSize),
    version: row.version ?? 1,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return { entries, truncated, total: Number(countRows[0]?.total ?? 0) };
}
