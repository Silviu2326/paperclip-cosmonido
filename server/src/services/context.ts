import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assets, companyFileReads, companyFiles, companyFileVersions, folders, heartbeatRuns, issues } from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import { notFound } from "../errors.js";
import { COMPANY_FILE_KIND, slugifyCompanyFileName } from "./company-files.js";
import type { ContextSearch } from "@paperclipai/shared/validators/company-file";

const CONTEXT_FOLDERS = [
  ["context.offer", "Oferta", "offer"],
  ["context.brand", "Marca", "brand"],
  ["context.procedures", "Procedimientos", "procedure"],
  ["context.customers", "Clientes", "customer"],
] as const;

const MAX_CONTEXT_TEXT_BYTES = 1024 * 1024;
const MAX_CONTEXT_CANDIDATES = 2000;

async function streamText(stream: NodeJS.ReadableStream, maxBytes = MAX_CONTEXT_TEXT_BYTES) {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = maxBytes - size;
    if (buffer.length > remaining) {
      if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
      truncated = true;
      break;
    }
    chunks.push(buffer);
    size += buffer.length;
  }
  return { content: Buffer.concat(chunks).toString("utf8"), truncated };
}

export function contextService(db: Db, storage: StorageService) {
  async function ensureSystemFolders(companyId: string) {
    await db.transaction(async (tx) => {
      for (const [position, [systemKey, name]] of CONTEXT_FOLDERS.entries()) {
        await tx.insert(folders).values({ companyId, kind: COMPANY_FILE_KIND, parentId: null, name, slug: slugifyCompanyFileName(name), systemKey, position: 100 + position }).onConflictDoNothing();
      }
    });
    return db.select().from(folders).where(and(eq(folders.companyId, companyId), inArray(folders.systemKey, CONTEXT_FOLDERS.map(([key]) => key)))).orderBy(asc(folders.position));
  }

  async function search(companyId: string, input: ContextSearch & { projectId?: string | null; allProjects?: boolean; isAgentVisible?: (folderId: string | null) => Promise<boolean> }) {
    const projectAudience = input.projectId
      ? and(eq(companyFiles.audienceKind, "project"), eq(companyFiles.audienceId, input.projectId))
      : input.allProjects ? eq(companyFiles.audienceKind, "project") : null;
    const conditions = [eq(companyFiles.companyId, companyId), isNull(companyFiles.deletedAt), ...(input.includeExpired ? [] : [or(isNull(companyFiles.validUntil), gte(companyFiles.validUntil, new Date()))]), or(eq(companyFiles.audienceKind, "company"), ...(projectAudience ? [projectAudience] : []))!];
    if (input.roles?.length) conditions.push(inArray(companyFiles.contextRole, input.roles));
    const query = input.query?.trim().toLocaleLowerCase();
    const folderVisibility = new Map<string | null, Promise<boolean>>();
    const isVisible = (folderId: string | null) => {
      if (!input.isAgentVisible) return Promise.resolve(true);
      let visibility = folderVisibility.get(folderId);
      if (!visibility) {
        visibility = input.isAgentVisible(folderId);
        folderVisibility.set(folderId, visibility);
      }
      return visibility;
    };
    const matches: Array<{ id: string; companyId: string; name: string; contentType: string; audienceKind: string; audienceId: string | null; validUntil: Date | null; contextRole: string | null; currentVersionId: string | null; assetId: string | null; objectKey: string | null; folderId: string | null; contentTruncated?: boolean }> = [];
    let offset = 0;
    let truncated = false;
    const candidateLimit = MAX_CONTEXT_CANDIDATES;
    let lastPageLength = 0;
    while (offset < candidateLimit && !truncated) {
      const rows = await db.select({ id: companyFiles.id, companyId: companyFiles.companyId, name: companyFiles.name, contentType: companyFiles.contentType, audienceKind: companyFiles.audienceKind, audienceId: companyFiles.audienceId, validUntil: companyFiles.validUntil, contextRole: companyFiles.contextRole, currentVersionId: companyFiles.currentVersionId, assetId: companyFileVersions.assetId, objectKey: assets.objectKey, folderId: companyFiles.folderId })
        .from(companyFiles).leftJoin(companyFileVersions, eq(companyFileVersions.id, companyFiles.currentVersionId)).leftJoin(assets, and(eq(assets.id, companyFileVersions.assetId), eq(assets.companyId, companyId))).where(and(...conditions)).orderBy(asc(companyFiles.name), asc(companyFiles.id)).limit(Math.min(100, candidateLimit - offset)).offset(offset);
      if (rows.length === 0) break;
      lastPageLength = rows.length;
      offset += rows.length;
      for (let index = 0; index < rows.length; index += 4) {
        const batch = rows.slice(index, index + 4);
        const examined = await Promise.all(batch.map(async (row) => {
          if (!(await isVisible(row.folderId))) return null;
          if (!query || row.name.toLocaleLowerCase().includes(query)) return row;
          if (!row.assetId || !row.objectKey || !/^(text\/|application\/(json|xml|yaml)|.*markdown)/i.test(row.contentType)) return null;
          const text = await streamText((await storage.getObject(companyId, row.objectKey)).stream);
          if (!text.content.toLocaleLowerCase().includes(query)) return null;
          return { ...row, contentTruncated: text.truncated };
        }));
        for (const row of examined) {
          if (!row) continue;
          matches.push(row);
          if (matches.length > input.limit) {
            truncated = true;
            break;
          }
        }
        if (truncated) break;
      }
      if (rows.length < 100) break;
    }
    if (!truncated && offset >= candidateLimit && lastPageLength === 100) {
      const extraCandidate = await db.select({ id: companyFiles.id }).from(companyFiles).where(and(...conditions)).orderBy(asc(companyFiles.name), asc(companyFiles.id)).limit(1).offset(candidateLimit);
      truncated = extraCandidate.length > 0;
    }
    return { files: matches.slice(0, input.limit), truncated };
  }

  async function get(fileId: string, scope: { companyId: string; projectId?: string | null; allProjects?: boolean; issueId?: string | null; agentId?: string | null; runId?: string | null; includeExpired?: boolean }) {
    const row = await db.select({ file: companyFiles, asset: assets }).from(companyFiles).leftJoin(companyFileVersions, eq(companyFileVersions.id, companyFiles.currentVersionId)).leftJoin(assets, and(eq(assets.id, companyFileVersions.assetId), eq(assets.companyId, scope.companyId))).where(and(eq(companyFiles.id, fileId), eq(companyFiles.companyId, scope.companyId), isNull(companyFiles.deletedAt))).then(rows => rows[0] ?? null);
    if (!row || !["company", "project"].includes(row.file.audienceKind)
      || (row.file.audienceKind === "project" && !scope.allProjects && (!scope.projectId || row.file.audienceId !== scope.projectId))
      || (!scope.includeExpired && row.file.validUntil && row.file.validUntil < new Date())) throw notFound("Context file not found");
    await db.insert(companyFileReads).values({ companyId: scope.companyId, fileId, versionId: row.file.currentVersionId ?? null, issueId: scope.issueId ?? null, agentId: scope.agentId ?? null, runId: scope.runId ?? null });
    let content = "";
    let contentTruncated = false;
    if (row.asset && /^(text\/|application\/(json|xml|yaml)|.*markdown)/i.test(row.file.contentType)) {
      const text = await streamText((await storage.getObject(scope.companyId, row.asset.objectKey)).stream);
      content = text.content;
      contentTruncated = text.truncated;
    }
    return { fileId, name: row.file.name, contextRole: row.file.contextRole, contentType: row.file.contentType, content, contentTruncated };
  }

  async function projectScope(companyId: string, runId: string | null, agent: boolean) {
    if (!agent || !runId) return null;
    const run = await db.select({ issueId: sql<string | null>`coalesce(${heartbeatRuns.nativeIssueId}, ${heartbeatRuns.issueId})` }).from(heartbeatRuns).where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.companyId, companyId))).then(rows => rows[0] ?? null);
    if (!run?.issueId) return null;
    const issue = await db.select({ projectId: issues.projectId }).from(issues).where(and(eq(issues.id, run.issueId), eq(issues.companyId, companyId))).then(rows => rows[0] ?? null);
    return { issueId: run.issueId, projectId: issue?.projectId ?? null };
  }

  return { ensureSystemFolders, search, get, projectScope };
}
