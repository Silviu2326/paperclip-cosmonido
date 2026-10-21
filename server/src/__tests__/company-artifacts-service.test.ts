import { Readable } from "node:stream";
import express from "express";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agents,
  artifactMemberships,
  assets,
  companies,
  createDb,
  documentMemberships,
  documents,
  heartbeatRuns,
  issueAttachments,
  issueComments,
  issueDocuments,
  issues,
  issueWorkProducts,
  projects,
} from "@paperclipai/db";
import { ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY } from "@paperclipai/shared";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { companyRoutes } from "../routes/companies.js";
import { companyArtifactsService } from "../services/company-artifacts.js";
import type { StorageService } from "../storage/types.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company artifacts tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

function createStorageService(files: Record<string, Buffer> = {}): StorageService {
  return {
    provider: "local_disk",
    putFile: vi.fn(),
    getObject: vi.fn(async (_companyId, objectKey, options) => {
      const body = files[objectKey] ?? Buffer.alloc(0);
      const range = options?.range;
      const ranged = range ? body.subarray(range.start, range.end + 1) : body;
      return {
        stream: Readable.from(ranged),
        contentType: "text/plain",
        contentLength: ranged.length,
      };
    }),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
  };
}

describeEmbeddedPostgres("companyArtifactsService", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-artifacts-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(artifactMemberships);
    await db.delete(documentMemberships);
    await db.delete(issueWorkProducts);
    await db.delete(issueAttachments);
    await db.delete(assets);
    await db.delete(issueComments);
    await db.delete(issueDocuments);
    await db.delete(documents);
    await db.delete(heartbeatRuns);
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(activityLog);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedArtifacts() {
    const companyId = "11111111-1111-4111-8111-111111111111";
    const otherCompanyId = "22222222-2222-4222-8222-222222222222";
    const agentId = "33333333-3333-4333-8333-333333333333";
    const otherAgentId = "44444444-4444-4444-8444-444444444444";
    const projectId = "55555555-5555-4555-8555-555555555555";
    const issueId = "66666666-6666-4666-8666-666666666666";
    const secondIssueId = "77777777-7777-4777-8777-777777777777";
    const otherIssueId = "88888888-8888-4888-8888-888888888888";
    const runId = "99999999-9999-4999-8999-999999999999";
    const otherRunId = "19191919-1919-4191-8191-191919191919";
    const directAttachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const workProductAttachmentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    await db.insert(companies).values([
      { id: companyId, name: "Paperclip", issuePrefix: "PAP", requireBoardApprovalForNewAgents: false },
      { id: otherCompanyId, name: "OtherCo", issuePrefix: "OTH", requireBoardApprovalForNewAgents: false },
    ]);
    await db.insert(agents).values([
      { id: agentId, companyId, name: "Coder", role: "engineer" },
      { id: otherAgentId, companyId: otherCompanyId, name: "Other", role: "engineer" },
    ]);
    await db.insert(projects).values({ id: projectId, companyId, name: "Artifacts", status: "in_progress" });
    await db.insert(issues).values([
      {
        id: issueId,
        companyId,
        projectId,
        identifier: "PAP-1",
        title: "Make the reel",
        status: "done",
        priority: "medium",
      },
      {
        id: secondIssueId,
        companyId,
        identifier: "PAP-2",
        title: "Write the plan",
        status: "done",
        priority: "medium",
      },
      {
        id: otherIssueId,
        companyId: otherCompanyId,
        identifier: "OTH-1",
        title: "Other output",
        status: "done",
        priority: "medium",
      },
    ]);
    await db.insert(heartbeatRuns).values([
      {
        id: runId,
        companyId,
        agentId,
        status: "completed",
      },
      {
        id: otherRunId,
        companyId: otherCompanyId,
        agentId: otherAgentId,
        status: "completed",
      },
    ]);
    await db.insert(documents).values([
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        companyId,
        title: "Review Notes",
        latestBody: "# Review\n\nAgent-created review document with useful details.",
        createdByAgentId: agentId,
        updatedAt: new Date("2026-01-04T00:00:00.000Z"),
      },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        companyId,
        title: "Continuation Summary",
        latestBody: "System handoff",
        createdByAgentId: agentId,
        updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      },
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        companyId,
        title: "User Upload Notes",
        latestBody: "User-authored context",
        createdByUserId: "user-1",
        updatedAt: new Date("2026-01-06T00:00:00.000Z"),
      },
      {
        id: "20202020-2020-4020-8020-202020202020",
        companyId,
        title: "Plan",
        latestBody: "Human-approved plan",
        createdByUserId: "user-1",
        updatedAt: new Date("2026-01-08T00:00:00.000Z"),
      },
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        companyId: otherCompanyId,
        title: "Other Company Plan",
        latestBody: "Must not cross tenants",
        createdByAgentId: otherAgentId,
        updatedAt: new Date("2026-01-07T00:00:00.000Z"),
      },
    ]);
    await db.insert(issueDocuments).values([
      {
        companyId,
        issueId: secondIssueId,
        documentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        key: "review",
      },
      {
        companyId,
        issueId,
        documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        key: ISSUE_CONTINUATION_SUMMARY_DOCUMENT_KEY,
      },
      {
        companyId,
        issueId,
        documentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        key: "user-notes",
      },
      {
        companyId,
        issueId: secondIssueId,
        documentId: "20202020-2020-4020-8020-202020202020",
        key: "plan",
      },
      {
        companyId: otherCompanyId,
        issueId: otherIssueId,
        documentId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        key: "plan",
      },
    ]);
    await db.insert(issueComments).values({
      id: "12121212-1212-4121-8121-121212121212",
      companyId,
      issueId,
      authorType: "agent",
      authorAgentId: agentId,
      body: "comment with screenshot",
    });
    await db.insert(assets).values([
      {
        id: "13131313-1313-4131-8131-131313131313",
        companyId,
        provider: "local_disk",
        objectKey: "direct-video.mp4",
        contentType: "video/mp4",
        byteSize: 100,
        sha256: "sha256-direct-video",
        originalFilename: "direct-video.mp4",
        createdByAgentId: agentId,
      },
      {
        id: "14141414-1414-4141-8141-141414141414",
        companyId,
        provider: "local_disk",
        objectKey: "primary-cut.mp4",
        contentType: "video/mp4",
        byteSize: 200,
        sha256: "sha256-primary-cut",
        originalFilename: "primary-cut.mp4",
        createdByAgentId: agentId,
      },
      {
        id: "15151515-1515-4151-8151-151515151515",
        companyId,
        provider: "local_disk",
        objectKey: "operator-screenshot.png",
        contentType: "image/png",
        byteSize: 300,
        sha256: "sha256-user",
        originalFilename: "operator-screenshot.png",
        createdByUserId: "user-1",
      },
      {
        id: "16161616-1616-4161-8161-161616161616",
        companyId,
        provider: "local_disk",
        objectKey: "comment-screenshot.png",
        contentType: "image/png",
        byteSize: 400,
        sha256: "sha256-comment",
        originalFilename: "comment-screenshot.png",
        createdByAgentId: agentId,
      },
      {
        id: "17171717-1717-4171-8171-171717171717",
        companyId,
        provider: "local_disk",
        objectKey: "notes.txt",
        contentType: "text/plain",
        byteSize: 64,
        sha256: "sha256-notes",
        originalFilename: "notes.txt",
        createdByAgentId: agentId,
      },
    ]);
    await db.insert(issueAttachments).values([
      {
        id: directAttachmentId,
        companyId,
        issueId,
        assetId: "13131313-1313-4131-8131-131313131313",
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
      {
        id: workProductAttachmentId,
        companyId,
        issueId,
        assetId: "14141414-1414-4141-8141-141414141414",
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        companyId,
        issueId,
        assetId: "15151515-1515-4151-8151-151515151515",
        updatedAt: new Date("2026-01-08T00:00:00.000Z"),
      },
      {
        companyId,
        issueId,
        assetId: "16161616-1616-4161-8161-161616161616",
        issueCommentId: "12121212-1212-4121-8121-121212121212",
        updatedAt: new Date("2026-01-09T00:00:00.000Z"),
      },
      {
        companyId,
        issueId,
        assetId: "17171717-1717-4171-8171-171717171717",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    await db.insert(issueWorkProducts).values({
      id: "18181818-1818-4181-8181-181818181818",
      companyId,
      projectId,
      issueId,
      type: "artifact",
      provider: "paperclip",
      title: "Primary Cut",
      status: "ready_for_review",
      summary: "Main render for review",
      isPrimary: true,
      metadata: {
        attachmentId: workProductAttachmentId,
        contentType: "video/mp4",
        byteSize: 200,
        contentPath: `/api/attachments/${workProductAttachmentId}/content`,
        openPath: `/api/attachments/${workProductAttachmentId}/content`,
        downloadPath: `/api/attachments/${workProductAttachmentId}/content?download=1`,
        originalFilename: "primary-cut.mp4",
      },
      createdByRunId: runId,
      updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    });

    return { companyId, otherCompanyId, projectId, issueId, secondIssueId, otherIssueId, otherRunId };
  }

  it("returns only the caller's starred documents, including plan and human-authored documents, with cursor order", async () => {
    const { companyId } = await seedArtifacts();
    await db.insert(documentMemberships).values([
      {
        companyId,
        documentId: "20202020-2020-4020-8020-202020202020",
        userId: "user-1",
        starredAt: new Date("2026-02-03T00:00:00.000Z"),
      },
      {
        companyId,
        documentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        userId: "user-1",
        starredAt: new Date("2026-02-02T00:00:00.000Z"),
      },
      {
        companyId,
        documentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        userId: "other-user",
        starredAt: new Date("2026-02-04T00:00:00.000Z"),
      },
    ]);

    const app = express();
    app.use((req, _res, next) => {
      req.actor = {
        type: "board",
        userId: "user-1",
        source: "session",
        companyIds: [companyId],
        memberships: [{ companyId, membershipRole: "viewer", status: "active" }],
      };
      next();
    });
    app.use("/api/companies", companyRoutes(db, createStorageService()));
    app.use(errorHandler);

    const first = await request(app).get(`/api/companies/${companyId}/artifacts?starred=true&limit=1`);
    expect(first.status).toBe(200);
    expect(first.body.artifacts.map((artifact: { title: string }) => artifact.title)).toEqual(["Plan"]);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await request(app).get(
      `/api/companies/${companyId}/artifacts?starred=true&limit=10&cursor=${first.body.nextCursor}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.artifacts.map((artifact: { title: string }) => artifact.title)).toEqual(["User Upload Notes"]);
    expect(second.body.artifacts.every((artifact: { source: string }) => artifact.source === "document")).toBe(true);

    const incompatibleKind = await request(app).get(
      `/api/companies/${companyId}/artifacts?starred=true&kind=image`,
    );
    expect(incompatibleKind.status).toBe(200);
    expect(incompatibleKind.body).toEqual({ artifacts: [], nextCursor: null });
  });

  it("returns starred attachments and work products from artifact memberships, scoped to the caller", async () => {
    const { companyId } = await seedArtifacts();
    const directAttachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const workProductId = "18181818-1818-4181-8181-181818181818";
    await db.insert(artifactMemberships).values([
      {
        companyId,
        artifactRef: `attachment:${directAttachmentId}`,
        userId: "user-1",
        starredAt: new Date("2026-02-05T00:00:00.000Z"),
      },
      {
        companyId,
        artifactRef: `work_product:${workProductId}`,
        userId: "user-1",
        starredAt: new Date("2026-02-03T00:00:00.000Z"),
      },
      {
        companyId,
        artifactRef: `attachment:${directAttachmentId}`,
        userId: "other-user",
        starredAt: new Date("2026-02-06T00:00:00.000Z"),
      },
      {
        companyId,
        artifactRef: "attachment:notes-not-starred",
        userId: "user-1",
        starredAt: null,
      },
    ]);

    const app = express();
    app.use((req, _res, next) => {
      req.actor = {
        type: "board",
        userId: "user-1",
        source: "session",
        companyIds: [companyId],
        memberships: [{ companyId, membershipRole: "viewer", status: "active" }],
      };
      next();
    });
    app.use("/api/companies", companyRoutes(db, createStorageService()));
    app.use(errorHandler);

    const starred = await request(app).get(`/api/companies/${companyId}/artifacts?starred=true`);
    expect(starred.status).toBe(200);
    expect(starred.body.artifacts.map((artifact: { title: string }) => artifact.title)).toEqual([
      "direct-video.mp4",
      "Primary Cut",
    ]);
    expect(starred.body.artifacts.map((artifact: { source: string }) => artifact.source)).toEqual([
      "attachment",
      "work_product",
    ]);

    const starredVideos = await request(app).get(`/api/companies/${companyId}/artifacts?starred=true&kind=video`);
    expect(starredVideos.body.artifacts.map((artifact: { title: string }) => artifact.title)).toEqual([
      "direct-video.mp4",
      "Primary Cut",
    ]);
  });

  it("returns an empty starred view for agent callers", async () => {
    const { companyId, otherRunId } = await seedArtifacts();
    await db.insert(documentMemberships).values({
      companyId,
      documentId: "20202020-2020-4020-8020-202020202020",
      userId: "user-1",
    });
    const app = express();
    app.use((req, _res, next) => {
      req.actor = {
        type: "agent",
        agentId: "33333333-3333-4333-8333-333333333333",
        companyId,
        runId: otherRunId,
        source: "agent_key",
      };
      next();
    });
    app.use("/api/companies", companyRoutes(db, createStorageService()));
    app.use(errorHandler);

    const response = await request(app).get(`/api/companies/${companyId}/artifacts?starred=true`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ artifacts: [], nextCursor: null });
  });

  it("projects agent-created documents, direct attachments, and work products while excluding noisy sources", async () => {
    const { companyId } = await seedArtifacts();
    const storage = createStorageService({ "notes.txt": Buffer.from("Text file preview from an agent output.") });
    const result = await companyArtifactsService(db, storage).list(companyId, { limit: 20 });

    expect(result.nextCursor).toBeNull();
    expect(result.artifacts.map((artifact) => artifact.title)).toEqual([
      "Review Notes",
      "direct-video.mp4",
      "Primary Cut",
      "notes.txt",
    ]);
    expect(result.artifacts.map((artifact) => artifact.source)).toEqual([
      "document",
      "attachment",
      "work_product",
      "attachment",
    ]);
    expect(result.artifacts.find((artifact) => artifact.title === "notes.txt")?.previewText)
      .toBe("Text file preview from an agent output.");
    expect(result.artifacts.some((artifact) => artifact.title === "primary-cut.mp4")).toBe(false);
    expect(result.artifacts.some((artifact) => artifact.title === "Continuation Summary")).toBe(false);
    expect(result.artifacts.some((artifact) => artifact.title === "operator-screenshot.png")).toBe(false);
    expect(result.artifacts.some((artifact) => artifact.title === "comment-screenshot.png")).toBe(false);
    expect(result.artifacts.some((artifact) => artifact.issue.identifier === "OTH-1")).toBe(false);
  });

  it("supports project, kind, search, and cursor filters", async () => {
    const { companyId, projectId } = await seedArtifacts();
    const storage = createStorageService({ "notes.txt": Buffer.from("Searchable notes preview") });

    const projectVideos = await companyArtifactsService(db, storage).list(companyId, {
      projectId,
      kind: "video",
      limit: 10,
    });
    expect(projectVideos.artifacts.map((artifact) => artifact.title)).toEqual(["direct-video.mp4", "Primary Cut"]);

    const search = await companyArtifactsService(db, storage).list(companyId, {
      q: "review document",
      limit: 10,
    });
    expect(search.artifacts.map((artifact) => artifact.title)).toEqual(["Review Notes"]);

    const firstPage = await companyArtifactsService(db, storage).list(companyId, { limit: 2 });
    expect(firstPage.artifacts.map((artifact) => artifact.title)).toEqual(["Review Notes", "direct-video.mp4"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = await companyArtifactsService(db, storage).list(companyId, {
      limit: 10,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.artifacts.map((artifact) => artifact.title)).toEqual(["Primary Cut", "notes.txt"]);

    const pageAfterPrimaryWorkProduct = await companyArtifactsService(db, storage).list(companyId, { limit: 3 });
    expect(pageAfterPrimaryWorkProduct.artifacts.map((artifact) => artifact.title)).toEqual([
      "Review Notes",
      "direct-video.mp4",
      "Primary Cut",
    ]);

    const afterPrimaryCursor = await companyArtifactsService(db, storage).list(companyId, {
      limit: 10,
      cursor: pageAfterPrimaryWorkProduct.nextCursor ?? undefined,
    });
    expect(afterPrimaryCursor.artifacts.map((artifact) => artifact.title)).toEqual(["notes.txt"]);
  });

  it("filters every artifact source by the agent it is attributed to", async () => {
    const { companyId } = await seedArtifacts();
    const writerId = "21212121-2121-4121-8121-212121212121";
    await db.insert(agents).values({ id: writerId, companyId, name: "Writer", role: "engineer" });
    await db.update(documents).set({ createdByAgentId: writerId })
      .where(eq(documents.id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"));
    const storage = createStorageService({ "notes.txt": Buffer.from("notes") });

    const writer = await companyArtifactsService(db, storage).list(companyId, { agentId: writerId, limit: 20 });
    expect(writer.artifacts.map((artifact) => artifact.title)).toEqual(["Review Notes"]);

    const original = await companyArtifactsService(db, storage).list(companyId, {
      agentId: "33333333-3333-4333-8333-333333333333",
      limit: 20,
    });
    expect(original.artifacts.map((artifact) => artifact.title)).toEqual(["direct-video.mp4", "Primary Cut", "notes.txt"]);
    expect(new Set(original.artifacts.map((artifact) => artifact.createdByAgent?.id)))
      .toEqual(new Set(["33333333-3333-4333-8333-333333333333"]));

    const foreign = await companyArtifactsService(db, storage).list(companyId, {
      agentId: "44444444-4444-4444-8444-444444444444",
      limit: 20,
    });
    expect(foreign.artifacts).toEqual([]);
  });

  it("deduplicates work product attachments beyond the work product fetch window", async () => {
    const { companyId, projectId, issueId } = await seedArtifacts();
    const dedupedAttachmentId = "abababab-abab-4bab-8bab-abababababab";

    await db.insert(assets).values({
      id: "acacacac-acac-4cac-8cac-acacacacacac",
      companyId,
      provider: "local_disk",
      objectKey: "late-render.mp4",
      contentType: "video/mp4",
      byteSize: 500,
      sha256: "sha256-late-render",
      originalFilename: "late-render.mp4",
      createdByAgentId: "33333333-3333-4333-8333-333333333333",
    });
    await db.insert(issueAttachments).values({
      id: dedupedAttachmentId,
      companyId,
      issueId,
      assetId: "acacacac-acac-4cac-8cac-acacacacacac",
      updatedAt: new Date("2026-01-20T00:00:00.000Z"),
    });

    const fillerWorkProducts = Array.from({ length: 21 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      companyId,
      projectId,
      issueId,
      type: "artifact" as const,
      provider: "paperclip",
      title: `Filler Video ${index + 1}`,
      status: "ready_for_review" as const,
      summary: "Filler artifact to push the attachment-backed work product past the fetch window",
      metadata: { contentType: "video/mp4" },
      createdByRunId: "99999999-9999-4999-8999-999999999999",
      updatedAt: new Date(`2026-01-10T00:${String(index).padStart(2, "0")}:00.000Z`),
    }));
    await db.insert(issueWorkProducts).values([
      ...fillerWorkProducts,
      {
        id: "adadadad-adad-4dad-8dad-adadadadadad",
        companyId,
        projectId,
        issueId,
        type: "artifact",
        provider: "paperclip",
        title: "Late Render",
        status: "ready_for_review",
        summary: "Attachment-backed work product outside the limited fetch window",
        metadata: {
          attachmentId: dedupedAttachmentId,
          contentType: "video/mp4",
          byteSize: 500,
          contentPath: `/api/attachments/${dedupedAttachmentId}/content`,
          openPath: `/api/attachments/${dedupedAttachmentId}/content`,
          downloadPath: `/api/attachments/${dedupedAttachmentId}/content?download=1`,
          originalFilename: "late-render.mp4",
        },
        createdByRunId: "99999999-9999-4999-8999-999999999999",
        updatedAt: new Date("2026-01-01T12:00:00.000Z"),
      },
    ]);

    const result = await companyArtifactsService(db, createStorageService()).list(companyId, {
      kind: "video",
      limit: 20,
    });

    expect(result.artifacts.some((artifact) => artifact.title === "late-render.mp4")).toBe(false);
  });

  it("does not project a foreign agent from a malformed work product run reference", async () => {
    const { companyId, issueId, otherRunId } = await seedArtifacts();

    await db.insert(issueWorkProducts).values({
      id: "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a",
      companyId,
      issueId,
      type: "artifact",
      provider: "paperclip",
      title: "Forged Run Artifact",
      status: "ready_for_review",
      summary: "Historically malformed run attribution",
      metadata: { contentType: "text/plain" },
      createdByRunId: otherRunId,
      updatedAt: new Date("2026-01-10T00:00:00.000Z"),
    });

    const result = await companyArtifactsService(db, createStorageService()).list(companyId, { limit: 20 });
    const forged = result.artifacts.find((artifact) => artifact.title === "Forged Run Artifact");

    expect(forged).toBeTruthy();
    expect(forged?.createdByAgent).toBeNull();
    expect(result.artifacts.some((artifact) => artifact.createdByAgent?.name === "Other")).toBe(false);
  });

  it("does not leak foreign issue or project metadata through malformed artifact link rows", async () => {
    const { companyId, otherCompanyId, otherIssueId } = await seedArtifacts();
    const foreignProjectId = "1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b";
    const malformedAttachmentId = "1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c";

    await db.insert(projects).values({
      id: foreignProjectId,
      companyId: otherCompanyId,
      name: "Foreign Project",
      status: "in_progress",
    });
    await db.update(issues).set({ projectId: foreignProjectId }).where(eq(issues.id, otherIssueId));
    await db.insert(documents).values({
      id: "1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d",
      companyId,
      title: "Forged Link Document",
      latestBody: "This row is company-owned but points at a foreign issue.",
      createdByAgentId: "33333333-3333-4333-8333-333333333333",
      updatedAt: new Date("2026-01-30T00:00:00.000Z"),
    });
    await db.insert(issueDocuments).values({
      companyId,
      issueId: otherIssueId,
      documentId: "1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d",
      key: "forged-link-document",
    });
    await db.insert(assets).values({
      id: "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e",
      companyId,
      provider: "local_disk",
      objectKey: "forged-link.txt",
      contentType: "text/plain",
      byteSize: 42,
      sha256: "sha256-forged-link",
      originalFilename: "forged-link.txt",
      createdByAgentId: "33333333-3333-4333-8333-333333333333",
    });
    await db.insert(issueAttachments).values({
      id: malformedAttachmentId,
      companyId,
      issueId: otherIssueId,
      assetId: "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e",
      updatedAt: new Date("2026-01-29T00:00:00.000Z"),
    });
    await db.insert(issueWorkProducts).values({
      id: "1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f",
      companyId,
      issueId: otherIssueId,
      type: "artifact",
      provider: "paperclip",
      title: "Forged Link Work Product",
      status: "ready_for_review",
      summary: "This row is company-owned but points at a foreign issue.",
      metadata: { contentType: "text/plain" },
      createdByRunId: "99999999-9999-4999-8999-999999999999",
      updatedAt: new Date("2026-01-28T00:00:00.000Z"),
    });

    const flat = await companyArtifactsService(db, createStorageService()).list(companyId, { limit: 20 });
    expect(flat.artifacts.map((artifact) => artifact.title)).not.toEqual(expect.arrayContaining([
      "Forged Link Document",
      "forged-link.txt",
      "Forged Link Work Product",
    ]));
    expect(flat.artifacts.some((artifact) => artifact.issue.identifier === "OTH-1")).toBe(false);
    expect(flat.artifacts.some((artifact) => artifact.issue.title === "Other output")).toBe(false);
    expect(flat.artifacts.some((artifact) => artifact.project?.name === "Foreign Project")).toBe(false);

    const grouped = await companyArtifactsService(db, createStorageService()).list(companyId, {
      groupBy: "task",
      limit: 20,
    });
    expect(grouped.groups?.some((group) => group.issue.identifier === "OTH-1")).toBe(false);
    expect(grouped.groups?.some((group) => group.issue.title === "Other output")).toBe(false);
    expect(grouped.groups?.some((group) =>
      group.previewArtifacts.some((artifact) => artifact.project?.name === "Foreign Project")
    )).toBe(false);

    const selectedForeignGroup = await companyArtifactsService(db, createStorageService()).list(companyId, {
      groupBy: "task",
      groupIssueId: otherIssueId,
      limit: 20,
    });
    expect(selectedForeignGroup).toEqual({
      artifacts: [],
      selectedGroup: null,
      nextCursor: null,
    });
  });

  it("groups artifacts by task after applying media, project, and search filters", async () => {
    const { companyId, projectId, issueId } = await seedArtifacts();
    const storage = createStorageService({ "notes.txt": Buffer.from("Searchable notes preview") });

    const grouped = await companyArtifactsService(db, storage).list(companyId, {
      groupBy: "task",
      limit: 10,
    });
    expect(grouped.artifacts).toEqual([]);
    expect(grouped.nextCursor).toBeNull();
    expect(grouped.groups?.map((group) => ({
      issue: group.issue.identifier,
      count: group.count,
      mediaKinds: group.mediaKinds,
      href: group.href,
    }))).toEqual([
      {
        issue: "PAP-2",
        count: 1,
        mediaKinds: ["document"],
        href: "/PAP/artifacts?groupBy=task&groupIssueId=77777777-7777-4777-8777-777777777777",
      },
      {
        issue: "PAP-1",
        count: 3,
        mediaKinds: ["video", "text"],
        href: "/PAP/artifacts?groupBy=task&groupIssueId=66666666-6666-4666-8666-666666666666",
      },
    ]);
    expect(grouped.groups?.find((group) => group.issue.id === issueId)?.previewArtifacts.map((artifact) => artifact.title))
      .toEqual(["direct-video.mp4", "Primary Cut", "notes.txt"]);

    const projectVideos = await companyArtifactsService(db, storage).list(companyId, {
      groupBy: "task",
      projectId,
      kind: "video",
      limit: 10,
    });
    expect(projectVideos.groups?.map((group) => ({
      issue: group.issue.identifier,
      count: group.count,
      href: group.href,
    }))).toEqual([
      {
        issue: "PAP-1",
        count: 2,
        href:
          "/PAP/artifacts?groupBy=task&groupIssueId=66666666-6666-4666-8666-666666666666&kind=video&projectId=55555555-5555-4555-8555-555555555555",
      },
    ]);

    const search = await companyArtifactsService(db, storage).list(companyId, {
      groupBy: "task",
      q: "review document",
      limit: 10,
    });
    expect(search.groups?.map((group) => ({ issue: group.issue.identifier, count: group.count }))).toEqual([
      { issue: "PAP-2", count: 1 },
    ]);
  });

  it("paginates grouped task lists with the active group cursor", async () => {
    const { companyId } = await seedArtifacts();

    const firstPage = await companyArtifactsService(db, createStorageService()).list(companyId, {
      groupBy: "task",
      limit: 1,
    });
    expect(firstPage.groups?.map((group) => group.issue.identifier)).toEqual(["PAP-2"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = await companyArtifactsService(db, createStorageService()).list(companyId, {
      groupBy: "task",
      limit: 10,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.groups?.map((group) => group.issue.identifier)).toEqual(["PAP-1"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("groups parent-task artifacts under the topmost same-company ancestor", async () => {
    const { companyId, issueId, secondIssueId } = await seedArtifacts();
    const grandchildIssueId = "21212121-2121-4212-8121-212121212121";
    const grandchildAttachmentId = "23232323-2323-4232-8232-232323232323";

    await db.update(issues).set({ parentId: issueId }).where(eq(issues.id, secondIssueId));
    await db.insert(issues).values({
      id: grandchildIssueId,
      companyId,
      parentId: secondIssueId,
      identifier: "PAP-3",
      title: "Grandchild render",
      status: "done",
      priority: "medium",
    });
    await db.insert(assets).values({
      id: "24242424-2424-4242-8242-242424242424",
      companyId,
      provider: "local_disk",
      objectKey: "grandchild.txt",
      contentType: "text/plain",
      byteSize: 48,
      sha256: "sha256-grandchild",
      originalFilename: "grandchild.txt",
      createdByAgentId: "33333333-3333-4333-8333-333333333333",
    });
    await db.insert(issueAttachments).values({
      id: grandchildAttachmentId,
      companyId,
      issueId: grandchildIssueId,
      assetId: "24242424-2424-4242-8242-242424242424",
      updatedAt: new Date("2026-01-05T00:00:00.000Z"),
    });

    const grouped = await companyArtifactsService(db, createStorageService()).list(companyId, {
      groupBy: "parent_task",
      limit: 10,
    });

    expect(grouped.artifacts).toEqual([]);
    expect(grouped.groups?.map((group) => ({
      issue: group.issue.identifier,
      count: group.count,
      previewTitles: group.previewArtifacts.map((artifact) => artifact.title),
    }))).toEqual([
      {
        issue: "PAP-1",
        count: 5,
        previewTitles: ["grandchild.txt", "Review Notes", "direct-video.mp4"],
      },
    ]);
  });

  it("returns selected group artifact pages and metadata without leaking foreign group issues", async () => {
    const { companyId, issueId, otherIssueId } = await seedArtifacts();

    const selected = await companyArtifactsService(db, createStorageService()).list(companyId, {
      groupBy: "task",
      groupIssueId: issueId,
      limit: 2,
    });
    expect(selected.groups).toBeUndefined();
    expect(selected.selectedGroup).toMatchObject({
      id: `task:${issueId}`,
      groupBy: "task",
      issue: { identifier: "PAP-1" },
      count: 3,
    });
    expect(selected.artifacts.map((artifact) => artifact.title)).toEqual(["direct-video.mp4", "Primary Cut"]);
    expect(selected.nextCursor).toEqual(expect.any(String));

    const selectedSecondPage = await companyArtifactsService(db, createStorageService()).list(companyId, {
      groupBy: "task",
      groupIssueId: issueId,
      limit: 10,
      cursor: selected.nextCursor ?? undefined,
    });
    expect(selectedSecondPage.artifacts.map((artifact) => artifact.title)).toEqual(["notes.txt"]);

    const selectedEmptyByFilter = await companyArtifactsService(db, createStorageService()).list(companyId, {
      groupBy: "task",
      groupIssueId: issueId,
      q: "does-not-match-this-stack",
      limit: 10,
    });
    expect(selectedEmptyByFilter.selectedGroup).toMatchObject({
      id: `task:${issueId}`,
      count: 0,
    });
    expect(selectedEmptyByFilter.artifacts).toEqual([]);

    const foreignSelected = await companyArtifactsService(db, createStorageService()).list(companyId, {
      groupBy: "task",
      groupIssueId: otherIssueId,
      limit: 10,
    });
    expect(foreignSelected).toEqual({
      artifacts: [],
      selectedGroup: null,
      nextCursor: null,
    });
  });

  it("reports byteSize and createdAt for every source and filters by issueId", async () => {
    const { companyId, issueId } = await seedArtifacts();
    const storage = createStorageService({ "notes.txt": Buffer.from("Searchable notes preview") });

    const all = await companyArtifactsService(db, storage).list(companyId, { limit: 10 });
    const byTitle = new Map(all.artifacts.map((artifact) => [artifact.title, artifact]));
    expect(byTitle.get("Review Notes")?.byteSize).toBe(
      Buffer.byteLength("# Review\n\nAgent-created review document with useful details.", "utf8"),
    );
    expect(byTitle.get("direct-video.mp4")?.byteSize).toBe(100);
    expect(byTitle.get("Primary Cut")?.byteSize).toBe(200);
    expect(byTitle.get("notes.txt")?.byteSize).toBe(64);
    for (const artifact of all.artifacts) {
      expect(artifact.createdAt).toEqual(expect.any(String));
    }

    const issueOnly = await companyArtifactsService(db, storage).list(companyId, { issueId, limit: 10 });
    expect(issueOnly.artifacts.map((artifact) => artifact.title)).toEqual([
      "direct-video.mp4",
      "Primary Cut",
      "notes.txt",
    ]);
    expect(issueOnly.nextCursor).toBeNull();
  });

  it("sorts by name ascending and pages with a sort cursor", async () => {
    const { companyId } = await seedArtifacts();
    const storage = createStorageService({ "notes.txt": Buffer.from("Searchable notes preview") });

    const firstPage = await companyArtifactsService(db, storage).list(companyId, {
      sort: "name",
      dir: "asc",
      limit: 2,
    });
    expect(firstPage.artifacts.map((artifact) => artifact.title)).toEqual(["direct-video.mp4", "notes.txt"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = await companyArtifactsService(db, storage).list(companyId, {
      sort: "name",
      dir: "asc",
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.artifacts.map((artifact) => artifact.title)).toEqual(["Primary Cut", "Review Notes"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("groups artifacts by agent", async () => {
    const { companyId } = await seedArtifacts();
    const storage = createStorageService({ "notes.txt": Buffer.from("Searchable notes preview") });

    const grouped = await companyArtifactsService(db, storage).list(companyId, {
      groupBy: "agent",
      limit: 10,
    });
    expect(grouped.artifacts).toEqual([]);
    expect(grouped.groups?.map((group) => ({
      key: group.key,
      label: group.label,
      count: group.count,
      mediaKinds: group.mediaKinds,
    }))).toEqual([
      { key: "33333333-3333-4333-8333-333333333333", label: "Coder", count: 4, mediaKinds: ["document", "video", "text"] },
    ]);
  });

  it("returns folder tree root, project, and issue nodes with aggregated counts", async () => {
    const { companyId, projectId, issueId, secondIssueId } = await seedArtifacts();
    const storage = createStorageService();
    const service = companyArtifactsService(db, storage);

    const root = await service.tree(companyId, { node: "root" });
    expect(root.node).toMatchObject({ id: "root", kind: "root", count: 4, hasChildren: true });
    expect(root.children.map((child) => [child.id, child.kind, child.count])).toEqual([
      ["projects", "projects", 3],
      ["no_project", "no_project", 1],
    ]);

    const projects = await service.tree(companyId, { node: "projects" });
    expect(projects.children.map((child) => [child.id, child.label, child.count])).toEqual([
      [`project:${projectId}`, "Artifacts", 3],
    ]);

    const project = await service.tree(companyId, { node: `project:${projectId}` });
    expect(project.node).toMatchObject({ id: `project:${projectId}`, kind: "project", count: 3 });
    expect(project.children).toHaveLength(1);
    expect(project.children[0]).toMatchObject({
      id: `issue:${issueId}`,
      kind: "issue",
      label: "PAP-1 · Make the reel",
      issueIdentifier: "PAP-1",
      count: 3,
      totalByteSize: 364,
      mediaKinds: ["video", "text"],
      hasChildren: false,
    });

    const noProject = await service.tree(companyId, { node: "no_project" });
    expect(noProject.children.map((child) => [child.id, child.label, child.count])).toEqual([
      [`issue:${secondIssueId}`, "PAP-2 · Write the plan", 1],
    ]);

    const issue = await service.tree(companyId, { node: `issue:${issueId}` });
    expect(issue.node).toMatchObject({ id: `issue:${issueId}`, kind: "issue", count: 3, hasChildren: false });
    expect(issue.children).toEqual([]);
  });
  it("archives one task's artifacts as <identifier>/<filename> and documents as <identifier>/<key>.md", async () => {
    const { companyId, issueId, secondIssueId } = await seedArtifacts();
    const storage = createStorageService({ "notes.txt": Buffer.from("Text file preview from an agent output.") });
    const service = companyArtifactsService(db, storage);

    const task = await service.archiveEntries(companyId, `issue:${issueId}`);
    const taskPaths = task.entries.map((entry) => entry.path).sort();
    expect(taskPaths).toEqual(expect.arrayContaining(["PAP-1/direct-video.mp4", "PAP-1/notes.txt"]));
    expect(taskPaths.every((path) => path.startsWith("PAP-1/"))).toBe(true);
    // The work product's attachment is listed once, under its filename (dedupe against the attachment row).
    expect(new Set(taskPaths).size).toBe(taskPaths.length);

    const review = await service.archiveEntries(companyId, `issue:${secondIssueId}`);
    expect(review.entries).toEqual([
      expect.objectContaining({ path: "PAP-2/review.md", text: "# Review\n\nAgent-created review document with useful details." }),
    ]);
    expect(review.totalByteSize).toBe(Buffer.byteLength("# Review\n\nAgent-created review document with useful details.", "utf8"));
  });

  it("rejects malformed nodes and empty nodes with 400 and 422 from the service", async () => {
    const { companyId } = await seedArtifacts();
    const service = companyArtifactsService(db, createStorageService());
    await expect(service.archiveEntries(companyId, "root")).rejects.toMatchObject({ status: 400 });
    await expect(service.archiveEntries(companyId, `project:${"12345678-1234-4234-8234-123456789012"}`)).rejects.toMatchObject({ status: 422 });
  });

  it("GET /artifacts/archive streams a zip for board users, logs it, and returns 404 across companies", async () => {
    const { companyId, otherCompanyId, issueId } = await seedArtifacts();
    const app = express();
    app.use((req, _res, next) => {
      req.actor = {
        type: "board",
        userId: "user-1",
        source: "session",
        companyIds: [companyId],
        memberships: [{ companyId, membershipRole: "viewer", status: "active" }],
      } as any;
      next();
    });
    app.use("/api/companies", companyRoutes(db, createStorageService({ "notes.txt": Buffer.from("n") })));
    app.use(errorHandler);

    const res = await request(app)
      .get(`/api/companies/${companyId}/artifacts/archive?node=issue:${issueId}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
    expect((res.body as Buffer).subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect((res.body as Buffer).toString("latin1")).toContain("PAP-1/notes.txt");

    const logged = await db.select().from(activityLog).where(eq(activityLog.action, "artifact.archive_downloaded"));
    expect(logged.some((row) => row.companyId === companyId && row.entityId === issueId)).toBe(true);

    const foreign = await request(app).get(`/api/companies/${otherCompanyId}/artifacts/archive?node=issue:${issueId}`);
    expect(foreign.status).toBe(404);
    const malformed = await request(app).get(`/api/companies/${companyId}/artifacts/archive?node=bogus`);
    expect(malformed.status).toBe(400);
  });
});

describe("company artifacts route authorization", () => {
  it("rejects agent access across company boundaries before reading artifacts", async () => {
    const app = express();
    app.use((_req, _res, next) => {
      (_req as any).actor = {
        type: "agent",
        agentId: "agent-1",
        companyId: "company-allowed",
      };
      next();
    });
    app.use("/api/companies", companyRoutes({} as any, createStorageService()));
    app.use(errorHandler);

    const res = await request(app).get("/api/companies/company-denied/artifacts");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Agent key cannot access another company");
  });
});
