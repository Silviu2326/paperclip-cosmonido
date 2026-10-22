import { Router, type Request, type Response } from "express";
import multer from "multer";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { folders, goals, heartbeatRuns, projects } from "@paperclipai/db";
import {
  contextSearchSchema,
  contextGetSchema,
  createCompanyFileFolderSchema,
  createCompanyFileFromArtifactSchema,
  listCompanyFilesQuerySchema,
  updateCompanyFileFolderSchema,
  updateCompanyFileSchema,
} from "@paperclipai/shared/validators/company-file";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound, payloadTooLarge, unprocessable } from "../errors.js";
import { logActivity } from "../services/index.js";
import { companyFilesService } from "../services/company-files.js";
import { contextService } from "../services/context.js";
import { projectToolContext } from "../services/project-tool-context.js";
import { getAssetThumbnail, type ThumbnailResult } from "../services/thumbnails.js";
import { ARCHIVE_MAX_TOTAL_BYTES, archiveTotalBytes, safeZipSegment, streamZipResponse } from "../services/zip-archive.js";
import type { StorageService } from "../storage/types.js";
import {
  MAX_ATTACHMENT_BYTES,
  SVG_CONTENT_TYPE,
  formatAttachmentSize,
  isInlineAttachmentContentType,
  normalizeUploadAttachmentContentType,
} from "../attachment-types.js";
import {
  assertBoard,
  assertCompanyAccess,
  getAccessibleResource,
  getActorInfo,
  hasCompanyAccess,
} from "./authz.js";

type ParsedRange = { kind: "none" } | { kind: "invalid" } | { kind: "range"; start: number; end: number };

/** Same semantics as the attachment content route (routes/issues.ts); kept local because that helper is not exported. */
function parseRangeHeader(raw: string | undefined, contentLength: number): ParsedRange {
  if (!raw) return { kind: "none" };
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) return { kind: "invalid" };
  const prefix = "bytes=";
  if (!raw.toLowerCase().startsWith(prefix)) return { kind: "invalid" };
  const spec = raw.slice(prefix.length).trim();
  if (!spec || spec.includes(",")) return { kind: "invalid" };
  const [startRaw, endRaw] = spec.split("-", 2);
  if (endRaw === undefined) return { kind: "invalid" };
  if (startRaw === "") {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: "invalid" };
    return { kind: "range", start: Math.max(contentLength - suffixLength, 0), end: contentLength - 1 };
  }
  const start = Number.parseInt(startRaw, 10);
  if (!Number.isSafeInteger(start) || start < 0 || start >= contentLength) return { kind: "invalid" };
  const end = endRaw === "" ? contentLength - 1 : Number.parseInt(endRaw, 10);
  if (!Number.isSafeInteger(end) || end < start) return { kind: "invalid" };
  return { kind: "range", start, end: Math.min(end, contentLength - 1) };
}

function parseBooleanQuery(value: unknown) {
  return value === true || value === "true" || value === "1";
}

/** Like parseBooleanQuery but keeps "absent" distinct from false. */
function parseOptionalBooleanQuery(value: unknown): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  // Unrecognized values reach zod unchanged so the query is rejected with a 400.
  return value as boolean;
}

/** Streams a cached or freshly generated thumbnail. Thumbnails are per asset, so private caching is safe. */
function sendThumbnail(res: Response, thumbnail: ThumbnailResult, next: (err: unknown) => void) {
  res.setHeader("Content-Type", thumbnail.contentType);
  res.setHeader("Content-Length", String(thumbnail.contentLength));
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  thumbnail.stream.on("error", (err) => next(err));
  thumbnail.stream.pipe(res);
}

function parseVersionQuery(value: unknown): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw badRequest("version must be a positive integer");
  return parsed;
}

async function runSingleFileUpload(req: Request, res: Response) {
  const upload = multer({
    storage: multer.memoryStorage(),
    defParamCharset: "utf8",
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  });
  await new Promise<void>((resolve, reject) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Reads the uploaded file. Returns null when the response has already been sent. */
async function readUpload(req: Request, res: Response) {
  try {
    await runSingleFileUpload(req, res);
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(422).json({ error: `File is larger than the ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)} limit` });
        return null;
      }
      res.status(400).json({ error: err.message });
      return null;
    }
    throw err;
  }
  const file = (req as Request & { file?: { mimetype: string; buffer: Buffer; originalname: string } }).file;
  if (!file) {
    res.status(400).json({ error: "Missing file field 'file'" });
    return null;
  }
  const contentType = normalizeUploadAttachmentContentType({
    contentType: file.mimetype,
    originalFilename: file.originalname,
  });
  return { buffer: file.buffer, name: file.originalname || "archivo", contentType };
}

export function companyFileRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const svc = companyFilesService(db, storage);
  const context = contextService(db, storage);

  async function resolveContextActor(req: Request, companyId: string) {
    if (req.actor.type !== "agent") return { companyId, allProjects: true as const };
    const runContext = await projectToolContext(db, req.actor, false, "Context");
    if (runContext.run.companyId !== companyId) throw notFound("Context file not found");
    return {
      companyId,
      projectId: runContext.issue.projectId,
      issueId: runContext.issue.id,
      agentId: runContext.run.agentId,
      runId: runContext.run.id,
      isAgentVisible: (folderId: string | null) => svc.isAgentVisible(companyId, folderId),
    };
  }

  router.get("/companies/:companyId/context", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const parsed = contextSearchSchema.safeParse({
      query: typeof req.query.query === "string" ? req.query.query : undefined,
      roles: typeof req.query.roles === "string" ? req.query.roles.split(",") : undefined,
      includeExpired: parseOptionalBooleanQuery(req.query.includeExpired) ?? false,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    if (!parsed.success) throw badRequest("Invalid context query", parsed.error.issues);
    const scope = await resolveContextActor(req, companyId);
    const folders = await context.ensureSystemFolders(companyId);
    const result = await context.search(companyId, { ...parsed.data, ...scope, allProjects: req.actor.type === "board" });
    res.json({ folders, ...result });
  });

  router.get("/companies/:companyId/context/:fileId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const parsed = contextGetSchema.safeParse({ fileId: req.params.fileId, includeExpired: parseOptionalBooleanQuery(req.query.includeExpired) ?? false });
    if (!parsed.success) throw badRequest("Invalid context file id", parsed.error.issues);
    const scope = await resolveContextActor(req, companyId);
    if (req.actor.type === "agent") {
      const file = await svc.getRow(parsed.data.fileId);
      if (!file || file.companyId !== companyId || file.deletedAt || !(await svc.isAgentVisible(companyId, file.folderId))) throw notFound("Context file not found");
    }
    const file = await context.get(parsed.data.fileId, {
      ...scope,
      includeExpired: parsed.data.includeExpired,
    });
    res.json(file);
  });

  router.get("/assignments/:id/context-usage", async (req, res) => {
    assertBoard(req);
    const assignmentId = req.params.id as string;
    const assignment = await db.select({ id: goals.id, companyId: goals.companyId, rootIssueId: goals.rootIssueId })
      .from(goals).where(and(eq(goals.id, assignmentId), eq(goals.kind, "assignment"))).then((rows) => rows[0] ?? null);
    if (!assignment) throw notFound("Assignment not found");
    assertCompanyAccess(req, assignment.companyId);
    if (!assignment.rootIssueId) return res.json([]);
    const result = await db.execute(sql`
      WITH RECURSIVE task_tree(id, depth) AS (
        SELECT id, 0 FROM issues WHERE id = ${assignment.rootIssueId} AND company_id = ${assignment.companyId}
        UNION ALL
        SELECT child.id, parent.depth + 1 FROM issues child JOIN task_tree parent ON child.parent_id = parent.id
        WHERE child.company_id = ${assignment.companyId} AND parent.depth < 64
      )
      SELECT f.id AS "fileId", f.name, f.context_role AS "contextRole",
        max(r.created_at) AS "lastReadAt", count(r.id)::int AS "readCount",
        count(DISTINCT r.issue_id)::int AS "issueCount"
      FROM company_file_reads r
      JOIN task_tree t ON t.id = r.issue_id
      JOIN company_files f ON f.id = r.file_id AND f.company_id = ${assignment.companyId}
      WHERE r.company_id = ${assignment.companyId}
      GROUP BY f.id, f.name, f.context_role
      ORDER BY max(r.created_at) DESC, f.name ASC
    `);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown }).rows ?? [];
    res.json(rows);
  });

  async function logFileActivity(
    req: Request,
    companyId: string,
    action: string,
    entityId: string,
    details: Record<string, unknown>,
    entityType: "company_file" | "folder" = "company_file",
  ) {
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action,
      entityType,
      entityId,
      details,
    });
  }

  /** Agents never see files under an agent-hidden folder; they get the same 404 as a missing file. */
  async function assertAgentCanSeeFile(req: Request, file: { companyId: string; folderId: string | null }) {
    if (req.actor.type !== "agent") return;
    if (!(await svc.isAgentVisible(file.companyId, file.folderId))) throw notFound("File not found");
  }

  async function folderCompanyId(folderId: string) {
    const row = await db
      .select({ companyId: folders.companyId })
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.kind, "company_files")))
      .then((rows) => rows[0] ?? null);
    return row?.companyId ?? null;
  }

  // ---------- listing ----------

  router.get("/companies/:companyId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = {
      folderId: typeof req.query.folderId === "string" && req.query.folderId ? req.query.folderId : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      sort: typeof req.query.sort === "string" ? req.query.sort : undefined,
      dir: typeof req.query.dir === "string" ? req.query.dir : undefined,
      includeDeleted: parseBooleanQuery(req.query.includeDeleted),
      scope: typeof req.query.scope === "string" && req.query.scope ? req.query.scope : undefined,
      createdByMe: parseOptionalBooleanQuery(req.query.createdByMe),
      starred: parseOptionalBooleanQuery(req.query.starred),
    };
    const parsed = listCompanyFilesQuerySchema.safeParse(query);
    if (!parsed.success) throw badRequest("Invalid query", parsed.error.issues);
    // Per-user filters need a board user; agents get a 400 instead of silently empty results.
    const userScoped = parsed.data.createdByMe === true || parsed.data.starred === true;
    if (userScoped && req.actor.type !== "board") {
      throw badRequest("createdByMe and starred are only available to board users");
    }
    await svc.ensureDefaultFoldersIfEmpty(companyId);
    res.json(await svc.list(companyId, parsed.data, {
      userId: req.actor.type === "board" ? req.actor.userId ?? null : null,
      agentView: req.actor.type === "agent",
    }));
  });

  router.get("/companies/:companyId/files/tree", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    await svc.ensureDefaultFoldersIfEmpty(companyId);
    res.json(await svc.listFolderTree(companyId, { agentView: req.actor.type === "agent" }));
  });

  // ---------- upload and versions ----------

  router.post("/companies/:companyId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const upload = await readUpload(req, res);
    if (!upload) return;
    const folderId = typeof req.body?.folderId === "string" && req.body.folderId ? req.body.folderId : null;
    await svc.ensureDefaultFoldersIfEmpty(companyId);
    const actor = getActorInfo(req);
    const created = await svc.create(companyId, {
      folderId,
      name: upload.name,
      contentType: upload.contentType,
      buffer: upload.buffer,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logFileActivity(req, companyId, "company_file.created", created.id, {
      name: created.name,
      folderId: created.folderId,
      contentType: created.contentType,
      byteSize: created.byteSize,
    });
    res.status(201).json(created);
  });

  router.post("/company-files/:id/versions", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getRow(id), "File not found");
    if (!existing) return;
    assertBoard(req);
    const upload = await readUpload(req, res);
    if (!upload) return;
    const actor = getActorInfo(req);
    const file = await svc.addVersion(id, {
      buffer: upload.buffer,
      contentType: upload.contentType,
      userId: actor.actorType === "user" ? actor.actorId : null,
      note: typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null,
    });
    await logFileActivity(req, existing.companyId, "company_file.version_added", id, {
      name: file.name,
      versionNumber: file.currentVersionNumber,
      byteSize: file.byteSize,
    });
    res.status(201).json(file);
  });

  router.get("/company-files/:id/versions", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getRow(id), "File not found");
    if (!existing) return;
    await assertAgentCanSeeFile(req, existing);
    res.json(await svc.getVersions(id));
  });

  router.get("/company-files/:id/usage", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getRow(id), "File not found");
    if (!existing) return;
    await assertAgentCanSeeFile(req, existing);
    res.json(await svc.getUsage(id));
  });

  // Thumbnail of the current version. Same access rules as the content route.
  router.get("/company-files/:id/thumbnail", async (req, res, next) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getRow(id), "File not found");
    if (!existing) return;
    await assertAgentCanSeeFile(req, existing);
    if (existing.deletedAt) throw notFound("File not found");
    const content = await svc.getContent(id);
    const thumbnail = await getAssetThumbnail(storage, {
      companyId: existing.companyId,
      assetId: content.asset.id,
      objectKey: content.version.objectKey,
      contentType: content.version.contentType,
    });
    if (!thumbnail) throw notFound("Thumbnail not available for this file");
    sendThumbnail(res, thumbnail, next);
  });

  // ---------- single file ----------

  router.patch("/company-files/:id", validate(updateCompanyFileSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getRow(id), "File not found");
    if (!existing) return;
    assertBoard(req);
    const audienceKind = req.body.audienceKind ?? existing.audienceKind;
    const audienceId = req.body.audienceId === undefined ? existing.audienceId : req.body.audienceId;
    if (audienceKind === "project") {
      if (!audienceId) throw badRequest("audienceId is required for project context");
      const project = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, audienceId), eq(projects.companyId, existing.companyId))).then((rows) => rows[0] ?? null);
      if (!project) throw notFound("Project not found");
    } else if (audienceKind === "customer") {
      throw unprocessable("Customer context is not available yet");
    } else if (audienceId) {
      throw badRequest("audienceId must be empty for company context");
    }
    const actor = getActorInfo(req);
    const updated = await svc.update(existing.companyId, id, {
      ...req.body,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logFileActivity(req, existing.companyId, "company_file.updated", id, {
      name: updated.name,
      folderId: updated.folderId,
    });
    res.json(updated);
  });

  router.delete("/company-files/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getRow(id), "File not found");
    if (!existing) return;
    assertBoard(req);
    const actor = getActorInfo(req);
    const deleted = await svc.softDelete(existing.companyId, id, {
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logFileActivity(req, existing.companyId, "company_file.deleted", id, { name: deleted.name });
    res.json(deleted);
  });

  router.post("/company-files/:id/restore", async (req, res) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getRow(id), "File not found");
    if (!existing) return;
    assertBoard(req);
    const actor = getActorInfo(req);
    const restored = await svc.restore(existing.companyId, id, {
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logFileActivity(req, existing.companyId, "company_file.updated", id, { name: restored.name, restored: true });
    res.json(restored);
  });

  router.get("/company-files/:id/content", async (req, res, next) => {
    const id = req.params.id as string;
    const existing = await getAccessibleResource(req, res, svc.getRow(id), "File not found");
    if (!existing) return;
    await assertAgentCanSeeFile(req, existing);
    const version = parseVersionQuery(req.query.version);
    const content = await svc.getContent(id, version);

    if (req.actor.type === "agent") {
      // Run context: the heartbeat run's issue. Null when the run is unknown or not in this company.
      const runId = req.actor.runId ?? null;
      const issueId = runId
        ? await db
            .select({ issueId: heartbeatRuns.issueId })
            .from(heartbeatRuns)
            .where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.companyId, existing.companyId)))
            .then((rows) => rows[0]?.issueId ?? null)
        : null;
      await svc.recordRead({
        companyId: existing.companyId,
        fileId: id,
        versionId: content.version.id,
        issueId,
        agentId: req.actor.agentId ?? null,
        runId,
      });
      await logFileActivity(req, existing.companyId, "company_file.read", id, {
        versionNumber: content.version.versionNumber,
        issueId,
      });
    }

    const contentLength = content.version.byteSize;
    const range = parseRangeHeader(typeof req.headers.range === "string" ? req.headers.range : undefined, contentLength);
    res.setHeader("Accept-Ranges", "bytes");
    if (range.kind === "invalid") {
      res.setHeader("Content-Range", `bytes */${contentLength}`);
      res.status(416).end();
      return;
    }

    const object = await storage.getObject(
      existing.companyId,
      content.version.objectKey,
      range.kind === "range" ? { range: { start: range.start, end: range.end } } : undefined,
    );
    const responseContentType = content.version.contentType;
    const isMarkdown = responseContentType === "text/markdown";
    res.attachment(content.file.name);
    res.setHeader("Content-Type", isMarkdown ? `${responseContentType}; charset=utf-8` : responseContentType);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (responseContentType === SVG_CONTENT_TYPE) {
      res.setHeader(
        "Content-Security-Policy",
        "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      );
    }
    const disposition = parseBooleanQuery(req.query.download)
      ? "attachment"
      : isInlineAttachmentContentType(responseContentType)
        ? "inline"
        : "attachment";
    res.setHeader(
      "Content-Disposition",
      String(res.getHeader("Content-Disposition")).replace(/^attachment;/, `${disposition};`),
    );
    object.stream.on("error", (err) => next(err));
    if (range.kind === "range") {
      res.status(206);
      res.setHeader("Content-Length", String(range.end - range.start + 1));
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${contentLength}`);
      object.stream.pipe(res);
      return;
    }
    res.setHeader("Content-Length", String(contentLength || object.contentLength || 0));
    object.stream.pipe(res);
  });

  // ---------- folders ----------

  router.post("/companies/:companyId/files/folders", validate(createCompanyFileFolderSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    await svc.ensureDefaultFoldersIfEmpty(companyId);
    const created = await svc.createFolder(companyId, req.body);
    await logFileActivity(req, companyId, "folder.created", created.id, { kind: "company_files", name: created.name, parentId: created.parentId }, "folder");
    res.status(201).json(created);
  });

  router.patch("/company-files/folders/:id", validate(updateCompanyFileFolderSchema), async (req, res) => {
    const id = req.params.id as string;
    const companyId = await folderCompanyId(id);
    if (!companyId) throw notFound("Folder not found");
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const { previousAgentVisible, ...updated } = await svc.updateFolder(companyId, id, req.body);
    const visibilityChanged = previousAgentVisible !== updated.agentVisible;
    await logFileActivity(req, companyId, "folder.updated", id, {
      kind: "company_files",
      name: updated.name,
      parentId: updated.parentId,
      ...(visibilityChanged ? { agentVisible: { from: previousAgentVisible, to: updated.agentVisible } } : {}),
    }, "folder");
    res.json(updated);
  });

  // ---------- ZIP download ----------

  router.get("/company-files/folders/:id/archive", async (req, res) => {
    const id = req.params.id as string;
    const companyId = await folderCompanyId(id);
    if (!companyId || !hasCompanyAccess(req, companyId)) throw notFound("Folder not found");
    assertBoard(req);
    const { folderName, entries } = await svc.folderArchiveEntries(companyId, id);
    if (entries.length === 0) throw unprocessable("Folder has no files to archive");
    const totalByteSize = archiveTotalBytes(entries);
    if (totalByteSize > ARCHIVE_MAX_TOTAL_BYTES) {
      throw payloadTooLarge(`Archive is larger than the ${ARCHIVE_MAX_TOTAL_BYTES / (1024 * 1024)} MB limit`);
    }
    await logFileActivity(req, companyId, "company_file.archive_downloaded", id, {
      folderName,
      entryCount: entries.length,
      byteSize: totalByteSize,
    }, "folder");
    res.attachment(`${safeZipSegment(folderName)}.zip`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    streamZipResponse(res, { storage, companyId, entries });
  });

  router.delete("/company-files/folders/:id", async (req, res) => {
    const id = req.params.id as string;
    const companyId = await folderCompanyId(id);
    if (!companyId) throw notFound("Folder not found");
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const deleted = await svc.deleteFolder(companyId, id);
    await logFileActivity(req, companyId, "folder.deleted", id, { kind: "company_files", name: deleted.name }, "folder");
    res.json({ deleted: { id: deleted.id, name: deleted.name } });
  });

  // ---------- Pasar a Entrada ----------

  router.post("/companies/:companyId/files/from-artifact", validate(createCompanyFileFromArtifactSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    await svc.ensureDefaultFoldersIfEmpty(companyId);
    const actor = getActorInfo(req);
    const created = await svc.createFromArtifact(companyId, {
      ...req.body,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logFileActivity(req, companyId, "company_file.created", created.id, {
      name: created.name,
      source: req.body.source,
      sourceId: req.body.id,
      byteSize: created.byteSize,
    });
    res.status(201).json(created);
  });

  return router;
}
