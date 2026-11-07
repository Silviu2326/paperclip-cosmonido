import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agents,
  authUsers,
  companies,
  companyMemberships,
  createDb,
  decisionEffectExecutions,
  decisionRemoteTokens,
  decisionTargetIssues,
  decisions,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { decisionService } from "../services/decisions.js";
import { commercialDecisionService } from "../services/commercial-decisions.js";

const support = await getEmbeddedPostgresTestSupport();
const describePg = support.supported ? describe : describe.skip;

describePg("commercialDecisionService", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  let companyId: string;
  let agentId: string;
  let originIssueId: string;
  let runId: string;
  let decidedByUserId: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-commercial-decisions-");
    db = createDb(tempDb.connectionString);
  }, 120_000);

  beforeEach(async () => {
    process.env.PAPERCLIP_DECISION_SIGNING_SECRET = "0123456789abcdef0123456789abcdef";
    companyId = randomUUID(); agentId = randomUUID(); originIssueId = randomUUID(); runId = randomUUID();
    decidedByUserId = `decider-${randomUUID()}`;
    const now = new Date();
    await db.insert(companies).values({ id: companyId, name: "Commercial", issuePrefix: `C${companyId.slice(0, 6)}`, requireBoardApprovalForNewAgents: false });
    await db.insert(authUsers).values({ id: decidedByUserId, name: "Decider", email: `${decidedByUserId}@example.test`, createdAt: now, updatedAt: now });
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: decidedByUserId, status: "active", membershipRole: "member" });
    await db.insert(agents).values({ id: agentId, companyId, name: "Seller", role: "engineer", status: "active", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {} });
    await db.insert(issues).values({ id: originIssueId, companyId, title: "Origin", status: "in_progress", priority: "medium", assigneeAgentId: agentId });
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, status: "running", responsibleUserId: decidedByUserId, contextSnapshot: { issueId: originIssueId } });
  });

  afterEach(async () => {
    await db.delete(decisionRemoteTokens); await db.delete(decisionEffectExecutions); await db.delete(decisionTargetIssues);
    await db.delete(decisions); await db.delete(activityLog); await db.delete(heartbeatRuns); await db.delete(issues);
    await db.delete(agents); await db.delete(companyMemberships); await db.delete(authUsers); await db.delete(companies);
  });
  afterAll(async () => tempDb?.cleanup());

  const agentActor = () => ({ type: "agent" as const, companyId, agentId, runId, source: "agent_jwt" as const,
    onBehalfOfUserId: decidedByUserId, onBehalfOfMemberships: [{ companyId, membershipRole: "member", status: "active" }] });
  const boardActor = () => ({ type: "board" as const, userId: decidedByUserId, companyIds: [companyId], source: "session" as const,
    memberships: [{ companyId, membershipRole: "member", status: "active" }] });

  function build(deps: { subjectVersion?: (companyId: string, subject: { kind: string; id: string }) => Promise<string | null> } = {}) {
    const sendMessage = vi.fn(async () => undefined);
    const recordShadowOutcome = vi.fn(async () => undefined);
    const service = commercialDecisionService(db, {
      decisions: decisionService(db, { wakeOriginAgent: async () => undefined }),
      effectHandlers: { send_message: sendMessage },
      recordShadowOutcome,
      publicBaseUrl: "https://app.example.test",
      ...deps,
    } as Parameters<typeof commercialDecisionService>[1]);
    return { service, sendMessage, recordShadowOutcome };
  }

  const messageInput = (overrides: Record<string, unknown> = {}) => ({
    type: "approve_send" as const,
    title: "Enviar el seguimiento?",
    body: "Borrador listo para Acme.",
    subject: { kind: "message_draft" as const, id: "draft-1" },
    subjectVersion: "v1",
    options: [
      { id: "send", label: "Enviar", style: "primary" as const, effect: { kind: "send_message" as const, messageId: "draft-1" } },
      { id: "discard", label: "Descartar", style: "destructive" as const, effect: { kind: "none" as const } },
    ],
    expiresInHours: 72,
    idempotencyKey: `commercial-${randomUUID()}`,
    ...overrides,
  });

  it("stores the commercial metadata and keeps base option effects empty", async () => {
    const { service } = build();
    const created = await service.create(companyId, messageInput(), { actor: agentActor(), agentId, runId });
    expect(created.commercial).toMatchObject({ type: "approve_send", subjectVersion: "v1", effects: { send: { kind: "send_message", messageId: "draft-1" } } });
    expect(created.options.every((option) => option.effects.length === 0)).toBe(true);
    const listed = await service.listOpen(companyId);
    expect(listed.map((decision) => decision.id)).toEqual([created.id]);
    expect(await service.get(randomUUID())).toBeNull();
  });

  it("resolving twice applies the effect handler exactly once", async () => {
    const { service, sendMessage, recordShadowOutcome } = build();
    const created = await service.create(companyId, messageInput({ shadowAgentId: agentId, shadowActionType: "send_message" }), { actor: agentActor(), agentId, runId });

    const first = await service.resolve(created.id, { optionId: "send", subjectVersion: "v1" }, { decidedByUserId, userActor: boardActor() });
    const second = await service.resolve(created.id, { optionId: "send", subjectVersion: "v1" }, { decidedByUserId, userActor: boardActor() });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.decision.status).toBe("decided");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ kind: "send_message", messageId: "draft-1" }, expect.objectContaining({ companyId, decisionId: created.id }));
    expect(recordShadowOutcome).toHaveBeenCalledTimes(1);
    expect(recordShadowOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: "sent_unchanged", actionType: "send_message" }));
    const audit = await db.select().from(activityLog).where(eq(activityLog.action, "decision.commercial_resolved"));
    expect(audit).toHaveLength(1);
  });

  it("records unknown effect kinds as pending and still resolves", async () => {
    const { service, sendMessage } = build();
    const created = await service.create(companyId, messageInput({
      options: [{ id: "escalate", label: "Escalar", effect: { kind: "escalate_customer" as const, customerId: randomUUID() } }],
    }), { actor: agentActor(), agentId, runId });
    const result = await service.resolve(created.id, { optionId: "escalate" }, { decidedByUserId, userActor: boardActor() });
    expect(result.applied).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.decision.commercial?.resolution?.pendingEffects).toEqual([{ kind: "escalate_customer", reason: "no_handler" }]);
  });

  it("refuses a stale subjectVersion with 409 and keeps the decision open", async () => {
    const { service, sendMessage } = build();
    const created = await service.create(companyId, messageInput(), { actor: agentActor(), agentId, runId });
    await expect(service.resolve(created.id, { optionId: "send", subjectVersion: "v0" }, { decidedByUserId, userActor: boardActor() }))
      .rejects.toMatchObject({ status: 409, details: { code: "subject_changed" } });
    expect(sendMessage).not.toHaveBeenCalled();
    const row = await db.select().from(decisions).where(eq(decisions.id, created.id)).then((rows) => rows[0]!);
    expect(row.status).toBe("open");
  });

  it("refuses when the domain subject version moved on", async () => {
    const { service, sendMessage } = build({ subjectVersion: async () => "v2" });
    const created = await service.create(companyId, messageInput(), { actor: agentActor(), agentId, runId });
    await expect(service.resolve(created.id, { optionId: "send" }, { decidedByUserId, userActor: boardActor() }))
      .rejects.toMatchObject({ status: 409 });
    expect(sendMessage).not.toHaveBeenCalled();
    expect((await service.get(created.id))?.status).toBe("open");
  });

  it("resolves from a remote link once, then answers 410 for the used token", async () => {
    const { service, sendMessage } = build();
    const created = await service.create(companyId, messageInput(), { actor: agentActor(), agentId, runId });
    const link = await service.createRemoteLink(created.id, { channel: "email", expiresInHours: 48 }, { userId: decidedByUserId });
    expect(link.url.startsWith("https://app.example.test/api/public/decisions/")).toBe(true);
    const token = link.url.split("/").pop()!;

    const stored = await db.select().from(decisionRemoteTokens).where(eq(decisionRemoteTokens.decisionId, created.id)).then((rows) => rows[0]!);
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const description = await service.describeRemote(token);
    expect(description).toMatchObject({ title: "Enviar el seguimiento?", status: "open" });

    const result = await service.resolveRemote(token, "send", { ip: "127.0.0.1", userAgent: "test" });
    expect(result.applied).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const used = await db.select().from(decisionRemoteTokens).where(eq(decisionRemoteTokens.id, stored.id)).then((rows) => rows[0]!);
    expect(used.usedAt).toBeInstanceOf(Date);
    expect(used.usedOptionId).toBe("send");

    await expect(service.resolveRemote(token, "send", { ip: null, userAgent: null })).rejects.toMatchObject({ status: 410 });
    await expect(service.describeRemote(token)).rejects.toMatchObject({ status: 410 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("answers 410 for an expired remote token without resolving", async () => {
    const { service, sendMessage } = build();
    const created = await service.create(companyId, messageInput(), { actor: agentActor(), agentId, runId });
    const link = await service.createRemoteLink(created.id, { channel: "email", expiresInHours: 48 }, { userId: decidedByUserId });
    const token = link.url.split("/").pop()!;
    await db.update(decisionRemoteTokens).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(decisionRemoteTokens.decisionId, created.id));

    await expect(service.resolveRemote(token, "send", { ip: null, userAgent: null })).rejects.toMatchObject({ status: 410 });
    expect(sendMessage).not.toHaveBeenCalled();
    expect((await service.get(created.id))?.status).toBe("open");
  });

  it("answers 404 for an unknown remote token", async () => {
    const { service } = build();
    await expect(service.describeRemote("x".repeat(43))).rejects.toMatchObject({ status: 404 });
  });
});
