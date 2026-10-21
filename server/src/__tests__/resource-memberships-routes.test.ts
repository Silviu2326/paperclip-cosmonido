import { randomUUID } from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agentMemberships,
  agents,
  artifactMemberships,
  assets,
  companies,
  companyFileMemberships,
  companyFiles,
  createDb,
  documentMemberships,
  documents,
  issueAttachments,
  issueWorkProducts,
  issues,
  projectMemberships,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { resourceMembershipRoutes } from "../routes/resource-memberships.js";
import { errorHandler } from "../middleware/index.js";
import { resourceMembershipService } from "../services/resource-memberships.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres resource membership tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

function boardActor(companyId: string, role: "admin" | "operator" | "viewer" = "viewer") {
  return {
    type: "board" as const,
    userId: "user-1",
    source: "session" as const,
    isInstanceAdmin: false,
    companyIds: [companyId],
    memberships: [{ companyId, membershipRole: role, status: "active" }],
  };
}

function createApp(db: ReturnType<typeof createDb>, actor: Express.Request["actor"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", resourceMembershipRoutes(db));
  app.use(errorHandler);
  return app;
}

describeEmbeddedPostgres("resource membership routes", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-resource-memberships-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(artifactMemberships);
    await db.delete(companyFileMemberships);
    await db.delete(issueWorkProducts);
    await db.delete(issueAttachments);
    await db.delete(assets);
    await db.delete(companyFiles);
    await db.delete(issues);
    await db.delete(documentMemberships);
    await db.delete(projectMemberships);
    await db.delete(agentMemberships);
    await db.delete(documents);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seed() {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const archivedProjectId = randomUUID();
    const agentId = randomUUID();
    const otherAgentId = randomUUID();
    const terminatedAgentId = randomUUID();
    const documentId = randomUUID();
    const otherDocumentId = randomUUID();
    await db.insert(companies).values([
      {
        id: companyId,
        name: "Paperclip",
        issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        requireBoardApprovalForNewAgents: false,
      },
      {
        id: otherCompanyId,
        name: "Other",
        issuePrefix: `T${otherCompanyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        requireBoardApprovalForNewAgents: false,
      },
    ]);
    await db.insert(documents).values([
      { id: documentId, companyId, title: "Plan", latestBody: "Plan body", createdByUserId: "user-1" },
      { id: otherDocumentId, companyId: otherCompanyId, title: "Other", latestBody: "Other body" },
    ]);
    await db.insert(projects).values([
      { id: projectId, companyId, name: "Growth", status: "in_progress" },
      { id: archivedProjectId, companyId, name: "Archived", status: "completed", archivedAt: new Date() },
      { id: otherProjectId, companyId: otherCompanyId, name: "Other", status: "in_progress" },
    ]);
    await db.insert(agents).values([
      {
        id: agentId,
        companyId,
        name: "CodexCoder",
        role: "engineer",
        status: "active",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
      {
        id: otherAgentId,
        companyId: otherCompanyId,
        name: "OtherAgent",
        role: "engineer",
        status: "active",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
      {
        id: terminatedAgentId,
        companyId,
        name: "Terminated",
        role: "engineer",
        status: "terminated",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
    ]);
    return {
      archivedProjectId,
      companyId,
      documentId,
      otherAgentId,
      otherCompanyId,
      otherDocumentId,
      otherProjectId,
      projectId,
      agentId,
      terminatedAgentId,
    };
  }

  it("defaults missing membership rows to joined", async () => {
    const { companyId } = await seed();
    const app = createApp(db, boardActor(companyId));

    const res = await request(app).get(`/api/companies/${companyId}/resource-memberships/me`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      projectMemberships: {},
      agentMemberships: {},
      starredProjectIds: [],
      starredAgentIds: [],
      starredDocumentIds: [],
      projectStarredAt: {},
      agentStarredAt: {},
      documentStarredAt: {},
      starredCompanyFileIds: [],
      companyFileStarredAt: {},
      starredArtifactRefs: [],
      artifactStarredAt: {},
      updatedAt: null,
    });
  });

  it("allows viewer self-service mutations, logs changes, and keeps repeats idempotent", async () => {
    const { companyId, projectId } = await seed();
    const app = createApp(db, boardActor(companyId, "viewer"));

    const first = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/projects/${projectId}`)
      .send({ state: "left" });
    const second = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/projects/${projectId}`)
      .send({ state: "left" });

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ resourceType: "project", resourceId: projectId, state: "left", starredAt: null });
    expect(second.status).toBe(200);

    const rows = await db.select().from(projectMemberships);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyId, projectId, userId: "user-1", state: "left" });

    const activity = await db.select().from(activityLog);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      companyId,
      actorType: "user",
      actorId: "user-1",
      action: "resource_membership.left",
      entityType: "project",
      entityId: projectId,
    });
  });

  it("stars projects idempotently and exposes starred project contract data", async () => {
    const { companyId, projectId } = await seed();
    const app = createApp(db, boardActor(companyId, "viewer"));

    const first = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/projects/${projectId}`)
      .send({ starred: true });
    const second = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/projects/${projectId}`)
      .send({ starred: true });
    const list = await request(app).get(`/api/companies/${companyId}/resource-memberships/me`);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ resourceType: "project", resourceId: projectId, state: "joined" });
    expect(first.body.starredAt).toEqual(expect.any(String));
    expect(second.status).toBe(200);
    expect(second.body.starredAt).toBe(first.body.starredAt);
    expect(list.body.starredProjectIds).toEqual([projectId]);
    expect(list.body.projectStarredAt[projectId]).toEqual(first.body.starredAt);

    const rows = await db.select().from(projectMemberships);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyId, projectId, userId: "user-1", state: "joined" });
    expect(rows[0]?.starredAt).toBeInstanceOf(Date);

    const activity = await db.select().from(activityLog);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      action: "resource_membership.starred",
      entityType: "project",
      entityId: projectId,
    });
    expect(activity[0]?.details).toMatchObject({
      userId: "user-1",
      resourceType: "project",
      resourceId: projectId,
      state: "joined",
      starred: true,
    });
  });

  it("clears starred_at when leaving a starred resource", async () => {
    const { companyId, projectId } = await seed();
    const app = createApp(db, boardActor(companyId));

    await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/projects/${projectId}`)
      .send({ starred: true })
      .expect(200);
    const leave = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/projects/${projectId}`)
      .send({ state: "left" });

    expect(leave.status).toBe(200);
    expect(leave.body).toMatchObject({ state: "left", starredAt: null });
    const [row] = await db.select().from(projectMemberships);
    expect(row).toMatchObject({ state: "left", starredAt: null });

    const activity = await db.select().from(activityLog);
    expect(activity.map((entry) => entry.action)).toEqual([
      "resource_membership.starred",
      "resource_membership.left",
    ]);
    expect(activity[1]?.details).toMatchObject({ state: "left", starred: false, starredAt: null });
  });

  it("starring a left resource rejoins it", async () => {
    const { companyId, agentId } = await seed();
    const app = createApp(db, boardActor(companyId));

    await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/agents/${agentId}`)
      .send({ state: "left" })
      .expect(200);
    const star = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/agents/${agentId}`)
      .send({ starred: true });

    expect(star.status).toBe(200);
    expect(star.body).toMatchObject({ resourceType: "agent", resourceId: agentId, state: "joined" });
    expect(star.body.starredAt).toEqual(expect.any(String));

    const [row] = await db.select().from(agentMemberships);
    expect(row).toMatchObject({ state: "joined" });
    expect(row?.starredAt).toBeInstanceOf(Date);

    const activity = await db.select().from(activityLog);
    expect(activity.map((entry) => entry.action)).toEqual([
      "resource_membership.left",
      "resource_membership.starred",
    ]);
  });

  it("unstars agents idempotently without requiring a state change", async () => {
    const { companyId, agentId } = await seed();
    const app = createApp(db, boardActor(companyId));

    await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/agents/${agentId}`)
      .send({ starred: true })
      .expect(200);
    const first = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/agents/${agentId}`)
      .send({ starred: false });
    const second = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/agents/${agentId}`)
      .send({ starred: false });

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ state: "joined", starredAt: null });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ state: "joined", starredAt: null });

    const [row] = await db.select().from(agentMemberships);
    expect(row).toMatchObject({ state: "joined", starredAt: null });

    const activity = await db.select().from(activityLog);
    expect(activity.map((entry) => entry.action)).toEqual([
      "resource_membership.starred",
      "resource_membership.unstarred",
    ]);
  });

  it("omits archived projects and terminated agents from starred sidebar data", async () => {
    const { archivedProjectId, companyId, terminatedAgentId } = await seed();
    const starredAt = new Date();
    await db.insert(projectMemberships).values({
      companyId,
      projectId: archivedProjectId,
      userId: "user-1",
      state: "joined",
      starredAt,
    });
    await db.insert(agentMemberships).values({
      companyId,
      agentId: terminatedAgentId,
      userId: "user-1",
      state: "joined",
      starredAt,
    });
    const app = createApp(db, boardActor(companyId));

    const res = await request(app).get(`/api/companies/${companyId}/resource-memberships/me`);

    expect(res.status).toBe(200);
    expect(res.body.projectMemberships[archivedProjectId]).toBe("joined");
    expect(res.body.agentMemberships[terminatedAgentId]).toBe("joined");
    expect(res.body.starredProjectIds).toEqual([]);
    expect(res.body.starredAgentIds).toEqual([]);
    expect(res.body.projectStarredAt).toEqual({});
    expect(res.body.agentStarredAt).toEqual({});
  });

  it("rejects starring archived projects and terminated agents", async () => {
    const { archivedProjectId, companyId, terminatedAgentId } = await seed();
    const app = createApp(db, boardActor(companyId));

    const projectRes = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/projects/${archivedProjectId}`)
      .send({ starred: true });
    const agentRes = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/agents/${terminatedAgentId}`)
      .send({ starred: true });

    expect(projectRes.status).toBe(404);
    expect(agentRes.status).toBe(404);
  });

  it("rejects agent API key actors", async () => {
    const { companyId, agentId } = await seed();
    const app = createApp(db, {
      type: "agent",
      agentId,
      companyId,
      source: "agent_key",
    });

    const res = await request(app).get(`/api/companies/${companyId}/resource-memberships/me`);

    expect(res.status).toBe(403);
  });

  it("rejects cross-company target resources", async () => {
    const { companyId, otherAgentId, otherProjectId } = await seed();
    const app = createApp(db, boardActor(companyId));

    const projectRes = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/projects/${otherProjectId}`)
      .send({ state: "left" });
    const agentRes = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/agents/${otherAgentId}`)
      .send({ state: "left" });

    expect(projectRes.status).toBe(404);
    expect(agentRes.status).toBe(404);
    await expect(db.select().from(projectMemberships)).resolves.toHaveLength(0);
    await expect(db.select().from(agentMemberships)).resolves.toHaveLength(0);
  });

  it("denies direct service calls that try to mutate another user's membership", async () => {
    const { companyId, projectId } = await seed();
    const svc = resourceMembershipService(db);

    await expect(
      svc.updateProject({
        companyId,
        projectId,
        userId: "other-user",
        state: "left",
        actor: boardActor(companyId),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("stars and unstars documents idempotently and cascades on document deletion", async () => {
    const { companyId, documentId } = await seed();
    const app = createApp(db, boardActor(companyId));

    const [first, second] = await Promise.all([
      request(app)
        .put(`/api/companies/${companyId}/resource-memberships/me/documents/${documentId}`)
        .send({ starred: true }),
      request(app)
        .put(`/api/companies/${companyId}/resource-memberships/me/documents/${documentId}`)
        .send({ starred: true }),
    ]);
    const list = await request(app).get(`/api/companies/${companyId}/resource-memberships/me`);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ resourceType: "document", resourceId: documentId, starredAt: expect.any(String) });
    expect(second.status).toBe(200);
    expect(second.body.starredAt).toBe(first.body.starredAt);
    expect(list.body.starredDocumentIds).toEqual([documentId]);
    expect(list.body.documentStarredAt[documentId]).toBe(first.body.starredAt);
    await expect(db.select().from(documentMemberships)).resolves.toHaveLength(1);

    const unstars = await Promise.all([
      request(app)
        .put(`/api/companies/${companyId}/resource-memberships/me/documents/${documentId}`)
        .send({ starred: false }),
      request(app)
        .put(`/api/companies/${companyId}/resource-memberships/me/documents/${documentId}`)
        .send({ starred: false }),
    ]);
    expect(unstars.map((response) => response.status)).toEqual([200, 200]);
    await expect(db.select().from(documentMemberships)).resolves.toHaveLength(0);

    await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/documents/${documentId}`)
      .send({ starred: true })
      .expect(200);
    await db.delete(documents).where(eq(documents.id, documentId));
    await expect(db.select().from(documentMemberships)).resolves.toHaveLength(0);

    const activity = await db.select().from(activityLog);
    expect(activity.map((entry) => entry.action)).toEqual([
      "resource_membership.starred",
      "resource_membership.unstarred",
      "resource_membership.starred",
    ]);
    expect(activity[0]).toMatchObject({ entityType: "document", entityId: documentId });
  });

  it("returns identical 404s for cross-company documents", async () => {
    const { companyId, otherDocumentId } = await seed();
    const app = createApp(db, boardActor(companyId));

    const response = await request(app)
      .put(`/api/companies/${companyId}/resource-memberships/me/documents/${otherDocumentId}`)
      .send({ starred: true });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Document not found");
    await expect(db.select().from(documentMemberships)).resolves.toHaveLength(0);
  });

  it("stars company files idempotently, lists them, and rejects foreign or malformed targets", async () => {
    const { companyId, otherCompanyId } = await seed();
    const fileId = randomUUID();
    const foreignFileId = randomUUID();
    await db.insert(companyFiles).values([
      { id: fileId, companyId, name: "guia.pdf", slug: "guia-pdf", contentType: "application/pdf", byteSize: 3 },
      { id: foreignFileId, companyId: otherCompanyId, name: "ajena.pdf", slug: "ajena-pdf", contentType: "application/pdf", byteSize: 3 },
    ]);
    const app = createApp(db, boardActor(companyId));
    const url = `/api/companies/${companyId}/resource-memberships/me/company-files`;

    const [first, second] = await Promise.all([
      request(app).put(`${url}/${fileId}`).send({ starred: true }),
      request(app).put(`${url}/${fileId}`).send({ starred: true }),
    ]);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ resourceType: "company_file", resourceId: fileId, state: "joined", starredAt: expect.any(String) });
    expect(second.status).toBe(200);
    expect(second.body.starredAt).toBe(first.body.starredAt);

    const list = await request(app).get(`/api/companies/${companyId}/resource-memberships/me`);
    expect(list.body.starredCompanyFileIds).toEqual([fileId]);
    expect(list.body.companyFileStarredAt).toEqual({ [fileId]: first.body.starredAt });
    await expect(db.select().from(companyFileMemberships)).resolves.toHaveLength(1);

    const unstar = await request(app).put(`${url}/${fileId}`).send({ starred: false });
    expect(unstar.status).toBe(200);
    expect(unstar.body.starredAt).toBeNull();
    const after = await request(app).get(`/api/companies/${companyId}/resource-memberships/me`);
    expect(after.body.starredCompanyFileIds).toEqual([]);

    const foreign = await request(app).put(`${url}/${foreignFileId}`).send({ starred: true });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toBe("File not found");
    const malformed = await request(app).put(`${url}/not-a-uuid`).send({ starred: true });
    expect(malformed.status).toBe(404);
    const extraKey = await request(app).put(`${url}/${fileId}`).send({ starred: true, state: "left" });
    expect(extraKey.status).toBe(400);
    await expect(db.select().from(companyFileMemberships)).resolves.toHaveLength(0);

    const activity = await db.select().from(activityLog).where(eq(activityLog.entityType, "company_file"));
    expect(activity.map((entry) => entry.action)).toEqual([
      "resource_membership.starred",
      "resource_membership.unstarred",
    ]);
  });

  it("stars Salida attachments and work products by artifact ref and rejects foreign or unknown artifacts", async () => {
    const { companyId, otherCompanyId } = await seed();
    const issueId = randomUUID();
    const foreignIssueId = randomUUID();
    await db.insert(issues).values([
      { id: issueId, companyId, title: "Brief", status: "in_progress" },
      { id: foreignIssueId, companyId: otherCompanyId, title: "Ajeno", status: "in_progress" },
    ]);
    const assetId = randomUUID();
    const foreignAssetId = randomUUID();
    await db.insert(assets).values([
      { id: assetId, companyId, provider: "local_disk", objectKey: `${companyId}/nota.txt`, contentType: "text/plain", byteSize: 4, sha256: "a".repeat(64), originalFilename: "nota.txt" },
      { id: foreignAssetId, companyId: otherCompanyId, provider: "local_disk", objectKey: `${otherCompanyId}/ajena.txt`, contentType: "text/plain", byteSize: 4, sha256: "b".repeat(64), originalFilename: "ajena.txt" },
    ]);
    const attachmentId = randomUUID();
    const foreignAttachmentId = randomUUID();
    await db.insert(issueAttachments).values([
      { id: attachmentId, companyId, issueId, assetId },
      { id: foreignAttachmentId, companyId: otherCompanyId, issueId: foreignIssueId, assetId: foreignAssetId },
    ]);
    const workProductId = randomUUID();
    await db.insert(issueWorkProducts).values({
      id: workProductId,
      companyId,
      issueId,
      type: "artifact",
      provider: "paperclip",
      title: "Informe",
      status: "ready_for_review",
    });
    const app = createApp(db, boardActor(companyId));
    const url = `/api/companies/${companyId}/resource-memberships/me/artifacts`;

    const attachment = await request(app).put(`${url}/attachment/${attachmentId}`).send({ starred: true });
    expect(attachment.status).toBe(200);
    expect(attachment.body).toMatchObject({ resourceType: "artifact", resourceId: `attachment:${attachmentId}`, starredAt: expect.any(String) });
    const workProduct = await request(app).put(`${url}/work_product/${workProductId}`).send({ starred: true });
    expect(workProduct.status).toBe(200);
    expect(workProduct.body.resourceId).toBe(`work_product:${workProductId}`);

    const list = await request(app).get(`/api/companies/${companyId}/resource-memberships/me`);
    expect(list.body.starredArtifactRefs).toEqual(expect.arrayContaining([`attachment:${attachmentId}`, `work_product:${workProductId}`]));
    expect(list.body.starredArtifactRefs).toHaveLength(2);
    expect(Object.keys(list.body.artifactStarredAt).sort()).toEqual([`attachment:${attachmentId}`, `work_product:${workProductId}`].sort());

    const foreignAttachment = await request(app).put(`${url}/attachment/${foreignAttachmentId}`).send({ starred: true });
    expect(foreignAttachment.status).toBe(404);
    expect(foreignAttachment.body.error).toBe("Attachment not found");
    const unknownWorkProduct = await request(app).put(`${url}/work_product/${randomUUID()}`).send({ starred: true });
    expect(unknownWorkProduct.status).toBe(404);
    expect(unknownWorkProduct.body.error).toBe("Work product not found");
    const badSource = await request(app).put(`${url}/video/${attachmentId}`).send({ starred: true });
    expect(badSource.status).toBe(400);
    const malformed = await request(app).put(`${url}/attachment/not-a-uuid`).send({ starred: true });
    expect(malformed.status).toBe(404);

    const unstar = await request(app).put(`${url}/attachment/${attachmentId}`).send({ starred: false });
    expect(unstar.status).toBe(200);
    const after = await request(app).get(`/api/companies/${companyId}/resource-memberships/me`);
    expect(after.body.starredArtifactRefs).toEqual([`work_product:${workProductId}`]);
    await expect(db.select().from(artifactMemberships)).resolves.toHaveLength(1);
  });
});
