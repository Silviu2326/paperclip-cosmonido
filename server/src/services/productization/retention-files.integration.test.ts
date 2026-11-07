import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  assets,
  companies,
  companyFiles,
  companyFileVersions,
  createDb,
  type Db,
} from "@paperclipai/db";
import type { StorageService } from "../../storage/types.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
  type EmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { companyFilesService } from "../company-files.js";
import { createCompanyFileRetentionAdapter } from "./retention-files.js";

const postgresSupport = await getEmbeddedPostgresTestSupport();
const describeWithPostgres = postgresSupport.supported ? describe : describe.skip;

if (!postgresSupport.supported) {
  console.warn(
    `Skipping retention file integration tests: ${postgresSupport.reason ?? "embedded PostgreSQL is unavailable"}`,
  );
}

type StoredFile = {
  id: string;
  assetIds: string[];
  objectKeys: string[];
};

describeWithPostgres("company file retention adapter (real PostgreSQL)", () => {
  let db!: Db;
  let temporary: EmbeddedPostgresTestDatabase | undefined;

  beforeAll(async () => {
    temporary = await startEmbeddedPostgresTestDatabase("paperclip-retention-files-");
    db = createDb(temporary.connectionString);
  }, 90_000);

  afterAll(async () => {
    await db?.$client.end();
    await temporary?.cleanup();
  });

  function memoryStorage() {
    const objects = new Set<string>();
    const deleteAttempts: string[] = [];
    let failOnAttempt: number | null = null;
    const service: StorageService = {
      provider: "local_disk",
      async putFile() { throw new Error("putFile is unused in retention tests"); },
      async getObject() { throw new Error("getObject is unused in retention tests"); },
      async headObject(_companyId, objectKey) { return { exists: objects.has(objectKey) }; },
      async deleteObject(companyId, objectKey) {
        if (!objectKey.startsWith(`${companyId}/`)) throw new Error("cross-company object deletion");
        deleteAttempts.push(objectKey);
        if (failOnAttempt === deleteAttempts.length) throw new Error("temporary storage delete failure");
        objects.delete(objectKey);
      },
    };
    return {
      service,
      objects,
      deleteAttempts,
      seed(companyId: string, objectKey: string) {
        if (!objectKey.startsWith(`${companyId}/`)) throw new Error("cross-company fixture object");
        objects.add(objectKey);
      },
      failOn(attempt: number | null) { failOnAttempt = attempt; },
    };
  }

  async function company(name: string) {
    const id = randomUUID();
    const [created] = await db.insert(companies).values({
      id,
      name,
      issuePrefix: `RF${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    }).returning();
    return created!;
  }

  async function storedFile(
    companyId: string,
    storage: ReturnType<typeof memoryStorage>,
    options: { name: string; deletedAt: Date | null; versions?: number; byteSize?: number },
  ): Promise<StoredFile> {
    const fileId = randomUUID();
    const versionCount = options.versions ?? 1;
    const byteSize = options.byteSize ?? 17;
    const [file] = await db.insert(companyFiles).values({
      id: fileId,
      companyId,
      name: options.name,
      slug: `file-${fileId}`,
      contentType: "application/octet-stream",
      byteSize: byteSize * versionCount,
      deletedAt: options.deletedAt,
    }).returning();
    const storedAssets = await db.insert(assets).values(Array.from({ length: versionCount }, (_, index) => {
      const id = randomUUID();
      const objectKey = `${companyId}/${id}`;
      storage.seed(companyId, objectKey);
      return {
        id,
        companyId,
        provider: storage.service.provider,
        objectKey,
        contentType: "application/octet-stream",
        byteSize,
        sha256: `${index}`.padStart(64, "0"),
        originalFilename: `${options.name}-${index + 1}.bin`,
      };
    })).returning();
    const versions = await db.insert(companyFileVersions).values(storedAssets.map((asset, index) => ({
      companyId,
      fileId: file!.id,
      versionNumber: index + 1,
      assetId: asset.id,
    }))).returning();
    await db.update(companyFiles).set({ currentVersionId: versions.at(-1)!.id }).where(eq(companyFiles.id, file!.id));
    return { id: file!.id, assetIds: storedAssets.map((asset) => asset.id), objectKeys: storedAssets.map((asset) => asset.objectKey) };
  }

  it("previews only old soft-deleted files with unshared company-owned assets", async () => {
    const owner = await company("Retention preview owner");
    const other = await company("Retention preview other");
    const storage = memoryStorage();
    const old = new Date(Date.now() - 10 * 86_400_000);
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    const eligible = await storedFile(owner.id, storage, { name: "eligible", deletedAt: old, byteSize: 101 });
    await storedFile(owner.id, storage, { name: "active", deletedAt: null, byteSize: 103 });
    await storedFile(owner.id, storage, { name: "recent", deletedAt: new Date(Date.now() - 86_400_000), byteSize: 107 });
    const shared = await storedFile(owner.id, storage, { name: "shared", deletedAt: old, byteSize: 109 });
    const [referenceFile] = await db.insert(companyFiles).values({
      companyId: owner.id,
      name: "Reference file",
      slug: `file-${randomUUID()}`,
      contentType: "application/octet-stream",
      byteSize: 109,
    }).returning();
    await db.insert(companyFileVersions).values({ companyId: owner.id, fileId: referenceFile!.id, versionNumber: 1, assetId: shared.assetIds[0]! });
    const foreign = await storedFile(other.id, storage, { name: "foreign", deletedAt: old, byteSize: 113 });

    const result = await createCompanyFileRetentionAdapter(db, storage.service).preview(owner.id, cutoff);
    expect(result).toEqual({ files: 1, versions: 1, bytes: 101 });
    expect(storage.objects.has(eligible.objectKeys[0]!)).toBe(true);
    expect(storage.objects.has(foreign.objectKeys[0]!)).toBe(true);
  });

  it("purges bytes and metadata for one company, leaves the tombstone, and protects shared assets for restore", async () => {
    const owner = await company("Retention purge owner");
    const other = await company("Retention purge other");
    const storage = memoryStorage();
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    const purgeTarget = await storedFile(owner.id, storage, { name: "purge target", deletedAt: new Date(Date.now() - 10 * 86_400_000), byteSize: 127 });
    const protectedFile = await storedFile(owner.id, storage, { name: "shared deleted file", deletedAt: new Date(Date.now() - 10 * 86_400_000), byteSize: 131 });
    const [referenceFile] = await db.insert(companyFiles).values({
      companyId: owner.id,
      name: "Live reference",
      slug: `file-${randomUUID()}`,
      contentType: "application/octet-stream",
      byteSize: 131,
    }).returning();
    await db.insert(companyFileVersions).values({ companyId: owner.id, fileId: referenceFile!.id, versionNumber: 1, assetId: protectedFile.assetIds[0]! });
    const foreignFile = await storedFile(other.id, storage, { name: "foreign target", deletedAt: new Date(Date.now() - 10 * 86_400_000), byteSize: 137 });
    const adapter = createCompanyFileRetentionAdapter(db, storage.service);

    const result = await adapter.purgeBatch(owner.id, cutoff, null, 5);
    expect(result).toMatchObject({ processed: 2, deleted: 1, versions: 1, bytes: 127, protectedSkipped: 1, done: true });
    expect(storage.objects.has(purgeTarget.objectKeys[0]!)).toBe(false);
    expect(storage.objects.has(protectedFile.objectKeys[0]!)).toBe(true);
    expect(storage.objects.has(foreignFile.objectKeys[0]!)).toBe(true);
    expect(await db.select().from(companyFileVersions).where(eq(companyFileVersions.fileId, purgeTarget.id))).toHaveLength(0);
    expect(await db.select().from(assets).where(eq(assets.id, purgeTarget.assetIds[0]!))).toHaveLength(0);
    const [purgedRow] = await db.select().from(companyFiles).where(and(eq(companyFiles.id, purgeTarget.id), eq(companyFiles.companyId, owner.id)));
    expect(purgedRow).toMatchObject({ deletedAt: expect.any(Date), retentionPurgeStartedAt: expect.any(Date), retentionPurgedAt: expect.any(Date), currentVersionId: null, byteSize: 0 });
    expect(await db.select().from(companyFileVersions).where(eq(companyFileVersions.fileId, protectedFile.id))).toHaveLength(1);
    const restored = await companyFilesService(db, storage.service).restore(owner.id, protectedFile.id);
    expect(restored.id).toBe(protectedFile.id);
    const [restoredRow] = await db.select().from(companyFiles).where(eq(companyFiles.id, protectedFile.id));
    expect(restoredRow?.deletedAt).toBeNull();
    await expect(companyFilesService(db, storage.service).restore(owner.id, purgeTarget.id)).rejects.toMatchObject({ status: 409 });
  });

  it("keeps the start marker and metadata after storage failure, then retries idempotently", async () => {
    const owner = await company("Retention retry owner");
    const storage = memoryStorage();
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    const target = await storedFile(owner.id, storage, { name: "retry target", deletedAt: new Date(Date.now() - 10 * 86_400_000), versions: 2, byteSize: 149 });
    const adapter = createCompanyFileRetentionAdapter(db, storage.service);
    storage.failOn(2);

    await expect(adapter.purgeBatch(owner.id, cutoff, null, 5)).rejects.toThrow("temporary storage delete failure");
    const [afterFailure] = await db.select().from(companyFiles).where(eq(companyFiles.id, target.id));
    expect(afterFailure).toMatchObject({ retentionPurgeStartedAt: expect.any(Date), retentionPurgedAt: null });
    expect(await db.select().from(companyFileVersions).where(eq(companyFileVersions.fileId, target.id))).toHaveLength(2);
    expect(await db.select().from(assets).where(eq(assets.companyId, owner.id))).toHaveLength(2);
    await expect(companyFilesService(db, storage.service).restore(owner.id, target.id)).rejects.toMatchObject({ status: 409 });

    storage.failOn(null);
    const retry = await adapter.purgeBatch(owner.id, cutoff, null, 5);
    expect(retry).toMatchObject({ deleted: 1, versions: 2, bytes: 298, done: true });
    expect(target.objectKeys.every((key) => !storage.objects.has(key))).toBe(true);
    expect(await db.select().from(companyFileVersions).where(eq(companyFileVersions.fileId, target.id))).toHaveLength(0);
    expect(await db.select().from(assets).where(eq(assets.companyId, owner.id))).toHaveLength(0);
    const [afterRetry] = await db.select().from(companyFiles).where(eq(companyFiles.id, target.id));
    expect(afterRetry?.retentionPurgedAt).toEqual(expect.any(Date));

    const attempts = storage.deleteAttempts.length;
    const replay = await adapter.purgeBatch(owner.id, cutoff, null, 5);
    expect(replay).toMatchObject({ deleted: 0, done: true });
    expect(storage.deleteAttempts).toHaveLength(attempts);
  });
});
