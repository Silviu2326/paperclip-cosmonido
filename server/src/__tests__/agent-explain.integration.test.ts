import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  autonomyPolicies,
  companies,
  companyFileReads,
  companyFiles,
  createDb,
  heartbeatRunEvents,
  heartbeatRuns,
  issues,
  proposals,
} from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { agentExplainService } from "../services/agent-explain.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;

describePg("agent explain (Por qué hizo esto) read model", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-agent-explain-");
    db = createDb(tempDb.connectionString);
  }, 90_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  async function company(name: string) {
    return (await db.insert(companies).values({ name, issuePrefix: `EX${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!;
  }
  async function agent(companyId: string, name: string) {
    return (await db.insert(agents).values({ companyId, name, role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }).returning())[0]!;
  }

  it("explains a run with context, tool calls and the autonomy level in force", async () => {
    const a = await company("Explain A");
    const worker = await agent(a.id, "Vendedor");
    const issue = (await db.insert(issues).values({ companyId: a.id, title: "Responder a Ana" }).returning())[0]!;
    const runId = randomUUID();
    const startedAt = new Date(Date.now() - 60_000);
    await db.insert(heartbeatRuns).values({
      id: runId, companyId: a.id, agentId: worker.id, issueId: issue.id, status: "succeeded",
      contextSnapshot: { issueId: issue.id }, startedAt, finishedAt: new Date(),
    });
    await db.insert(heartbeatRunEvents).values([
      { companyId: a.id, runId, agentId: worker.id, seq: 1, eventType: "lifecycle", message: "started" },
      { companyId: a.id, runId, agentId: worker.id, seq: 2, eventType: "tool_call", message: "Buscar en CRM", payload: { toolName: "crm_search" } },
    ]);
    const file = (await db.insert(companyFiles).values({ companyId: a.id, name: "Guía de precios", slug: "guia-precios", contentType: "text/markdown", contextRole: "procedure" }).returning())[0]!;
    await db.insert(companyFileReads).values({ companyId: a.id, fileId: file.id, runId, issueId: issue.id, agentId: worker.id });
    await db.insert(autonomyPolicies).values({ companyId: a.id, agentId: worker.id, actionType: "message", level: "send_with_approval", grantedAt: new Date(Date.now() - 86_400_000) });

    const explanation = await agentExplainService(db).explain(a.id, "run", runId);

    expect(explanation.run?.id).toBe(runId);
    expect(explanation.agent?.name).toBe("Vendedor");
    expect(explanation.contextUsed.map((row) => row.name)).toContain("Guía de precios");
    expect(explanation.toolsCalled).toEqual([expect.objectContaining({ name: "crm_search", source: "run_log" })]);
    expect(explanation.gate).toEqual(expect.objectContaining({ applied: false, actionType: "message", levelAtTheTime: "send_with_approval" }));
    expect(explanation.timeline.map((entry) => entry.kind)).toEqual(expect.arrayContaining(["context_read", "tool_call", "autonomy"]));
    const times = explanation.timeline.map((entry) => Date.parse(entry.at));
    expect([...times].sort((x, y) => x - y)).toEqual(times);
    expect(explanation.missing).not.toContain("run");
  });

  it("returns 404 for a run of another company", async () => {
    const own = await company("Explain Own");
    const other = await company("Explain Other");
    const foreignAgent = await agent(other.id, "Foraneo");
    const runId = randomUUID();
    await db.insert(heartbeatRuns).values({ id: runId, companyId: other.id, agentId: foreignAgent.id, status: "succeeded", contextSnapshot: {} });

    await expect(agentExplainService(db).explain(own.id, "run", runId)).rejects.toMatchObject({ status: 404 });
  });

  it("explains a proposal without any run and reports run as missing", async () => {
    const c = await company("Explain Proposal");
    const proposer = await agent(c.id, "Sin runs");
    const proposal = (await db.insert(proposals).values({
      companyId: c.id, proposalKey: "prop-1", title: "Oferta anual", status: "sent", revision: 2, createdByAgentId: proposer.id,
    }).returning())[0]!;

    const explanation = await agentExplainService(db).explain(c.id, "proposal", proposal.id);

    expect(explanation.run).toBeNull();
    expect(explanation.missing).toContain("run");
    expect(explanation.result).toEqual({ kind: "proposal", id: proposal.id, summary: "sent · revision 2" });
    expect(explanation.timeline.length).toBeGreaterThan(0);
  });

  it("returns 404 for an unknown action id", async () => {
    const c = await company("Explain Unknown");
    await expect(agentExplainService(db).explain(c.id, "decision", randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(agentExplainService(db).explain(c.id, "run", "not-a-uuid")).rejects.toMatchObject({ status: 404 });
  });
});
