import { createHash, randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agents,
  assets,
  authUsers,
  companies,
  companyFileMemberships,
  companyFileReads,
  companyFileVersions,
  companyFiles,
  createDb,
  documents,
  heartbeatRuns,
  issueAttachments,
  issueWorkProducts,
  issues,
  type Db,
} from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import { companyFileRoutes } from "../routes/company-files.js";
import { errorHandler } from "../middleware/index.js";
import {
  startEmbeddedPostgresTestDatabase,
  type EmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

// Real Postgres (embedded) and an in-memory object store. The service, routes and
// authz checks run for real; only the bytes live in a Map.

let tempDb: EmbeddedPostgresTestDatabase | null = null;
let db: Db;
let currentActor: Record<string, unknown> = { type: "none" };

function createMemoryStorage() {
  const objects = new Map<string, Buffer>();
  const storage = {
    provider: "local_disk",
    putFile: async (input: { objectKey?: string; companyId: string; namespace: string; originalFilename: string | null; contentType: string; body: Buffer }) => {
      const objectKey = input.objectKey ?? `${input.companyId}/${input.namespace}/${randomUUID()}-${input.originalFilename ?? "file"}`;
      objects.set(objectKey, input.body);
      return {
        provider: "local_disk",
        objectKey,
        contentType: input.contentType.toLowerCase(),
        byteSize: input.body.length,
        sha256: createHash("sha256").update(input.body).digest("hex"),
        originalFilename: input.originalFilename,
      };
    },
    getObject: async (_companyId: string, objectKey: string, options?: { range?: { start: number; end: number } }) => {
      const body = objects.get(objectKey);
      if (!body) throw new Error(`missing object ${objectKey}`);
      const slice = options?.range ? body.subarray(options.range.start, options.range.end + 1) : body;
      return { stream: Readable.from(slice), contentLength: slice.length };
    },
    headObject: async (_companyId: string, objectKey: string) => ({ exists: objects.has(objectKey) }),
    deleteObject: async (_companyId: string, objectKey: string) => {
      objects.delete(objectKey);
    },
  };
  return { storage: storage as unknown as StorageService, objects };
}

function createApp(storage: StorageService) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { actor: unknown }).actor = currentActor;
    next();
  });
  app.use("/api", companyFileRoutes(db, storage));
  app.use(errorHandler);
  return app;
}

function parseBinaryResponse(res: IncomingMessage, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
  res.on("error", callback);
}

async function createCompanyWithAgent(label: string) {
  const company = await db
    .insert(companies)
    .values({ name: `Company Files ${label} ${randomUUID()}`, issuePrefix: `CF${randomUUID().slice(0, 6).toUpperCase()}` })
    .returning()
    .then((rows) => rows[0]!);
  const agent = await db
    .insert(agents)
    .values({ companyId: company.id, name: `Agent ${label}`, role: "worker", adapterType: "process", adapterConfig: {} })
    .returning()
    .then((rows) => rows[0]!);
  const issue = await db
    .insert(issues)
    .values({ companyId: company.id, title: `Issue ${label}`, status: "in_progress" })
    .returning()
    .then((rows) => rows[0]!);
  const runId = randomUUID();
  await db.insert(heartbeatRuns).values({ id: runId, companyId: company.id, agentId: agent.id, status: "running", issueId: issue.id });
  return { company, agent, issue, runId };
}

/** Minimal reader for the ZIP files this server writes: central directory, stored or deflated entries. */
function readZipEntries(zip: Buffer): Record<string, string> {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThanOrEqual(0);
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries: Record<string, string> = {};
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    entries[name] = (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function boardActor(companyId: string) {
  return { type: "board", userId: "local-board", companyIds: [companyId], source: "session", isInstanceAdmin: false };
}

function agentActor(companyId: string, agentId: string, runId: string) {
  return { type: "agent", agentId, companyId, runId, keyId: randomUUID(), source: "agent_key" };
}

describe("company files routes", () => {
  let storage: StorageService;
  let objects: Map<string, Buffer>;
  let app: express.Express;
  let company: { id: string };
  let agent: { id: string };
  let issue: { id: string };
  let runId: string;
  let other: { id: string };

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-files-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  beforeEach(async () => {
    const memory = createMemoryStorage();
    storage = memory.storage;
    objects = memory.objects;
    app = createApp(storage);
    const main = await createCompanyWithAgent("main");
    company = main.company;
    agent = main.agent;
    issue = main.issue;
    runId = main.runId;
    other = (await createCompanyWithAgent("other")).company;
    currentActor = boardActor(company.id);
  });

  async function upload(name: string, body: string, contentType = "text/plain", path = `/api/companies/${company.id}/files`) {
    return request(app).post(path).attach("file", Buffer.from(body), { filename: name, contentType });
  }

  it("upload creates the file, version 1, the asset and the default root folders", async () => {
    const res = await upload("nota.txt", "hello");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "nota.txt", byteSize: 5, currentVersionNumber: 1, versionCount: 1, contentType: "text/plain" });
    expect(res.body.contentPath).toBe(`/api/company-files/${res.body.id}/content`);
    expect(res.body.downloadPath).toBe(`/api/company-files/${res.body.id}/content?download=1`);

    const versions = await db.select().from(companyFileVersions).where(eq(companyFileVersions.fileId, res.body.id));
    expect(versions).toHaveLength(1);
    const asset = await db.select().from(assets).where(eq(assets.id, versions[0]!.assetId)).then((rows) => rows[0]!);
    expect(asset.companyId).toBe(company.id);
    expect(asset.sha256).toHaveLength(64);

    const tree = await request(app).get(`/api/companies/${company.id}/files/tree`);
    expect(tree.status).toBe(200);
    expect(tree.body.map((node: { name: string }) => node.name).sort()).toEqual(
      ["Briefs", "Clientes", "Legal", "Marca", "Precios", "Referencias"],
    );
    const marca = tree.body.find((node: { name: string }) => node.name === "Marca");
    expect(marca.fileCount).toBe(0);
  });

  it("rejects a disallowed content type with 422 and stores nothing", async () => {
    const res = await upload("programa.exe", "MZ", "application/x-msdownload");
    expect(res.status).toBe(422);
    expect(objects.size).toBe(0);
  });

  it("returns 409 for a duplicate name in the same folder", async () => {
    expect((await upload("dup.txt", "a")).status).toBe(201);
    const res = await upload("dup.txt", "b");
    expect(res.status).toBe(409);
  });

  it("adding a version bumps the version number and keeps the file id", async () => {
    const created = await upload("v.txt", "one");
    const res = await request(app)
      .post(`/api/company-files/${created.body.id}/versions`)
      .attach("file", Buffer.from("two two"), { filename: "v.txt", contentType: "text/plain" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: created.body.id, currentVersionNumber: 2, versionCount: 2, byteSize: 7 });
    const versions = await request(app).get(`/api/company-files/${created.body.id}/versions`);
    expect(versions.body.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([1, 2]);
  });

  it("renames and moves a file, and rejects a move to a folder outside company files", async () => {
    const created = await upload("a.txt", "x");
    const tree = await request(app).get(`/api/companies/${company.id}/files/tree`);
    const marca = tree.body.find((node: { name: string }) => node.name === "Marca");
    await request(app)
      .post(`/api/companies/${company.id}/files`)
      .field("folderId", marca.id)
      .attach("file", Buffer.from("c"), { filename: "c.txt", contentType: "text/plain" });

    const moved = await request(app).patch(`/api/company-files/${created.body.id}`).send({ name: "Otra.txt", folderId: marca.id });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ name: "Otra.txt", folderId: marca.id, slug: "otra-txt" });

    const collision = await request(app).patch(`/api/company-files/${created.body.id}`).send({ name: "c.txt" });
    expect(collision.status).toBe(409);

    const badFolder = await request(app).patch(`/api/company-files/${created.body.id}`).send({ folderId: randomUUID() });
    expect(badFolder.status).toBe(422);
  });

  it("soft delete hides the file from listings and content, and restore brings it back", async () => {
    const created = await upload("borrar.txt", "bye");
    const deleted = await request(app).delete(`/api/company-files/${created.body.id}`);
    expect(deleted.status).toBe(200);

    const listed = await request(app).get(`/api/companies/${company.id}/files`);
    expect(listed.body.files.map((f: { id: string }) => f.id)).not.toContain(created.body.id);
    const withDeleted = await request(app).get(`/api/companies/${company.id}/files?includeDeleted=true`);
    expect(withDeleted.body.files.map((f: { id: string }) => f.id)).toContain(created.body.id);

    const content = await request(app).get(`/api/company-files/${created.body.id}/content`);
    expect(content.status).toBe(404);

    const restored = await request(app).post(`/api/company-files/${created.body.id}/restore`);
    expect(restored.status).toBe(200);
    const after = await request(app).get(`/api/companies/${company.id}/files`);
    expect(after.body.files.map((f: { id: string }) => f.id)).toContain(created.body.id);
  });

  it("content GET returns the bytes with inline/attachment and nosniff headers, and honours Range", async () => {
    const created = await upload("doc.txt", "hello world");
    const inline = await request(app)
      .get(`/api/company-files/${created.body.id}/content`)
      .buffer(true)
      .parse(parseBinaryResponse);
    expect(inline.status).toBe(200);
    expect(inline.body.toString("utf8")).toBe("hello world");
    expect(inline.headers["content-type"]).toBe("text/plain");
    expect(inline.headers["content-disposition"]).toMatch(/^inline;/);
    expect(inline.headers["x-content-type-options"]).toBe("nosniff");

    const download = await request(app)
      .get(`/api/company-files/${created.body.id}/content?download=1`)
      .buffer(true)
      .parse(parseBinaryResponse);
    expect(download.headers["content-disposition"]).toMatch(/^attachment;/);

    const ranged = await request(app)
      .get(`/api/company-files/${created.body.id}/content`)
      .set("Range", "bytes=0-4")
      .buffer(true)
      .parse(parseBinaryResponse);
    expect(ranged.status).toBe(206);
    expect(ranged.body.toString("utf8")).toBe("hello");
    expect(ranged.headers["content-range"]).toBe("bytes 0-4/11");
  });

  it("an agent read is recorded with the run's issue and appears in usage", async () => {
    const created = await upload("brief.txt", "contexto");
    currentActor = agentActor(company.id, agent.id, runId);

    const read = await request(app)
      .get(`/api/company-files/${created.body.id}/content`)
      .buffer(true)
      .parse(parseBinaryResponse);
    expect(read.status).toBe(200);

    const rows = await db.select().from(companyFileReads).where(eq(companyFileReads.fileId, created.body.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ issueId: issue.id, agentId: agent.id, runId });

    currentActor = boardActor(company.id);
    const usage = await request(app).get(`/api/company-files/${created.body.id}/usage`);
    expect(usage.status).toBe(200);
    expect(usage.body).toEqual([
      expect.objectContaining({ issueId: issue.id, agentId: agent.id, agentName: "Agent main", readCount: 1 }),
    ]);

    const listed = await request(app).get(`/api/companies/${company.id}/files`);
    expect(listed.body.files.find((f: { id: string }) => f.id === created.body.id).usedInIssueCount).toBe(1);
  });

  it("agents cannot write files", async () => {
    currentActor = agentActor(company.id, agent.id, runId);
    const res = await upload("nope.txt", "x");
    expect(res.status).toBe(403);
  });

  it("rejects cross-company access with 404 on files and 403 on company listings", async () => {
    const created = await upload("secreto.txt", "s");
    currentActor = boardActor(other.id);
    expect((await request(app).get(`/api/company-files/${created.body.id}/content`)).status).toBe(404);
    expect((await request(app).get(`/api/companies/${company.id}/files`)).status).toBe(403);

    currentActor = agentActor(other.id, randomUUID(), randomUUID());
    expect((await request(app).get(`/api/company-files/${created.body.id}/content`)).status).toBe(404);
  });

  it("folders: create, reject delete while non-empty, delete when empty", async () => {
    const folder = await request(app).post(`/api/companies/${company.id}/files/folders`).send({ name: "Proyecto X" });
    expect(folder.status).toBe(201);

    const created = await request(app)
      .post(`/api/companies/${company.id}/files`)
      .field("folderId", folder.body.id)
      .attach("file", Buffer.from("z"), { filename: "z.txt", contentType: "text/plain" });
    expect(created.status).toBe(201);
    expect(created.body.folderId).toBe(folder.body.id);

    const notEmpty = await request(app).delete(`/api/company-files/folders/${folder.body.id}`);
    expect(notEmpty.status).toBe(422);

    await request(app).delete(`/api/company-files/${created.body.id}`);
    const empty = await request(app).delete(`/api/company-files/folders/${folder.body.id}`);
    expect(empty.status).toBe(200);
  });

  it("from-artifact: an attachment is copied into a new asset and its bytes survive deleting the attachment", async () => {
    const asset = await db
      .insert(assets)
      .values({
        companyId: company.id,
        provider: "local_disk",
        objectKey: `${company.id}/issues/${issue.id}/${randomUUID()}-plano.pdf`,
        contentType: "application/pdf",
        byteSize: 4,
        sha256: "a".repeat(64),
        originalFilename: "plano.pdf",
      })
      .returning()
      .then((rows) => rows[0]!);
    objects.set(asset.objectKey, Buffer.from("%PDF"));
    const attachment = await db
      .insert(issueAttachments)
      .values({ companyId: company.id, issueId: issue.id, assetId: asset.id })
      .returning()
      .then((rows) => rows[0]!);

    const res = await request(app)
      .post(`/api/companies/${company.id}/files/from-artifact`)
      .send({ source: "attachment", id: attachment.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "plano.pdf", contentType: "application/pdf", versionCount: 1, byteSize: 4 });
    const version = await db
      .select()
      .from(companyFileVersions)
      .where(and(eq(companyFileVersions.fileId, res.body.id), eq(companyFileVersions.versionNumber, 1)))
      .then((rows) => rows[0]!);
    expect(version.assetId).not.toBe(asset.id);
    expect(objects.size).toBe(2);

    // Simulate DELETE /api/attachments/:id, which removes the issue's own object and rows.
    await db.delete(issueAttachments).where(eq(issueAttachments.id, attachment.id));
    await storage.deleteObject(company.id, asset.objectKey);
    await db.delete(assets).where(eq(assets.id, asset.id));

    const content = await request(app).get(`/api/company-files/${res.body.id}/content`);
    expect(content.status).toBe(200);
    expect(content.body.toString("utf8")).toBe("%PDF");
  });

  it("from-artifact: a malformed attachment id in work product metadata returns 404, not 500", async () => {
    const workProduct = await db
      .insert(issueWorkProducts)
      .values({
        companyId: company.id,
        issueId: issue.id,
        type: "artifact",
        provider: "paperclip",
        title: "Plano",
        status: "active",
        metadata: { attachmentId: "not-a-uuid" },
      })
      .returning()
      .then((rows) => rows[0]!);
    const res = await request(app)
      .post(`/api/companies/${company.id}/files/from-artifact`)
      .send({ source: "work_product", id: workProduct.id });
    expect(res.status).toBe(404);
  });

  it("from-artifact: a markdown document is exported as a new text/markdown asset", async () => {
    const doc = await db
      .insert(documents)
      .values({ companyId: company.id, title: "Propuesta", format: "markdown", latestBody: "# Hola\n\nTexto." })
      .returning()
      .then((rows) => rows[0]!);
    const res = await request(app)
      .post(`/api/companies/${company.id}/files/from-artifact`)
      .send({ source: "document", id: doc.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Propuesta.md", contentType: "text/markdown" });
    const files = await db.select().from(companyFiles).where(eq(companyFiles.companyId, company.id));
    expect(files).toHaveLength(1);
  });

  it("names the uploader and the version uploader from the auth user table, and folderPath is empty at the root", async () => {
    const userId = `user-${randomUUID()}`;
    await db.insert(authUsers).values({ id: userId, name: "Ana Perez", email: `${userId}@example.com`, createdAt: new Date(), updatedAt: new Date() });
    currentActor = { ...boardActor(company.id), userId };
    const created = await upload("nombres.txt", "uno");
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ createdByUserId: userId, createdByName: "Ana Perez", updatedByName: "Ana Perez", folderPath: "" });

    const next = await request(app)
      .post(`/api/company-files/${created.body.id}/versions`)
      .attach("file", Buffer.from("dos"), { filename: "nombres.txt", contentType: "text/plain" });
    expect(next.status).toBe(201);
    const versions = await request(app).get(`/api/company-files/${created.body.id}/versions`);
    expect(versions.body.map((v: { uploadedByName: string | null }) => v.uploadedByName)).toEqual(["Ana Perez", "Ana Perez"]);

    const listed = await request(app).get(`/api/companies/${company.id}/files`);
    expect(listed.body.files[0]).toMatchObject({ name: "nombres.txt", createdByName: "Ana Perez" });
  });

  it("falls back to the email when the auth user has no name, and to null for an unknown uploader", async () => {
    const userId = `user-${randomUUID()}`;
    await db.insert(authUsers).values({ id: userId, name: "  ", email: `${userId}@example.com`, createdAt: new Date(), updatedAt: new Date() });
    currentActor = { ...boardActor(company.id), userId };
    const withEmail = await upload("correo.txt", "c");
    expect(withEmail.body.createdByName).toBe(`${userId}@example.com`);

    currentActor = { ...boardActor(company.id), userId: `ghost-${randomUUID()}` };
    const unknown = await upload("fantasma.txt", "f");
    expect(unknown.status).toBe(201);
    expect(unknown.body.createdByName).toBeNull();
  });

  it("scope=all lists every folder with folderPath, ignores folderId, and the default scope stays one level", async () => {
    const tree = await request(app).get(`/api/companies/${company.id}/files/tree`);
    const marca = tree.body.find((node: { name: string }) => node.name === "Marca");
    const clientes = tree.body.find((node: { name: string }) => node.name === "Clientes");
    const acme = await request(app)
      .post(`/api/companies/${company.id}/files/folders`)
      .send({ name: "Acme", parentId: clientes.id });
    expect(acme.status).toBe(201);
    await request(app)
      .post(`/api/companies/${company.id}/files`)
      .field("folderId", acme.body.id)
      .attach("file", Buffer.from("contrato"), { filename: "contrato.txt", contentType: "text/plain" });
    await request(app)
      .post(`/api/companies/${company.id}/files`)
      .field("folderId", marca.id)
      .attach("file", Buffer.from("m"), { filename: "marca.txt", contentType: "text/plain" });
    await upload("raiz.txt", "r");

    const all = await request(app).get(`/api/companies/${company.id}/files?scope=all`);
    expect(all.status).toBe(200);
    expect(all.body.folder).toBeNull();
    expect(all.body.folders).toEqual([]);
    expect(Object.fromEntries(all.body.files.map((f: { name: string; folderPath: string }) => [f.name, f.folderPath]))).toEqual({
      "contrato.txt": "Clientes/Acme",
      "marca.txt": "Marca",
      "raiz.txt": "",
    });

    const ignoredFolder = await request(app).get(`/api/companies/${company.id}/files?scope=all&folderId=${marca.id}`);
    expect(ignoredFolder.body.files).toHaveLength(3);

    const oneLevel = await request(app).get(`/api/companies/${company.id}/files?folderId=${marca.id}`);
    expect(oneLevel.body.folder.name).toBe("Marca");
    expect(oneLevel.body.files.map((f: { name: string }) => f.name)).toEqual(["marca.txt"]);
    expect(oneLevel.body.files[0].folderPath).toBe("Marca");

    const root = await request(app).get(`/api/companies/${company.id}/files`);
    expect(root.body.files.map((f: { name: string }) => f.name)).toEqual(["raiz.txt"]);
    expect(root.body.folders.length).toBeGreaterThan(0);

    const badScope = await request(app).get(`/api/companies/${company.id}/files?scope=everything`);
    expect(badScope.status).toBe(400);
  });

  it("createdByMe and starred filter by the current board user; agents cannot use them", async () => {
    const mine = `user-${randomUUID()}`;
    const theirs = `user-${randomUUID()}`;
    currentActor = { ...boardActor(company.id), userId: mine };
    const mineFile = await upload("mio.txt", "m");
    currentActor = { ...boardActor(company.id), userId: theirs };
    const theirsFile = await upload("suyo.txt", "s");
    expect(mineFile.body.createdByUserId).toBe(mine);
    expect(theirsFile.body.createdByUserId).toBe(theirs);

    // "mine" stars the file uploaded by someone else.
    await db.insert(companyFileMemberships).values({
      companyId: company.id,
      companyFileId: theirsFile.body.id,
      userId: mine,
      starredAt: new Date(),
    });

    currentActor = { ...boardActor(company.id), userId: mine };
    const createdByMe = await request(app).get(`/api/companies/${company.id}/files?createdByMe=true&scope=all`);
    expect(createdByMe.status).toBe(200);
    expect(createdByMe.body.files.map((f: { name: string }) => f.name)).toEqual(["mio.txt"]);

    const starred = await request(app).get(`/api/companies/${company.id}/files?starred=true&scope=all`);
    expect(starred.body.files.map((f: { name: string }) => f.name)).toEqual(["suyo.txt"]);

    currentActor = { ...boardActor(company.id), userId: theirs };
    const theirsStarred = await request(app).get(`/api/companies/${company.id}/files?starred=true`);
    expect(theirsStarred.body.files).toEqual([]);

    currentActor = agentActor(company.id, agent.id, runId);
    const agentCreatedByMe = await request(app).get(`/api/companies/${company.id}/files?createdByMe=true`);
    expect(agentCreatedByMe.status).toBe(400);
    const agentStarred = await request(app).get(`/api/companies/${company.id}/files?starred=true`);
    expect(agentStarred.status).toBe(400);
    const agentPlain = await request(app).get(`/api/companies/${company.id}/files?createdByMe=false&starred=false`);
    expect(agentPlain.status).toBe(200);

    currentActor = boardActor(company.id);
    const badBoolean = await request(app).get(`/api/companies/${company.id}/files?starred=yes`);
    expect(badBoolean.status).toBe(400);
  });

  // ---------- agent visibility of hidden folders ----------

  async function createFolderViaApi(name: string, parentId?: string) {
    const res = await request(app)
      .post(`/api/companies/${company.id}/files/folders`)
      .send(parentId ? { name, parentId } : { name });
    expect(res.status).toBe(201);
    return res.body as { id: string; name: string; agentVisible: boolean };
  }

  async function uploadInto(folderId: string | null, name: string, body: Buffer | string, contentType = "text/plain") {
    const req = request(app).post(`/api/companies/${company.id}/files`);
    if (folderId) req.field("folderId", folderId);
    const res = await req.attach("file", Buffer.from(body), { filename: name, contentType });
    expect(res.status).toBe(201);
    return res.body as { id: string; agentVisible: boolean; thumbnailPath: string | null };
  }

  async function hideFolder(folderId: string) {
    const res = await request(app).patch(`/api/company-files/folders/${folderId}`).send({ agentVisible: false });
    expect(res.status).toBe(200);
    return res.body;
  }

  it("an agent-hidden folder hides its files, subfolders and their content from agents, but not from the board", async () => {
    const privada = await createFolderViaApi("Privada");
    const sub = await createFolderViaApi("Sub", privada.id);
    const secreto = await uploadInto(privada.id, "secreto.txt", "clave");
    const hijo = await uploadInto(sub.id, "hijo.txt", "dentro");
    const publico = await uploadInto(null, "publico.txt", "abierto");

    const hidden = await hideFolder(privada.id);
    expect(hidden).toMatchObject({ id: privada.id, agentVisible: false });
    const logged = await db.select().from(activityLog).where(and(eq(activityLog.companyId, company.id), eq(activityLog.action, "folder.updated"), eq(activityLog.entityId, privada.id)));
    expect(logged).toHaveLength(1);
    expect(logged[0]!.details).toMatchObject({ agentVisible: { from: true, to: false } });

    // Board view: everything, with the effective agentVisible flag.
    const boardList = await request(app).get(`/api/companies/${company.id}/files?scope=all`);
    expect(boardList.body.files.find((f: { id: string }) => f.id === secreto.id)).toMatchObject({ agentVisible: false });
    expect(boardList.body.files.find((f: { id: string }) => f.id === hijo.id)).toMatchObject({ agentVisible: false });
    expect(boardList.body.files.find((f: { id: string }) => f.id === publico.id)).toMatchObject({ agentVisible: true });
    expect((await request(app).get(`/api/company-files/${secreto.id}/content`)).status).toBe(200);

    currentActor = agentActor(company.id, agent.id, runId);
    // Root listing: the hidden folder is not a child folder, and its files are absent.
    const root = await request(app).get(`/api/companies/${company.id}/files`);
    expect(root.status).toBe(200);
    expect(root.body.folders.map((f: { id: string }) => f.id)).not.toContain(privada.id);
    expect(root.body.files.map((f: { id: string }) => f.id)).toEqual([publico.id]);
    // Direct folder listing and the tree both pretend the folder does not exist.
    expect((await request(app).get(`/api/companies/${company.id}/files?folderId=${privada.id}`)).status).toBe(404);
    const tree = await request(app).get(`/api/companies/${company.id}/files/tree`);
    expect(JSON.stringify(tree.body)).not.toContain(privada.id);
    expect(JSON.stringify(tree.body)).not.toContain(sub.id);
    // Search and scope=all exclude hidden files.
    const search = await request(app).get(`/api/companies/${company.id}/files?q=hijo`);
    expect(search.body.files).toEqual([]);
    const all = await request(app).get(`/api/companies/${company.id}/files?scope=all`);
    expect(all.body.files.map((f: { id: string }) => f.id).sort()).toEqual([publico.id].sort());
    // Single file routes answer 404 exactly as for a missing file.
    expect((await request(app).get(`/api/company-files/${secreto.id}/content`)).status).toBe(404);
    expect((await request(app).get(`/api/company-files/${hijo.id}/content`)).status).toBe(404);
    expect((await request(app).get(`/api/company-files/${secreto.id}/versions`)).status).toBe(404);
    expect((await request(app).get(`/api/company-files/${secreto.id}/usage`)).status).toBe(404);
    expect((await request(app).get(`/api/company-files/${secreto.id}/thumbnail`)).status).toBe(404);
    expect((await request(app).get(`/api/company-files/${publico.id}/content`)).status).toBe(200);

    // Re-showing the folder restores agent access.
    currentActor = boardActor(company.id);
    const shown = await request(app).patch(`/api/company-files/folders/${privada.id}`).send({ agentVisible: true });
    expect(shown.status).toBe(200);
    const reshown = await db.select().from(activityLog).where(and(eq(activityLog.companyId, company.id), eq(activityLog.action, "folder.updated"), eq(activityLog.entityId, privada.id)));
    expect(reshown).toHaveLength(2);
    currentActor = agentActor(company.id, agent.id, runId);
    expect((await request(app).get(`/api/company-files/${secreto.id}/content`)).status).toBe(200);
  });

  // ---------- ZIP download of a folder ----------

  it("folder ZIP holds nested files with folder-relative paths and current content; empty folders are 422", async () => {
    const campana = await createFolderViaApi("Campana");
    const notas = await createFolderViaApi("Notas", campana.id);
    await uploadInto(campana.id, "plan.txt", "plan v1");
    await uploadInto(notas.id, "nota.md", "# nota");
    const vacia = await createFolderViaApi("Vacia");

    const archive = await request(app).get(`/api/company-files/folders/${campana.id}/archive`).buffer(true).parse(parseBinaryResponse);
    expect(archive.status).toBe(200);
    expect(archive.headers["content-type"]).toBe("application/zip");
    expect(archive.headers["content-disposition"]).toMatch(/^attachment;.*Campana\.zip/);
    expect(readZipEntries(archive.body)).toEqual({ "plan.txt": "plan v1", "Notas/nota.md": "# nota" });

    const logged = await db.select().from(activityLog).where(and(eq(activityLog.companyId, company.id), eq(activityLog.action, "company_file.archive_downloaded")));
    expect(logged.some((row) => row.entityId === campana.id)).toBe(true);

    expect((await request(app).get(`/api/company-files/folders/${vacia.id}/archive`)).status).toBe(422);
    expect((await request(app).get(`/api/company-files/folders/${randomUUID()}/archive`)).status).toBe(404);

    currentActor = agentActor(company.id, agent.id, runId);
    expect((await request(app).get(`/api/company-files/folders/${campana.id}/archive`)).status).toBe(403);
    currentActor = boardActor(other.id);
    expect((await request(app).get(`/api/company-files/folders/${campana.id}/archive`)).status).toBe(404);
  });

  // ---------- thumbnails ----------

  it("PNG thumbnails are 320px WebP, generated once and then served from the storage cache", async () => {
    const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
    const created = await uploadInto(null, "foto.png", png, "image/png");
    expect(created.thumbnailPath).toBe(`/api/company-files/${created.id}/thumbnail`);
    const listed = await request(app).get(`/api/companies/${company.id}/files`);
    expect(listed.body.files.find((f: { id: string }) => f.id === created.id).thumbnailPath).toBe(`/api/company-files/${created.id}/thumbnail`);

    const putSpy = vi.spyOn(storage, "putFile");
    const first = await request(app).get(`/api/company-files/${created.id}/thumbnail`).buffer(true).parse(parseBinaryResponse);
    expect(first.status).toBe(200);
    expect(first.headers["content-type"]).toBe("image/webp");
    expect(first.headers["cache-control"]).toBe("private, max-age=3600");
    expect((await sharp(first.body).metadata()).width).toBe(320);
    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(putSpy.mock.calls[0]![0]).toMatchObject({ namespace: `thumbnails/${company.id}`, contentType: "image/webp" });

    const second = await request(app).get(`/api/company-files/${created.id}/thumbnail`).buffer(true).parse(parseBinaryResponse);
    expect(second.status).toBe(200);
    expect(second.body.equals(first.body)).toBe(true);
    expect(putSpy).toHaveBeenCalledTimes(1);
    putSpy.mockRestore();
  });

  it("thumbnails are 404 for non-image files and for images that cannot be decoded", async () => {
    const pdf = await uploadInto(null, "doc.pdf", "%PDF-1.4 fake", "application/pdf");
    expect(pdf.thumbnailPath).toBeNull();
    expect((await request(app).get(`/api/company-files/${pdf.id}/thumbnail`)).status).toBe(404);

    const broken = await uploadInto(null, "roto.png", "not really a png", "image/png");
    expect(broken.thumbnailPath).toBe(`/api/company-files/${broken.id}/thumbnail`);
    expect((await request(app).get(`/api/company-files/${broken.id}/thumbnail`)).status).toBe(404);
  });

  it("an agent gets the thumbnail of a visible image and 404 inside a hidden folder", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();
    const privada = await createFolderViaApi("Imagenes privadas");
    const oculta = await uploadInto(privada.id, "oculta.png", png, "image/png");
    await hideFolder(privada.id);
    currentActor = agentActor(company.id, agent.id, runId);
    expect((await request(app).get(`/api/company-files/${oculta.id}/thumbnail`)).status).toBe(404);
    currentActor = boardActor(company.id);
    expect((await request(app).get(`/api/company-files/${oculta.id}/thumbnail`)).status).toBe(200);
  });
});
