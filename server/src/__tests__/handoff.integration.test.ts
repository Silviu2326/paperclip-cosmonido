import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agents, companies, createDb, goals, issueDocuments, issues, projects, proposals } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { handoffService } from "../services/handoff.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;

describePg("sale to delivery handoff", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-handoff-");
    db = createDb(tempDb.connectionString);
  }, 90_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  const actor = { userId: "board-user" };

  async function company(name: string) {
    return (await db.insert(companies).values({ name, issuePrefix: `HO${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!;
  }
  async function agent(companyId: string, name: string) {
    return (await db.insert(agents).values({ companyId, name, role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }).returning())[0]!;
  }
  async function acceptedProposal(companyId: string, status = "accepted") {
    return (await db.insert(proposals).values({
      companyId,
      proposalKey: randomUUID(),
      title: "Rediseño de web",
      scope: [{ title: "Diseño", description: "Tres pantallas" }, { title: "Implementación" }],
      terms: "50% al inicio",
      priceCents: 120_000,
      currency: "EUR",
      status,
    }).returning())[0]!;
  }
  async function counts(companyId: string) {
    const [projectRows, goalRows] = await Promise.all([
      db.select().from(projects).where(eq(projects.companyId, companyId)),
      db.select().from(goals).where(and(eq(goals.companyId, companyId), eq(goals.kind, "assignment"))),
    ]);
    return { projects: projectRows.length, assignments: goalRows.length };
  }

  it("creates one project and one assignment for two concurrent handoffs of the same proposal", async () => {
    const c = await company("Handoff concurrente");
    const a = await agent(c.id, "Entrega");
    const p = await acceptedProposal(c.id);
    const input = { proposalId: p.id, assigneeAgentId: a.id, summaryMarkdown: "El cliente quiere entrega en dos semanas." };
    const service = handoffService(db);

    const [first, second] = await Promise.all([
      service.fromProposal(c.id, input, actor),
      service.fromProposal(c.id, input, actor),
    ]);
    expect(first.status).toBe("complete");
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("complete");
    expect(first.stepsDone).toEqual(["project", "assignment", "team", "brief", "summary"]);
    expect(await counts(c.id)).toEqual({ projects: 1, assignments: 1 });

    const again = await service.fromProposal(c.id, input, actor);
    expect(again.id).toBe(first.id);
    expect(await counts(c.id)).toEqual({ projects: 1, assignments: 1 });
  });

  it("records a partial receipt when the brief step fails and completes it on retry without duplicates", async () => {
    const c = await company("Handoff parcial");
    const a = await agent(c.id, "Entrega");
    const p = await acceptedProposal(c.id);
    const input = { proposalId: p.id, assigneeAgentId: a.id, summaryMarkdown: null };

    const failing = handoffService(db, {
      steps: { brief: async () => { throw new Error("brief service unavailable"); } },
    });
    const partial = await failing.fromProposal(c.id, input, actor);
    expect(partial.status).toBe("partial");
    expect(partial.stepsDone).toEqual(["project", "assignment", "team"]);
    expect(partial.error).toContain("brief service unavailable");
    expect(partial.projectId).toBeTruthy();
    expect(partial.assignmentGoalId).toBeTruthy();
    expect(await counts(c.id)).toEqual({ projects: 1, assignments: 1 });

    const complete = await handoffService(db).retry(partial.id, actor);
    expect(complete.id).toBe(partial.id);
    expect(complete.status).toBe("complete");
    expect(complete.error).toBeNull();
    expect(complete.stepsDone).toEqual(["project", "assignment", "team", "brief", "summary"]);
    expect(await counts(c.id)).toEqual({ projects: 1, assignments: 1 });

    const [goal] = await db.select().from(goals).where(eq(goals.id, complete.assignmentGoalId!));
    const [brief] = await db
      .select()
      .from(issueDocuments)
      .where(and(eq(issueDocuments.issueId, goal.rootIssueId!), eq(issueDocuments.key, "brief")));
    expect(brief).toBeTruthy();
    const [rootIssue] = await db.select().from(issues).where(eq(issues.id, goal.rootIssueId!));
    expect(rootIssue.projectId).toBe(complete.projectId);
  });

  it("rejects handoff of a proposal that is not accepted and of a proposal from another company", async () => {
    const own = await company("Handoff estado");
    const other = await company("Handoff ajeno");
    const a = await agent(own.id, "Entrega");
    const draft = await acceptedProposal(own.id, "sent");
    const service = handoffService(db);

    await expect(service.fromProposal(own.id, { proposalId: draft.id, assigneeAgentId: a.id, summaryMarkdown: null }, actor))
      .rejects.toMatchObject({ status: 409 });

    const accepted = await acceptedProposal(other.id);
    await expect(service.fromProposal(own.id, { proposalId: accepted.id, assigneeAgentId: a.id, summaryMarkdown: null }, actor))
      .rejects.toMatchObject({ status: 404 });
    expect(await counts(own.id)).toEqual({ projects: 0, assignments: 0 });
  });

  it("uses the first available agent when no assignee is given and fails with 422 when the company has none", async () => {
    const empty = await company("Handoff sin agentes");
    const p = await acceptedProposal(empty.id);
    await expect(handoffService(db).fromProposal(empty.id, { proposalId: p.id, summaryMarkdown: null }, actor))
      .rejects.toMatchObject({ status: 422 });

    const staffed = await company("Handoff con agente");
    const worker = await agent(staffed.id, "Primero");
    const p2 = await acceptedProposal(staffed.id);
    const receipt = await handoffService(db).fromProposal(staffed.id, { proposalId: p2.id, summaryMarkdown: null }, actor);
    expect(receipt.status).toBe("complete");
    const [goal] = await db.select().from(goals).where(eq(goals.id, receipt.assignmentGoalId!));
    expect(goal.assigneeAgentId).toBe(worker.id);
  });
});
