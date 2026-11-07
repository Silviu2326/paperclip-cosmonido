import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { customerPortalService } from "../services/productization/customer-portal.js";
import { PORTAL_FILE_MAX_BYTES } from "../services/productization/portal-files.js";
import type { StorageService } from "../storage/types.js";
import { badRequest, forbidden, payloadTooLarge, unauthorized } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const createSchema = z.object({
  customerId: z.string().uuid(), contactId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().datetime(),
  resourceKinds: z.array(z.enum(["deliverables", "proposals", "meetings", "conversations", "commitments", "files"])).min(1).max(6).optional(),
  allowDeliverableFeedback: z.boolean().optional(),
  allowFileUploads: z.boolean().optional(),
}).strict();
const uuidParam = z.string().uuid();
const visibilitySchema = z.object({ visible: z.boolean() }).strict();
const uploadFields = z.object({ sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(), contactId: z.string().uuid().optional() });
const commentSchema = z.object({ conversationRef: z.string().length(43), body: z.string().trim().min(1).max(4000) }).strict();
const acceptSchema = z.object({ proposalReference: z.string().length(43), revision: z.number().int().positive(), name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(320) }).strict();
const feedbackSchema = z.object({ reference: z.string().length(43), decision: z.enum(["accept", "changes_requested"]), comment: z.string().trim().max(4000), idempotencyKey: z.string().uuid() }).strict();

function portalToken(req: import("express").Request) {
  const token = req.get("x-paperclip-customer-portal");
  if (!token || token.length > 256) throw unauthorized("Customer portal link is invalid or expired");
  return token;
}

type UploadedFile = { mimetype: string; buffer: Buffer; originalname: string };

/** Streams the stored object as a download only: never inline, never sniffed, never cached. */
function sendDownload(res: Response, next: (error?: unknown) => void, file: { originalFilename: string; contentType: string; byteSize: number }, stream: NodeJS.ReadableStream) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.attachment(file.originalFilename); // sets Content-Type from the extension, so override it afterwards
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Length", String(file.byteSize));
  stream.on("error", (error) => next(error));
  stream.pipe(res);
}

/**
 * Mount under /api; portal tokens are accepted only in X-Paperclip-Customer-Portal.
 * `storage` is the root-created StorageService (same instance as assetRoutes); omit it and file endpoints answer 503.
 */
export function customerPortalRoutes(db: Db, storage?: StorageService | null) {
  const router = Router();
  const service = customerPortalService(db, { storage: storage ?? null });
  const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PORTAL_FILE_MAX_BYTES, files: 1, fields: 4, fieldSize: 256 } });
  async function readSingleFile(req: Request, res: Response): Promise<UploadedFile | undefined> {
    try {
      await new Promise<void>((resolve, reject) => fileUpload.single("file")(req, res, (error: unknown) => (error ? reject(error) : resolve())));
    } catch (error) {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") throw payloadTooLarge("The file is larger than the portal limit");
        throw badRequest("Invalid file upload");
      }
      throw error;
    }
    return (req as Request & { file?: UploadedFile }).file;
  }
  const uploadFieldValues = (req: Request) => {
    const parsed = uploadFields.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest("Invalid upload fields");
    return parsed.data;
  };

  router.post("/companies/:companyId/customer-portals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid customer portal settings", parsed.error.issues);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Only board users can create customer portal links");
    res.status(201).json(await service.create(companyId, parsed.data, actor.actorId));
  });
  router.get("/companies/:companyId/customers/:customerId/customer-portals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const customerId = z.string().uuid().safeParse(req.params.customerId);
    if (!customerId.success) throw badRequest("Invalid customer id");
    res.json(await service.list(companyId, customerId.data));
  });
  router.post("/companies/:companyId/customer-portals/:portalId/revoke", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Only board users can revoke customer portal links");
    res.json(await service.revoke(companyId, req.params.portalId as string, actor.actorId));
  });
  router.get("/companies/:companyId/customer-portals/:portalId/feedback", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Only board users can view customer portal feedback");
    res.json(await service.listFeedback(companyId, req.params.portalId as string));
  });

  // Board: scoped file visibility. Files are always addressed through the company and file id they belong to.
  router.get("/companies/:companyId/customers/:customerId/customer-portal-files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (getActorInfo(req).actorType !== "user") throw forbidden("Only board users can view customer portal files");
    const customerId = uuidParam.safeParse(req.params.customerId);
    if (!customerId.success) throw badRequest("Invalid customer id");
    res.json(await service.listFiles(companyId, customerId.data));
  });
  router.post("/companies/:companyId/customers/:customerId/customer-portal-files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Only board users can share customer portal files");
    const customerId = uuidParam.safeParse(req.params.customerId);
    if (!customerId.success) throw badRequest("Invalid customer id");
    const file = await readSingleFile(req, res);
    if (!file) throw badRequest("Missing file field 'file'");
    const fields = uploadFieldValues(req);
    res.status(201).json(await service.shareFile(companyId, customerId.data, fields.contactId ?? null, actor.actorId, {
      filename: file.originalname || null, contentType: file.mimetype || null, body: file.buffer, claimedSha256: fields.sha256 ?? null,
    }));
  });
  router.post("/companies/:companyId/customer-portal-files/:fileId/visibility", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden("Only board users can change customer portal file visibility");
    const fileId = uuidParam.safeParse(req.params.fileId);
    const parsed = visibilitySchema.safeParse(req.body);
    if (!fileId.success || !parsed.success) throw badRequest("Invalid file visibility change");
    res.json(await service.setFileVisibility(companyId, fileId.data, parsed.data.visible, actor.actorId));
  });
  router.get("/companies/:companyId/customer-portal-files/:fileId/content", async (req, res, next) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (getActorInfo(req).actorType !== "user") throw forbidden("Only board users can download customer portal files");
    const fileId = uuidParam.safeParse(req.params.fileId);
    if (!fileId.success) throw badRequest("Invalid file id");
    const { file, object } = await service.downloadFileForBoard(companyId, fileId.data);
    sendDownload(res, next, file, object.stream);
  });

  // Public: the token authorizes before any upload body is buffered.
  router.post("/public/customer-portals/:portalId/files", async (req, res) => {
    const portalId = req.params.portalId as string;
    const token = portalToken(req);
    const key = uuidParam.safeParse(req.get("idempotency-key"));
    if (!key.success) throw badRequest("Idempotency-Key must be a UUID");
    await service.authorizeUpload(portalId, token);
    const file = await readSingleFile(req, res);
    if (!file) throw badRequest("Missing file field 'file'");
    const fields = uploadFieldValues(req);
    res.setHeader("Cache-Control", "no-store");
    const receipt = await service.uploadFile(portalId, token, {
      idempotencyKey: key.data, filename: file.originalname || null, contentType: file.mimetype || null, body: file.buffer, claimedSha256: fields.sha256 ?? null,
    });
    res.status(receipt.replayed ? 200 : 201).json(receipt);
  });
  router.get("/public/customer-portals/:portalId/files/:reference/content", async (req, res, next) => {
    const reference = z.string().length(43).regex(/^[A-Za-z0-9_-]+$/).safeParse(req.params.reference);
    if (!reference.success) throw badRequest("Invalid file reference");
    const { file, object } = await service.downloadFile(req.params.portalId as string, portalToken(req), reference.data);
    sendDownload(res, next, file, object.stream);
  });

  router.get("/public/customer-portals/:portalId", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.json(await service.get(req.params.portalId as string, portalToken(req)));
  });
  router.post("/public/customer-portals/:portalId/comments", async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid portal comment", parsed.error.issues);
    res.status(201).json(await service.comment(req.params.portalId as string, portalToken(req), parsed.data.conversationRef, parsed.data.body));
  });
  router.post("/public/customer-portals/:portalId/proposal-acceptances", async (req, res) => {
    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid proposal acceptance", parsed.error.issues);
    res.json(await service.acceptProposal(req.params.portalId as string, portalToken(req), parsed.data, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null }));
  });
  router.post("/public/customer-portals/:portalId/deliverable-feedback", async (req, res) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid deliverable feedback", parsed.error.issues);
    res.status(201).json(await service.submitDeliverableFeedback(req.params.portalId as string, portalToken(req), parsed.data));
  });
  return router;
}
