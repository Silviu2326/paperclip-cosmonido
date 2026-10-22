import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agents, companies, createDb, deliverableReviews, documentRevisions, documents, goals, issueComments, issueDocuments, issueWorkProducts, issues } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { assignmentService } from "../services/assignments.js";
import { deliverableReviewService } from "../services/deliverable-reviews.js";
import { issueService } from "../services/issues.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;
describePg("assignment and deliverable review services", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { tempDb = await startEmbeddedPostgresTestDatabase("paperclip-assignments-"); db = createDb(tempDb.connectionString); }, 90_000);
  // Each case uses fresh companies and UUIDs; the disposable cluster is removed in afterAll.
  afterAll(async () => { await tempDb?.cleanup(); });

  async function company(name: string) { return (await db.insert(companies).values({ name, issuePrefix: `AS${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!; }
  async function agent(companyId: string, name: string) { return (await db.insert(agents).values({ companyId, name, role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }).returning())[0]!; }
  async function createAssignment(companyId: string, assigneeAgentId: string, idempotencyKey: string) {
    return assignmentService(db).create(companyId, { title: "Create result", acceptanceCriteria: "Meets acceptance", expectedDeliverable: "Artifact", budgetCents: 5000, assigneeAgentId, idempotencyKey }, { userId: "board-user" });
  }

  it("creates one goal and root task for repeated idempotency keys", async () => {
    const c = await company("Assignments"); const a = await agent(c.id, "Worker"); const key = randomUUID();
    const [first, again] = await Promise.all([createAssignment(c.id, a.id, key), createAssignment(c.id, a.id, key)]);
    expect(again.id).toBe(first.id); expect(again.rootIssueId).toBe(first.rootIssueId);
    expect(await db.select().from(goals).where(and(eq(goals.companyId, c.id), eq(goals.kind, "assignment")))).toHaveLength(1);
  });

  it("rejects a cross-company assignee without creating a goal", async () => {
    const own = await company("Own"); const other = await company("Other"); const foreign = await agent(other.id, "Foreign");
    await expect(createAssignment(own.id, foreign.id, randomUUID())).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(goals).where(eq(goals.companyId, own.id))).toHaveLength(0);
  });

  it("deduplicates review submission and leaves stale versions pending on resolve conflict", async () => {
    const c = await company("Review"); const a = await agent(c.id, "Worker"); const assignment = await createAssignment(c.id, a.id, randomUUID());
    const product = (await db.insert(issueWorkProducts).values({ companyId: c.id, issueId: assignment.rootIssueId!, type: "artifact", provider: "paperclip", title: "Deliverable", status: "ready_for_review" }).returning())[0]!;
    const reviewInput = { goalId: assignment.id, issueId: assignment.rootIssueId, targetKind: "work_product", targetId: product.id, targetVersion: product.updatedAt.toISOString(), summary: "Ready" };
    const reviews = deliverableReviewService(db); const [first, second] = await Promise.all([reviews.submit(c.id, reviewInput, { agentId: a.id }), reviews.submit(c.id, reviewInput, { agentId: a.id })]);
    expect(second.id).toBe(first.id);
    await expect(reviews.resolve(first.id, { state: "accepted" }, { agentId: a.id })).rejects.toMatchObject({ status: 403 });
    await db.update(issueWorkProducts).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(issueWorkProducts.id, product.id));
    await expect(reviews.resolve(first.id, { state: "accepted" }, { userId: "board-user" })).rejects.toMatchObject({ status: 409 });
    const [stillPending] = await db.select().from(deliverableReviews).where(eq(deliverableReviews.id, first.id)); expect(stillPending.state).toBe("pending");
  });

  it("reopens a completed task and records the requested changes comment", async () => {
    const c = await company("Reopen"); const a = await agent(c.id, "Worker"); const assignment = await createAssignment(c.id, a.id, randomUUID());
    const [product] = await db.insert(issueWorkProducts).values({ companyId: c.id, issueId: assignment.rootIssueId!, type: "artifact", provider: "paperclip", title: "Deliverable", status: "ready_for_review" }).returning();
    const review = await deliverableReviewService(db).submit(c.id, { goalId: assignment.id, issueId: assignment.rootIssueId, targetKind: "work_product", targetId: product.id, targetVersion: product.updatedAt.toISOString(), summary: "Ready" }, { agentId: a.id });
    await db.update(issues).set({ status: "done" }).where(eq(issues.id, assignment.rootIssueId!));
    await deliverableReviewService(db).resolve(review.id, { state: "changes_requested", reason: "Add a source citation" }, { userId: "board-user" });
    const [task] = await db.select().from(issues).where(eq(issues.id, assignment.rootIssueId!));
    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, assignment.rootIssueId!));
    expect(task.status).toBe("todo");
    expect(comments.some((comment) => comment.body.includes("Add a source citation"))).toBe(true);
  });

  it("accepts only the reviewed work product version", async () => {
    const c = await company("Versions"); const a = await agent(c.id, "Worker"); const assignment = await createAssignment(c.id, a.id, randomUUID());
    const [product] = await db.insert(issueWorkProducts).values({ companyId: c.id, issueId: assignment.rootIssueId!, type: "artifact", provider: "paperclip", title: "Reviewed", status: "ready_for_review" }).returning();
    const service = deliverableReviewService(db);
    const olderVersionReview = await service.submit(c.id, { goalId: assignment.id, issueId: assignment.rootIssueId, targetKind: "work_product", targetId: product.id, targetVersion: product.updatedAt.toISOString(), summary: "Older version" }, { agentId: a.id });
    await db.update(issueWorkProducts).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(issueWorkProducts.id, product.id));
    const [currentProduct] = await db.select().from(issueWorkProducts).where(eq(issueWorkProducts.id, product.id));
    const acceptedReview = await service.submit(c.id, { goalId: assignment.id, issueId: assignment.rootIssueId, targetKind: "work_product", targetId: product.id, targetVersion: currentProduct.updatedAt.toISOString(), summary: "Current version" }, { agentId: a.id });
    await service.resolve(acceptedReview.id, { state: "accepted" }, { userId: "board-user" });
    const [reviewedAfter] = await db.select().from(issueWorkProducts).where(eq(issueWorkProducts.id, product.id));
    const [olderReviewAfter] = await db.select().from(deliverableReviews).where(eq(deliverableReviews.id, olderVersionReview.id));
    expect(reviewedAfter.reviewState).toBe("approved");
    expect(olderReviewAfter.state).toBe("pending");
  });

  it("finishes an in-review root after every latest assignment deliverable is accepted", async () => {
    const c = await company("Accepted"); const a = await agent(c.id, "Worker"); const assignment = await createAssignment(c.id, a.id, randomUUID());
    const [product] = await db.insert(issueWorkProducts).values({ companyId: c.id, issueId: assignment.rootIssueId!, type: "artifact", provider: "paperclip", title: "Final deliverable", status: "ready_for_review" }).returning();
    const review = await deliverableReviewService(db).submit(c.id, { goalId: assignment.id, issueId: assignment.rootIssueId, targetKind: "work_product", targetId: product.id, targetVersion: product.updatedAt.toISOString(), summary: "Ready" }, { agentId: a.id });
    await db.update(issues).set({ status: "in_review" }).where(eq(issues.id, assignment.rootIssueId!));
    await deliverableReviewService(db).resolve(review.id, { state: "accepted" }, { userId: "board-user" });
    const [rootIssue] = await db.select().from(issues).where(eq(issues.id, assignment.rootIssueId!));
    const accepted = await assignmentService(db).getById(assignment.id);
    expect(rootIssue.status).toBe("done");
    expect(accepted?.assignmentStatus).toBe("accepted");
  });

  it("finishes an in-review root when its accepted deliverable belongs to a child task", async () => {
    const c = await company("Child acceptance"); const a = await agent(c.id, "Worker"); const assignment = await createAssignment(c.id, a.id, randomUUID());
    const child = await issueService(db).create(c.id, { title: "Produce deliverable", status: "todo", parentId: assignment.rootIssueId!, idempotencyKey: randomUUID() });
    const [product] = await db.insert(issueWorkProducts).values({ companyId: c.id, issueId: child.id, type: "artifact", provider: "paperclip", title: "Child deliverable", status: "ready_for_review" }).returning();
    const review = await deliverableReviewService(db).submit(c.id, { goalId: assignment.id, issueId: child.id, targetKind: "work_product", targetId: product.id, targetVersion: product.updatedAt.toISOString(), summary: "Ready" }, { agentId: a.id });
    await db.update(issues).set({ status: "in_review" }).where(eq(issues.id, assignment.rootIssueId!));
    await deliverableReviewService(db).resolve(review.id, { state: "accepted" }, { userId: "board-user" });
    const [rootIssue] = await db.select().from(issues).where(eq(issues.id, assignment.rootIssueId!));
    const accepted = await assignmentService(db).getById(assignment.id);
    expect(rootIssue.status).toBe("done");
    expect(accepted?.assignmentStatus).toBe("accepted");
  });

  it("allows a run reviewer to submit a document authored by another agent only when linked to its current task", async () => {
    const c = await company("Documents"); const reviewer = await agent(c.id, "Reviewer"); const author = await agent(c.id, "Author");
    const assignment = await createAssignment(c.id, reviewer.id, randomUUID());
    const otherAssignment = await createAssignment(c.id, author.id, randomUUID());
    const [linkedDocument] = await db.insert(documents).values({ companyId: c.id, title: "Task document", latestBody: "Content", createdByAgentId: author.id }).returning();
    const [linkedRevision] = await db.insert(documentRevisions).values({ companyId: c.id, documentId: linkedDocument.id, revisionNumber: 1, body: "Content", createdByAgentId: author.id }).returning();
    await db.insert(issueDocuments).values({ companyId: c.id, issueId: assignment.rootIssueId!, documentId: linkedDocument.id, key: "deliverable" });
    const service = deliverableReviewService(db);
    const accepted = await service.submit(c.id, { goalId: assignment.id, issueId: assignment.rootIssueId, targetKind: "document_revision", targetId: linkedRevision.id, targetVersion: "1", summary: "Ready" }, { agentId: reviewer.id, runId: "current-task-run" });
    expect(accepted.state).toBe("pending");

    const [otherDocument] = await db.insert(documents).values({ companyId: c.id, title: "Other task document", latestBody: "Content", createdByAgentId: author.id }).returning();
    const [otherRevision] = await db.insert(documentRevisions).values({ companyId: c.id, documentId: otherDocument.id, revisionNumber: 1, body: "Content", createdByAgentId: author.id }).returning();
    await db.insert(issueDocuments).values({ companyId: c.id, issueId: otherAssignment.rootIssueId!, documentId: otherDocument.id, key: "deliverable" });
    await expect(service.submit(c.id, { goalId: assignment.id, issueId: assignment.rootIssueId, targetKind: "document_revision", targetId: otherRevision.id, targetVersion: "1", summary: "Wrong task" }, { agentId: reviewer.id, runId: "current-task-run" })).rejects.toMatchObject({ status: 404 });
  });
});
