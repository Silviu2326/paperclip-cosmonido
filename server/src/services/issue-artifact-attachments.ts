import { and, eq, isNull } from "drizzle-orm";
import type { AttachIssueArtifact } from "@paperclipai/shared";
import { assets, companyFileVersions, companyFiles, documents, issueAttachments, issueWorkProducts, issues } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import { notFound, unprocessable } from "../errors.js";
import { MAX_ATTACHMENT_BYTES, formatAttachmentSize } from "../attachment-types.js";
import type { StorageService } from "../storage/types.js";
import { issueService } from "./issues.js";
import { loadAgentHiddenFolderIds } from "./company-files.js";

type SourceAsset = typeof assets.$inferSelect;

async function sourceIssueId(db: Db, companyId: string, input: AttachIssueArtifact): Promise<string | null> {
  if (input.source === "company_file") return null;
  if (input.source === "attachment") {
    const row = await db.select({ issueId: issueAttachments.issueId }).from(issueAttachments)
      .where(and(eq(issueAttachments.companyId, companyId), eq(issueAttachments.id, input.id)))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Artifact not found");
    return row.issueId;
  }
  if (input.source === "document") {
    const row = await db.select({ issueId: documents.issueId }).from(documents)
      .where(and(eq(documents.companyId, companyId), eq(documents.id, input.id)))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Artifact not found");
    return row.issueId;
  }
  const row = await db.select({ issueId: issueWorkProducts.issueId }).from(issueWorkProducts)
    .where(and(eq(issueWorkProducts.companyId, companyId), eq(issueWorkProducts.id, input.id)))
    .then((rows) => rows[0] ?? null);
  if (!row) throw notFound("Artifact not found");
  return row.issueId;
}

export async function getIssueArtifactSourceIssueId(db: Db, companyId: string, input: AttachIssueArtifact) {
  return sourceIssueId(db, companyId, input);
}

async function resolveSource(db: Db, companyId: string, target: { projectId: string | null }, input: AttachIssueArtifact) {
  if (input.source === "company_file") {
    const file = await db.select().from(companyFiles)
      .where(and(eq(companyFiles.companyId, companyId), eq(companyFiles.id, input.id), isNull(companyFiles.deletedAt)))
      .then((rows) => rows[0] ?? null);
    if (!file) throw notFound("File not found");
    if (file.audienceKind === "project" && file.audienceId !== target.projectId) {
      throw notFound("File not found");
    }
    if (file.audienceKind === "customer") throw unprocessable("Customer files cannot be attached to tasks");
    if (file.audienceKind !== "company" && file.audienceKind !== "project") throw notFound("File not found");
    const hiddenFolders = await loadAgentHiddenFolderIds(db, companyId);
    if (file.folderId && hiddenFolders.has(file.folderId)) throw notFound("File not found");
    const versionId = input.versionId ?? file.currentVersionId;
    if (!versionId) throw unprocessable("File has no stored version");
    const version = await db.select({ asset: assets }).from(companyFileVersions)
      .innerJoin(assets, eq(assets.id, companyFileVersions.assetId))
      .where(and(
        eq(companyFileVersions.companyId, companyId),
        eq(companyFileVersions.fileId, file.id),
        eq(companyFileVersions.id, versionId),
      )).then((rows) => rows[0] ?? null);
    if (!version || version.asset.companyId !== companyId) throw notFound("File version not found");
    return { asset: version.asset, name: file.name, sourceIssueId: null };
  }

  if (input.source === "document") {
    const row = await db.select({ issueId: documents.issueId, title: documents.title, format: documents.format, body: documents.latestBody })
      .from(documents).where(and(eq(documents.companyId, companyId), eq(documents.id, input.id)))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Artifact not found");
    if (row.format !== "markdown") throw unprocessable("Only Markdown documents can be attached");
    const name = (row.title?.trim() || "document").replace(/[\\/]/g, "-");
    const filename = name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
    return { bytes: Buffer.from(row.body, "utf8"), contentType: "text/markdown", name: filename, sourceIssueId: row.issueId };
  }

  let attachmentId = input.id;
  let sourceIssueId: string | null = null;
  if (input.source === "work_product") {
    const product = await db.select({ issueId: issueWorkProducts.issueId, metadata: issueWorkProducts.metadata })
      .from(issueWorkProducts).where(and(eq(issueWorkProducts.companyId, companyId), eq(issueWorkProducts.id, input.id)))
      .then((rows) => rows[0] ?? null);
    const metadataAttachmentId = (product?.metadata as Record<string, unknown> | null)?.attachmentId;
    if (!product || typeof metadataAttachmentId !== "string") throw unprocessable("Artifact has no attached file to copy");
    attachmentId = metadataAttachmentId;
    sourceIssueId = product.issueId;
  }
  const attachmentConditions = [eq(issueAttachments.companyId, companyId), eq(issueAttachments.id, attachmentId)];
  if (sourceIssueId) attachmentConditions.push(eq(issueAttachments.issueId, sourceIssueId));
  const row = await db.select({ asset: assets, issueId: issueAttachments.issueId }).from(issueAttachments)
    .innerJoin(assets, eq(assets.id, issueAttachments.assetId))
    .where(and(...attachmentConditions))
    .then((rows) => rows[0] ?? null);
  if (!row || row.asset.companyId !== companyId) throw notFound("Artifact not found");
  return { asset: row.asset, name: row.asset.originalFilename ?? "attachment", sourceIssueId: sourceIssueId ?? row.issueId };
}

async function readAssetBytes(storage: StorageService, companyId: string, asset: SourceAsset) {
  if (asset.byteSize > MAX_ATTACHMENT_BYTES) throw unprocessable(`File is larger than the ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)} limit`);
  const object = await storage.getObject(companyId, asset.objectKey);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of object.stream) {
    const bytes = Buffer.from(chunk as Buffer);
    total += bytes.length;
    if (total > MAX_ATTACHMENT_BYTES) throw unprocessable(`File is larger than the ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)} limit`);
    chunks.push(bytes);
  }
  if (total === 0) throw unprocessable("File is empty");
  return Buffer.concat(chunks);
}

export async function attachIssueArtifact(db: Db, storage: StorageService, input: {
  companyId: string;
  issueId: string;
  source: AttachIssueArtifact;
  actor: { agentId?: string | null; userId?: string | null; runId?: string | null };
}) {
  const issue = await db.select({ id: issues.id, companyId: issues.companyId, projectId: issues.projectId })
    .from(issues).where(and(eq(issues.id, input.issueId), eq(issues.companyId, input.companyId)))
    .then((rows) => rows[0] ?? null);
  if (!issue) throw notFound("Task not found");
  const resolved = await resolveSource(db, input.companyId, issue, input.source);
  const bytes = "bytes" in resolved ? resolved.bytes : await readAssetBytes(storage, input.companyId, resolved.asset);
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw unprocessable(`File is larger than the ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)} limit`);
  if (bytes.length === 0) throw unprocessable("File is empty");
  const stored = await storage.putFile({
    companyId: input.companyId,
    namespace: `issues/${issue.id}`,
    originalFilename: resolved.name,
    contentType: "asset" in resolved ? resolved.asset.contentType : resolved.contentType,
    body: bytes,
  });
  try {
    return await issueService(db).createAttachment({
      issueId: issue.id,
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: input.actor.agentId,
      createdByUserId: input.actor.userId,
      createdByRunId: input.actor.runId,
    });
  } catch (error) {
    await storage.deleteObject(input.companyId, stored.objectKey).catch(() => undefined);
    throw error;
  }
}
