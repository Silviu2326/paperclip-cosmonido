import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { assets, companies, createDb, customers, customerPortalFiles, type Db } from "@paperclipai/db";
import type { StorageService } from "../../storage/types.js";
import { startEmbeddedPostgresTestDatabase, type EmbeddedPostgresTestDatabase } from "../../__tests__/helpers/embedded-postgres.js";
import { customerPortalService } from "./customer-portal.js";

async function bytes(stream: Readable): Promise<Buffer> { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }
function memoryStorage(): StorageService {
  const objects = new Map<string, { body: Buffer; type: string }>();
  const scoped = (companyId: string, key: string) => { if (!key.startsWith(`${companyId}/`)) throw new Error("Foreign storage key"); };
  return {
    provider: "local_disk",
    async putFile(input) {
      const body = Buffer.isBuffer(input.body) ? input.body : await bytes(input.body);
      const objectKey = input.objectKey ?? `${input.companyId}/${randomUUID()}`;
      scoped(input.companyId, objectKey); objects.set(objectKey, { body, type: input.contentType });
      return { provider: "local_disk", objectKey, contentType: input.contentType, byteSize: body.length, sha256: createHash("sha256").update(body).digest("hex"), originalFilename: input.originalFilename };
    },
    async getObject(companyId, key) { scoped(companyId, key); const item = objects.get(key); if (!item) throw new Error("Object missing"); return { stream: Readable.from(item.body), contentLength: item.body.length, contentType: item.type }; },
    async headObject(companyId, key) { scoped(companyId, key); const item = objects.get(key); return { exists: Boolean(item), contentLength: item?.body.length, contentType: item?.type }; },
    async deleteObject(companyId, key) { scoped(companyId, key); objects.delete(key); },
  };
}

describe("portal file grants and durable upload receipts", () => {
  let temp: EmbeddedPostgresTestDatabase | null = null;
  let db: Db;
  beforeAll(async () => { temp = await startEmbeddedPostgresTestDatabase("paperclip-s95-portal-"); db = createDb(temp.connectionString); }, 90_000);
  afterAll(async () => { await temp?.cleanup(); });
  async function fixture() {
    const [company] = await db.insert(companies).values({ name: "Portal fixture", issuePrefix: `PF${randomUUID().slice(0, 6).toUpperCase()}` }).returning();
    const rows = await db.insert(customers).values([{ companyId: company!.id, name: "A" }, { companyId: company!.id, name: "B" }]).returning();
    const storage = memoryStorage();
    const service = customerPortalService(db, { storage });
    const grant = (customerId: string, uploads = true) => service.create(company!.id, { customerId, expiresAt: new Date(Date.now() + 60_000).toISOString(), resourceKinds: ["files"], allowFileUploads: uploads }, "fixture-operator");
    const input = { filename: "../request.txt", contentType: "text/plain", body: Buffer.from("A real customer request"), idempotencyKey: randomUUID() };
    return { company: company!, a: rows[0]!, b: rows[1]!, storage, service, grant, input };
  }

  it("requires an explicit upload grant before writing bytes", async () => {
    const f = await fixture(), portal = await f.grant(f.a.id, false);
    const put = vi.spyOn(f.storage, "putFile");
    await expect(f.service.uploadFile(portal.id, portal.token, f.input)).rejects.toMatchObject({ status: 403 });
    expect(put).not.toHaveBeenCalled();
  });

  it("does not expose a file through another customer's portal or guessed asset identity", async () => {
    const f = await fixture(), a = await f.grant(f.a.id), b = await f.grant(f.b.id);
    const receipt = await f.service.uploadFile(a.id, a.token, f.input);
    expect(receipt.file.name).toBe("request.txt");
    expect((await f.service.get(b.id, b.token)).files?.items).toEqual([]);
    await expect(f.service.downloadFile(b.id, b.token, receipt.file.reference)).rejects.toMatchObject({ status: 404 });
    const [stored] = await db.select().from(customerPortalFiles).where(eq(customerPortalFiles.companyId, f.company.id));
    await expect(f.service.downloadFile(a.id, a.token, stored!.assetId!)).rejects.toMatchObject({ status: 404 });
    expect((await bytes((await f.service.downloadFile(a.id, a.token, receipt.file.reference)).object.stream)).toString()).toBe(f.input.body.toString());
  });

  it("revocation stops both upload and download before the storage operation", async () => {
    const f = await fixture(), portal = await f.grant(f.a.id);
    const receipt = await f.service.uploadFile(portal.id, portal.token, f.input);
    await f.service.revoke(f.company.id, portal.id, "fixture-operator");
    const put = vi.spyOn(f.storage, "putFile"), get = vi.spyOn(f.storage, "getObject");
    await expect(f.service.uploadFile(portal.id, portal.token, { ...f.input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 401 });
    await expect(f.service.downloadFile(portal.id, portal.token, receipt.file.reference)).rejects.toMatchObject({ status: 401 });
    expect(put).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });

  it("recovers a lost storage response with one file/asset and rejects key reuse with another body", async () => {
    const f = await fixture(), portal = await f.grant(f.a.id);
    const realPut = f.storage.putFile.bind(f.storage);
    vi.spyOn(f.storage, "putFile").mockImplementationOnce(async input => { await realPut(input); throw new Error("Response lost after storage accepted bytes"); });
    await expect(f.service.uploadFile(portal.id, portal.token, f.input)).rejects.toMatchObject({ status: 503 });
    await expect(f.service.uploadFile(portal.id, portal.token, { ...f.input, body: Buffer.from("Different payload") })).rejects.toMatchObject({ status: 409 });
    const confirmed = await f.service.uploadFile(portal.id, portal.token, f.input);
    const replay = await f.service.uploadFile(portal.id, portal.token, f.input);
    expect(confirmed.file.state).toBe("stored"); expect(replay.replayed).toBe(true); expect(replay.file.reference).toBe(confirmed.file.reference);
    expect(await db.select().from(customerPortalFiles).where(eq(customerPortalFiles.companyId, f.company.id))).toHaveLength(1);
    expect(await db.select().from(assets).where(eq(assets.companyId, f.company.id))).toHaveLength(1);
  });

  it("withdraws current access when the customer is archived", async () => {
    const f = await fixture(), portal = await f.grant(f.a.id);
    await db.update(customers).set({ status: "archived", archivedAt: new Date() }).where(eq(customers.id, f.a.id));
    await expect(f.service.get(portal.id, portal.token)).rejects.toMatchObject({ status: 401 });
  });
});
