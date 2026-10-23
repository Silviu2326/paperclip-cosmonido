import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assets, companies, companyFiles, companyFileVersions, createDb, deliverableReviews, type Db } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase, type EmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { deliverableReviewService } from "../services/deliverable-reviews.js";

describe("review availability and immutable version boundaries", () => {
  let temp: EmbeddedPostgresTestDatabase | undefined;
  let db: Db;
  beforeAll(async () => { temp = await startEmbeddedPostgresTestDatabase("paperclip-s95-review-"); db = createDb(temp.connectionString); }, 90_000);
  afterAll(async () => { await temp?.cleanup(); });

  async function fixture() {
    const companyId = randomUUID(), fileId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Review", issuePrefix: `RV${randomUUID().slice(0, 6).toUpperCase()}` });
    const [asset] = await db.insert(assets).values({ companyId, provider: "local_disk", objectKey: `${companyId}/fixture`, contentType: "text/plain", byteSize: 1, sha256: "a".repeat(64), originalFilename: "fixture.txt" }).returning();
    await db.insert(companyFiles).values({ id: fileId, companyId, name: "Fixture", slug: "fixture", contentType: "text/plain" });
    const [version] = await db.insert(companyFileVersions).values({ companyId, fileId, assetId: asset!.id, versionNumber: 1 }).returning();
    await db.update(companyFiles).set({ currentVersionId: version!.id }).where(eq(companyFiles.id, fileId));
    const service = deliverableReviewService(db);
    const review = await service.submit(companyId, { targetKind: "company_file_version", targetId: version!.id, targetVersion: "1", summary: "Review this exact version" }, { userId: "operator" });
    return { companyId, fileId, asset: asset!, version: version!, service, review: review! };
  }

  it("refuses to approve a file after retention has started, without resolving the review", async () => {
    const f = await fixture();
    await db.update(companyFiles).set({ deletedAt: new Date(), retentionPurgeStartedAt: new Date() }).where(eq(companyFiles.id, f.fileId));
    await expect(f.service.resolve(f.review.id, { state: "accepted", expectedRevision: f.review.updatedAt.toISOString() }, { userId: "operator" })).rejects.toMatchObject({ status: 409 });
    const [review] = await db.select().from(deliverableReviews).where(and(eq(deliverableReviews.companyId, f.companyId), eq(deliverableReviews.id, f.review.id)));
    expect(review?.state).toBe("pending");
  });

  it("accepts only the pinned immutable version and leaves a later version unreviewed", async () => {
    const f = await fixture();
    const [later] = await db.insert(companyFileVersions).values({ companyId: f.companyId, fileId: f.fileId, assetId: f.asset.id, versionNumber: 2 }).returning();
    await db.update(companyFiles).set({ currentVersionId: later!.id }).where(eq(companyFiles.id, f.fileId));
    const accepted = await f.service.resolve(f.review.id, { state: "accepted", expectedRevision: f.review.updatedAt.toISOString() }, { userId: "operator" });
    expect(accepted.targetId).toBe(f.version.id);
    expect(accepted.targetVersion).toBe("1");
    expect(await db.select().from(deliverableReviews).where(eq(deliverableReviews.targetId, later!.id))).toEqual([]);
  });
});
