import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Readable } from "node:stream";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assets, customerContacts, customerPortalFiles, customerPortals, customers } from "@paperclipai/db";
import {
  CUSTOMER_PORTAL_FILE_CONTENT_TYPES, CUSTOMER_PORTAL_FILE_LIMITS,
} from "@paperclipai/shared/productization/customer-portal";
import type {
  CustomerPortalFileRecord, CustomerPortalFileState, CustomerPortalUploadReceipt, PublicCustomerPortalFile, PublicCustomerPortalFiles,
} from "@paperclipai/shared/productization/customer-portal";
import { isAllowedContentType, MAX_ATTACHMENT_BYTES, normalizeUploadAttachmentContentType } from "../../attachment-types.js";
import { HttpError, conflict, forbidden, notFound, payloadTooLarge, tooManyRequests, unprocessable, unsupportedMediaType } from "../../errors.js";
import type { GetObjectResult, StorageService } from "../../storage/types.js";
import { logActivity, persistActivity, publishActivity } from "../activity-log.js";

type GrantRow = typeof customerPortals.$inferSelect;
type FileRow = typeof customerPortalFiles.$inferSelect;
const files = customerPortalFiles;

/** Effective per-file ceiling: the portal bound, never above the deployment-wide attachment cap. */
export const PORTAL_FILE_MAX_BYTES = Math.min(CUSTOMER_PORTAL_FILE_LIMITS.maxBytes, MAX_ATTACHMENT_BYTES);
const MAX_OUTBOUND_PER_CUSTOMER = 50;
/** A pending upload is only reconciled after the original request had time to finish. */
const RECOVERY_MIN_AGE_MS = 30_000;
const ABANDON_AFTER_MS = 15 * 60_000;
const RECOVERY_BATCH = 3;
const OFFICE_TYPES = new Set(CUSTOMER_PORTAL_FILE_CONTENT_TYPES.filter((type) => type.startsWith("application/vnd.openxmlformats")));
const OBJECT_PREFIX = (companyId: string, customerId: string) => `${companyId}/customer-portal/${customerId}/`;

export const fileReference = (token: string, id: string) => createHmac("sha256", token).update(`file:${id}`).digest("base64url");
const sameSecret = (expected: string, supplied: string) => {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Display name: no directories, control or bidi characters, bounded length, extension kept. */
export function safeDisplayName(raw: string | null | undefined): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, "")
    .replace(/[^\p{L}\p{N} ._()-]+/gu, "_")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s_]+|[\s]+$/g, "");
  if (!cleaned) return "file";
  const max = CUSTOMER_PORTAL_FILE_LIMITS.maxNameLength;
  if (cleaned.length <= max) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 16 ? cleaned.slice(dot) : "";
  return `${cleaned.slice(0, max - ext.length)}${ext}`;
}
/** Storage-key segment: ASCII only and free of path tricks; the display name stays in the database. */
const storageName = (display: string) => display.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/\.{2,}/g, ".").replace(/^[._]+/, "").slice(0, CUSTOMER_PORTAL_FILE_LIMITS.maxNameLength) || "file";

function signatureMatches(contentType: string, body: Buffer): boolean {
  switch (contentType) {
    case "image/png": return body.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    case "image/jpeg": return body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
    case "image/gif": return body.subarray(0, 4).toString("latin1") === "GIF8";
    case "image/webp": return body.subarray(0, 4).toString("latin1") === "RIFF" && body.subarray(8, 12).toString("latin1") === "WEBP";
    case "application/pdf": return body.subarray(0, 1024).includes("%PDF-");
    default:
      if (OFFICE_TYPES.has(contentType)) return body[0] === 0x50 && body[1] === 0x4b;
      return !body.includes(0);
  }
}

async function hashStream(stream: Readable, limit: number): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    bytes += buffer.length;
    if (bytes > limit) { stream.destroy(); throw new Error("Stored object exceeds the expected size"); }
    hash.update(buffer);
  }
  return { sha256: hash.digest("hex"), bytes };
}

export interface PortalUploadInput {
  idempotencyKey: string;
  filename: string | null;
  contentType: string | null;
  body: Buffer;
  /** Optional client digest; a mismatch is a safe rejection before anything is stored. */
  claimedSha256?: string | null;
}

export function customerPortalFileService(db: Db, storage: StorageService | null) {
  const needStorage = () => {
    if (!storage) throw new HttpError(503, "File storage is not available for this portal right now");
    return storage;
  };
  const recovering = new Set<string>();

  const scope = (grant: Pick<GrantRow, "companyId" | "customerId" | "contactId">) => and(
    eq(files.companyId, grant.companyId), eq(files.customerId, grant.customerId),
    grant.contactId ? eq(files.contactId, grant.contactId) : isNull(files.contactId),
  );
  const toPublic = (token: string, row: FileRow): PublicCustomerPortalFile => ({
    reference: fileReference(token, row.id), name: row.originalFilename, contentType: row.contentType, byteSize: row.byteSize,
    direction: row.direction as PublicCustomerPortalFile["direction"], state: row.state as CustomerPortalFileState, createdAt: row.createdAt.toISOString(),
  });
  const toRecord = (row: FileRow): CustomerPortalFileRecord => ({
    id: row.id, customerId: row.customerId, contactId: row.contactId, portalId: row.portalId,
    direction: row.direction as CustomerPortalFileRecord["direction"], state: row.state as CustomerPortalFileState,
    visibleToCustomer: row.visibleToCustomer, name: row.originalFilename, contentType: row.contentType, byteSize: row.byteSize,
    sha256: row.sha256, createdAt: row.createdAt.toISOString(),
  });
  const receipt = (token: string, row: FileRow, replayed: boolean): CustomerPortalUploadReceipt => ({
    idempotencyKey: row.idempotencyKey ?? "", file: toPublic(token, row), sha256: row.sha256, replayed,
  });

  function prepare(input: PortalUploadInput) {
    const name = safeDisplayName(input.filename);
    const contentType = normalizeUploadAttachmentContentType({ contentType: input.contentType, originalFilename: name, isAllowedContentType });
    if (!CUSTOMER_PORTAL_FILE_CONTENT_TYPES.includes(contentType) || !isAllowedContentType(contentType)) {
      throw unsupportedMediaType("That file type is not accepted through the portal");
    }
    if (input.body.length <= 0) throw unprocessable("The file is empty");
    if (input.body.length > PORTAL_FILE_MAX_BYTES) throw payloadTooLarge("The file is larger than the portal limit");
    if (!signatureMatches(contentType, input.body)) throw unprocessable("The file content does not match its declared type");
    const sha256 = createHash("sha256").update(input.body).digest("hex");
    if (input.claimedSha256 && input.claimedSha256.toLowerCase() !== sha256) throw unprocessable("The file digest does not match the uploaded content");
    return { name, contentType, sha256, byteSize: input.body.length };
  }

  async function usage(portalId: string) {
    const [row] = await db.select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${files.byteSize}), 0)::float8` }).from(files)
      .where(and(eq(files.portalId, portalId), eq(files.direction, "inbound"), inArray(files.state, ["pending", "stored"])));
    return { count: row?.count ?? 0, bytes: Number(row?.bytes ?? 0) };
  }
  const overQuota = (u: { count: number; bytes: number }) => u.count > CUSTOMER_PORTAL_FILE_LIMITS.maxFilesPerPortal || u.bytes > CUSTOMER_PORTAL_FILE_LIMITS.maxTotalBytesPerPortal;

  async function reject(row: FileRow, deleteObject: boolean) {
    // Keep the durable pending receipt when cleanup is uncertain so a later
    // bounded reconciliation can retry instead of losing the object reference.
    if (deleteObject && storage) await storage.deleteObject(row.companyId, row.objectKey);
    await db.update(files).set({ state: "rejected", updatedAt: new Date() }).where(and(eq(files.id, row.id), inArray(files.state, ["pending", "abandoned"])));
  }

  /** Atomically claims the pending row and creates its asset. Returns null when someone else finalized first. */
  async function finalize(row: FileRow): Promise<FileRow | null> {
    const committed = await db.transaction(async (tx) => {
      const now = new Date();
      if (row.portalId) {
        const [grant] = await tx.select().from(customerPortals).where(eq(customerPortals.id, row.portalId)).for("update").limit(1);
        if (!grant) throw forbidden("This portal link no longer allows file uploads");
        await assertUploadGrant(grant, tx as unknown as Db);
      }
      const [claimed] = await tx.update(files).set({ state: "stored", storedAt: now, updatedAt: now })
        .where(and(eq(files.id, row.id), inArray(files.state, ["pending", "abandoned"]))).returning();
      if (!claimed) return null;
      const [asset] = await tx.insert(assets).values({
        companyId: row.companyId, provider: needStorage().provider, objectKey: row.objectKey, contentType: row.contentType,
        byteSize: row.byteSize, sha256: row.sha256, originalFilename: row.originalFilename, createdByUserId: row.createdByUserId,
      }).returning({ id: assets.id });
      const [done] = await tx.update(files).set({ assetId: asset!.id }).where(eq(files.id, row.id)).returning();
      if (!done) throw new Error("Stored portal file receipt was not persisted");
      const { publication } = await persistActivity(tx as unknown as Db, {
        companyId: row.companyId, actorType: "system", actorId: "customer-portal-contact", action: "customer_portal.file.uploaded", entityType: "customer_portal_file", entityId: done.id,
        details: { portalId: row.portalId, customerId: row.customerId, contactId: row.contactId, contentType: row.contentType, byteSize: row.byteSize },
      });
      return { file: done, publication };
    });
    if (!committed) return null;
    publishActivity(committed.publication);
    return committed.file;
  }

  async function findByKey(portalId: string, key: string) {
    const [row] = await db.select().from(files).where(and(eq(files.portalId, portalId), eq(files.idempotencyKey, key))).limit(1);
    return row ?? null;
  }

  async function assertUploadGrant(grant: GrantRow, executor = db) {
    const [current] = await executor.select({ id: customerPortals.id }).from(customerPortals).innerJoin(customers, and(eq(customers.id, customerPortals.customerId), eq(customers.companyId, customerPortals.companyId), isNull(customers.archivedAt)))
      .where(and(eq(customerPortals.id, grant.id), eq(customerPortals.companyId, grant.companyId), eq(customerPortals.customerId, grant.customerId), eq(customerPortals.tokenHash, grant.tokenHash), isNull(customerPortals.revokedAt), gt(customerPortals.expiresAt, new Date()), eq(customerPortals.allowFileUploads, true), sql`${customerPortals.resourceKinds} ? 'files'`)).limit(1);
    if (!current) throw forbidden("This portal link no longer allows file uploads");
    if (grant.contactId) {
      const [link] = await executor.select({ contactId: customerContacts.contactId }).from(customerContacts).where(and(eq(customerContacts.companyId, grant.companyId), eq(customerContacts.customerId, grant.customerId), eq(customerContacts.contactId, grant.contactId))).limit(1);
      if (!link) throw forbidden("This portal link no longer allows file uploads");
    }
  }

  async function reconcileOne(row: FileRow) {
    const head = await needStorage().headObject(row.companyId, row.objectKey);
    if (!head.exists) {
      if (Date.now() - row.createdAt.getTime() > ABANDON_AFTER_MS) {
        await db.update(files).set({ state: "abandoned", updatedAt: new Date() }).where(and(eq(files.id, row.id), eq(files.state, "pending")));
      }
      return;
    }
    if (head.contentLength !== row.byteSize) { await reject(row, true); return; }
    const object = await needStorage().getObject(row.companyId, row.objectKey);
    const measured = await hashStream(object.stream, row.byteSize);
    if (measured.bytes !== row.byteSize || measured.sha256 !== row.sha256) { await reject(row, true); return; }
    await finalize(row);
  }

  /** Fire-and-forget reconciliation of this link's stale pending uploads; never blocks or fails the page read. */
  function recoverPending(grant: GrantRow) {
    if (!storage || recovering.has(grant.id)) return;
    recovering.add(grant.id);
    void (async () => {
      const stale = await db.select().from(files).where(and(
        eq(files.portalId, grant.id), eq(files.state, "pending"), lt(files.createdAt, new Date(Date.now() - RECOVERY_MIN_AGE_MS)),
      )).orderBy(asc(files.createdAt)).limit(RECOVERY_BATCH);
      for (const row of stale) await reconcileOne(row).catch(() => {});
    })().catch(() => {}).finally(() => recovering.delete(grant.id));
  }

  return {
    limits(): PublicCustomerPortalFiles["limits"] {
      return { maxBytes: PORTAL_FILE_MAX_BYTES, maxFiles: CUSTOMER_PORTAL_FILE_LIMITS.maxFilesPerPortal, contentTypes: [...CUSTOMER_PORTAL_FILE_CONTENT_TYPES] };
    },

    /** Files this exact link may see: visible stored files in its customer/contact scope plus its own unconfirmed uploads. */
    async listForPortal(grant: GrantRow, token: string): Promise<PublicCustomerPortalFile[]> {
      const rows = await db.select().from(files).where(and(scope(grant), or(
        and(eq(files.state, "stored"), eq(files.visibleToCustomer, true)),
        and(eq(files.state, "pending"), eq(files.portalId, grant.id), eq(files.direction, "inbound")),
      ))).orderBy(desc(files.createdAt)).limit(200);
      recoverPending(grant);
      return rows.map((row) => toPublic(token, row));
    },

    async upload(grant: GrantRow, token: string, input: PortalUploadInput): Promise<CustomerPortalUploadReceipt> {
      const prepared = prepare(input);
      const objectStorage = needStorage();
      await assertUploadGrant(grant);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let row = await findByKey(grant.id, input.idempotencyKey);
        let replayed = Boolean(row);
        if (row) {
          if (row.sha256 !== prepared.sha256 || row.byteSize !== prepared.byteSize || row.originalFilename !== prepared.name || row.contentType !== prepared.contentType) {
            throw conflict("That upload key was already used for a different file");
          }
          if (row.state === "stored") return receipt(token, row, true);
          if (row.state === "rejected") throw conflict("That upload was rejected; choose the file again to start a new upload");
        } else {
          if (overQuota(await usage(grant.id).then((u) => ({ count: u.count + 1, bytes: u.bytes + prepared.byteSize })))) {
            throw tooManyRequests("This portal link reached its file limit");
          }
          const id = randomUUID();
          const [inserted] = await db.insert(files).values({
            id, companyId: grant.companyId, customerId: grant.customerId, contactId: grant.contactId, portalId: grant.id, direction: "inbound",
            state: "pending", objectKey: `${OBJECT_PREFIX(grant.companyId, grant.customerId)}${id}-${storageName(prepared.name)}`,
            originalFilename: prepared.name, contentType: prepared.contentType, byteSize: prepared.byteSize, sha256: prepared.sha256, idempotencyKey: input.idempotencyKey,
          }).onConflictDoNothing({ target: [files.portalId, files.idempotencyKey] }).returning();
          if (!inserted) continue; // another request with this key won the insert; re-read it
          row = inserted;
          replayed = false;
          // Concurrent uploads can all pass the pre-check; the post-insert count is the authoritative gate.
          if (overQuota(await usage(grant.id))) { await reject(row, false); throw tooManyRequests("This portal link reached its file limit"); }
        }
        try {
          await assertUploadGrant(grant);
          await objectStorage.putFile({
            objectKey: row.objectKey, companyId: row.companyId, namespace: "customer-portal", originalFilename: row.originalFilename,
            contentType: row.contentType, body: input.body,
          });
        } catch {
          throw new HttpError(503, "The file could not be stored yet. Try again with the same upload; it will not be duplicated.", { code: "upload_outcome_uncertain", idempotencyKey: input.idempotencyKey });
        }
        let done: FileRow | null;
        try { await assertUploadGrant(grant); done = await finalize(row); } catch {
          throw new HttpError(503, "The upload could not be confirmed yet. Try again with the same upload; it will not be duplicated.", { code: "upload_outcome_uncertain", idempotencyKey: input.idempotencyKey });
        }
        if (!done) {
          const current = await findByKey(grant.id, input.idempotencyKey);
          if (current?.state === "stored") return receipt(token, current, true);
          continue;
        }
        return receipt(token, done, replayed);
      }
      throw conflict("This upload is still being processed; try again in a moment");
    },

    /** Resolves a token-derived reference inside the exact scope; unknown, hidden and foreign references are indistinguishable. */
    async downloadForPortal(grant: GrantRow, token: string, reference: string): Promise<{ file: FileRow; object: GetObjectResult }> {
      const rows = await db.select().from(files).where(and(scope(grant), eq(files.state, "stored"), eq(files.visibleToCustomer, true)))
        .orderBy(desc(files.createdAt)).limit(200);
      const file = rows.find((row) => sameSecret(fileReference(token, row.id), reference));
      if (!file || !file.objectKey.startsWith(OBJECT_PREFIX(file.companyId, file.customerId))) throw notFound("File not found");
      return { file, object: await needStorage().getObject(file.companyId, file.objectKey) };
    },

    async listForBoard(companyId: string, customerId: string): Promise<CustomerPortalFileRecord[]> {
      const rows = await db.select().from(files).where(and(eq(files.companyId, companyId), eq(files.customerId, customerId)))
        .orderBy(desc(files.createdAt)).limit(200);
      return rows.map(toRecord);
    },

    async uploadOutbound(companyId: string, customerId: string, contactId: string | null, userId: string, input: Omit<PortalUploadInput, "idempotencyKey">): Promise<CustomerPortalFileRecord> {
      const prepared = prepare({ ...input, idempotencyKey: "" });
      const objectStorage = needStorage();
      const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, customerId), eq(customers.companyId, companyId), isNull(customers.archivedAt))).limit(1);
      if (!customer) throw notFound("Customer not found");
      if (contactId) {
        const [link] = await db.select({ id: customerContacts.contactId }).from(customerContacts)
          .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.customerId, customerId), eq(customerContacts.contactId, contactId))).limit(1);
        if (!link) throw notFound("Contact is not linked to this customer");
      }
      const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(files).where(and(eq(files.companyId, companyId), eq(files.customerId, customerId), eq(files.direction, "outbound"), eq(files.state, "stored")));
      if ((count?.count ?? 0) >= MAX_OUTBOUND_PER_CUSTOMER) throw tooManyRequests("This customer reached the shared file limit");
      const id = randomUUID();
      const objectKey = `${OBJECT_PREFIX(companyId, customerId)}${id}-${storageName(prepared.name)}`;
      await objectStorage.putFile({ objectKey, companyId, namespace: "customer-portal", originalFilename: prepared.name, contentType: prepared.contentType, body: input.body });
      let row: FileRow;
      try {
        row = await db.transaction(async (tx) => {
          const now = new Date();
          const [asset] = await tx.insert(assets).values({
            companyId, provider: objectStorage.provider, objectKey, contentType: prepared.contentType, byteSize: prepared.byteSize,
            sha256: prepared.sha256, originalFilename: prepared.name, createdByUserId: userId,
          }).returning({ id: assets.id });
          const [created] = await tx.insert(files).values({
            id, companyId, customerId, contactId, portalId: null, direction: "outbound", state: "stored", assetId: asset!.id, objectKey,
            originalFilename: prepared.name, contentType: prepared.contentType, byteSize: prepared.byteSize, sha256: prepared.sha256,
            createdByUserId: userId, storedAt: now,
          }).returning();
          return created!;
        });
      } catch (error) {
        // Nothing references the object yet, so removing it is safe; a failed delete leaves an unreferenced, unreachable object.
        await objectStorage.deleteObject(companyId, objectKey).catch(() => {});
        throw error;
      }
      // Audit delivery may fail after commit. The asset is already referenced
      // and must never be deleted by the pre-commit cleanup path.
      await logActivity(db, { companyId, actorType: "user", actorId: userId, action: "customer_portal.file.shared", entityType: "customer_portal_file", entityId: row.id, details: { customerId, contactId, contentType: row.contentType, byteSize: row.byteSize } });
      return toRecord(row);
    },

    async setVisibility(companyId: string, fileId: string, visible: boolean, userId: string): Promise<CustomerPortalFileRecord> {
      const now = new Date();
      const [row] = await db.update(files).set({ visibleToCustomer: visible, hiddenAt: visible ? null : now, updatedAt: now })
        .where(and(eq(files.id, fileId), eq(files.companyId, companyId), eq(files.state, "stored"))).returning();
      if (!row) throw notFound("File not found");
      await logActivity(db, { companyId, actorType: "user", actorId: userId, action: visible ? "customer_portal.file.shown" : "customer_portal.file.hidden", entityType: "customer_portal_file", entityId: row.id, details: { customerId: row.customerId, contactId: row.contactId } });
      return toRecord(row);
    },

    async downloadForBoard(companyId: string, fileId: string): Promise<{ file: FileRow; object: GetObjectResult }> {
      const [file] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.companyId, companyId), eq(files.state, "stored"))).limit(1);
      if (!file || !file.objectKey.startsWith(OBJECT_PREFIX(file.companyId, file.customerId))) throw notFound("File not found");
      return { file, object: await needStorage().getObject(file.companyId, file.objectKey) };
    },
  };
}
