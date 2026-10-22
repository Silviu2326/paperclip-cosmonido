import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { agents, companies, createDb, goals, proposals, serviceAgreements } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { serviceAgreementService } from "../services/service-agreements.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;
const DAY_MS = 24 * 60 * 60 * 1000;

describePg("recurring service agreements", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-agreements-");
    db = createDb(tempDb.connectionString);
  }, 90_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  async function company(name: string) {
    return (await db.insert(companies).values({ name, issuePrefix: `SA${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!;
  }
  async function agent(companyId: string) {
    return (await db.insert(agents).values({ companyId, name: "Soporte", role: "general", status: "idle", adapterType: "codex_local", adapterConfig: {} }).returning())[0]!;
  }
  const deliverables = [{ title: "Informe de uso", acceptanceCriteria: "Entregado antes del día 5", budgetCents: 10_000 }];

  it("creates exactly one assignment per due period, also when the tick runs twice", async () => {
    const c = await company("Recurrente");
    const a = await agent(c.id);
    const svc = serviceAgreementService(db);
    const agreement = await svc.create(c.id, {
      title: "Soporte mensual",
      periodKind: "monthly",
      startsAt: new Date(Date.now() - 65 * DAY_MS),
      endsAt: null,
      deliverablesPerPeriod: deliverables,
      autoRenew: true,
      noticeDays: 30,
      assigneeAgentId: a.id,
      customerId: null,
      proposalId: null,
    }, { userId: "board-user" });

    const now = new Date();
    const first = await svc.startDuePeriods(now, { companyId: c.id });
    const second = await svc.startDuePeriods(now, { companyId: c.id });
    const periods = await svc.listPeriods(agreement.id);
    const due = periods.filter((period) => period.periodStart.getTime() <= now.getTime());

    expect(due.length).toBeGreaterThanOrEqual(3);
    expect(first.periodsStarted).toBe(due.length);
    expect(second.periodsStarted).toBe(0);
    expect(due.every((period) => period.assignmentGoalId)).toBe(true);
    expect(new Set(due.map((period) => period.assignmentGoalId)).size).toBe(due.length);
    const assignments = await db.select().from(goals).where(and(eq(goals.companyId, c.id), eq(goals.kind, "assignment")));
    expect(assignments).toHaveLength(due.length);
    expect(assignments.every((goal) => goal.title.startsWith("Soporte mensual · "))).toBe(true);
    // The period that has not started yet is planned but has no assignment.
    expect(periods.some((period) => period.periodStart.getTime() > now.getTime() && !period.assignmentGoalId)).toBe(true);
  });

  it("requests one renewal proposal for an auto-renewing agreement however often the renewal check runs", async () => {
    const c = await company("Renovacion");
    const a = await agent(c.id);
    const proposal = (await db.insert(proposals).values({
      companyId: c.id,
      proposalKey: randomUUID(),
      title: "Renovación",
      priceCents: 120_000,
      status: "draft",
    }).returning())[0]!;
    const proposalCalls: string[] = [];
    const decisionCalls: string[] = [];
    const svc = serviceAgreementService(db, {
      createRenewalProposal: async ({ companyId }) => {
        proposalCalls.push(companyId);
        return { proposalId: proposal.id };
      },
      requestRenewalDecision: async ({ proposalId }) => {
        decisionCalls.push(proposalId);
        return { decisionId: randomUUID() };
      },
    });
    const now = new Date();
    const agreement = await svc.create(c.id, {
      title: "Soporte anual",
      periodKind: "monthly",
      startsAt: new Date(now.getTime() - 40 * DAY_MS),
      endsAt: new Date(now.getTime() + 10 * DAY_MS),
      deliverablesPerPeriod: deliverables,
      autoRenew: true,
      noticeDays: 30,
      assigneeAgentId: a.id,
      customerId: null,
      proposalId: null,
    }, { userId: "board-user" });

    await svc.renewalsDue(now, { companyId: c.id });
    await svc.renewalsDue(now, { companyId: c.id });

    expect(proposalCalls).toHaveLength(1);
    expect(decisionCalls).toHaveLength(1);
    const periods = await svc.listPeriods(agreement.id);
    const last = periods[periods.length - 1]!;
    expect(last.renewalProposalId).toBe(proposal.id);
    expect(last.renewalDecisionId).toBeTruthy();
    const current = await svc.getById(agreement.id);
    expect(current?.status).toBe("notice");
  });

  it("does not renew agreements without auto-renew or outside the notice window", async () => {
    const c = await company("Sin renovacion");
    const a = await agent(c.id);
    const calls: string[] = [];
    const svc = serviceAgreementService(db, {
      createRenewalProposal: async () => { calls.push("called"); return null; },
    });
    const now = new Date();
    await svc.create(c.id, {
      title: "Puntual",
      periodKind: "yearly",
      startsAt: new Date(now.getTime() - 60 * DAY_MS),
      endsAt: new Date(now.getTime() + 200 * DAY_MS),
      deliverablesPerPeriod: deliverables,
      autoRenew: true,
      noticeDays: 30,
      assigneeAgentId: a.id,
      customerId: null,
      proposalId: null,
    }, { userId: "board-user" });
    await svc.create(c.id, {
      title: "Sin renovación automática",
      periodKind: "monthly",
      startsAt: new Date(now.getTime() - 40 * DAY_MS),
      endsAt: new Date(now.getTime() + 5 * DAY_MS),
      deliverablesPerPeriod: deliverables,
      autoRenew: false,
      noticeDays: 30,
      assigneeAgentId: a.id,
      customerId: null,
      proposalId: null,
    }, { userId: "board-user" });

    await svc.renewalsDue(now, { companyId: c.id });
    expect(calls).toHaveLength(0);
  });

  it("records an upsell suggestion without creating any other row", async () => {
    const c = await company("Upsell");
    const svc = serviceAgreementService(db);
    const before = await db.select().from(serviceAgreements).where(eq(serviceAgreements.companyId, c.id));
    const result = await svc.recordUpsell(c.id, {
      customerId: null,
      agreementId: null,
      suggestions: [{ title: "Auditoría trimestral", rationale: "Preguntas repetidas sobre cumplimiento.", evidence: ["Conversación 12/10"], confidence: 0.5 }],
    }, { agentId: null });
    expect(result.suggestions[0]?.title).toBe("Auditoría trimestral");
    const after = await db.select().from(serviceAgreements).where(eq(serviceAgreements.companyId, c.id));
    expect(after).toHaveLength(before.length);
  });
});
