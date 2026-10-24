import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  activityLog,
  agents,
  approvals,
  autonomyPolicies,
  companies,
  companyMemberships,
  conversationMessages,
  conversations,
  createDb,
  externalActions,
  leads,
  principalPermissionGrants,
  type Db,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../__tests__/helpers/embedded-postgres.js";
import { recordInboundMessage } from "./conversations/inbound.js";
import { conversationMessageService, registerConversationTransport } from "./conversations/messages.js";
import type { ConversationTransport, OutboundMessage } from "./conversations/transports/types.js";
import { approvalService } from "./approvals.js";
import { resolveExternalActionApproval } from "./external-action-gate.js";
import { retryExternalAction } from "./external-action-retry.js";

const embedded = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embedded.supported ? describe : describe.skip;
if (!embedded.supported) {
  console.warn(`Skipping external action approval tests on this host: ${embedded.reason ?? "unsupported environment"}`);
}

describeEmbeddedPostgres("external action approvals and retry", () => {
  let db!: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const send = vi.fn<(m: OutboundMessage) => Promise<{ status: "sent"; providerMessageId: string }>>(async () => ({
    status: "sent",
    providerMessageId: "provider-1",
  }));
  const fakeTransport: ConversationTransport = {
    provider: "fake",
    channels: ["webchat"],
    send: async (m) => send(m),
  };

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-external-action-retry-");
    db = createDb(tempDb.connectionString);
    registerConversationTransport(fakeTransport);
  }, 300_000);

  afterEach(async () => {
    send.mockClear();
    await db.delete(activityLog);
    await db.delete(externalActions);
    await db.delete(conversationMessages);
    await db.delete(conversations);
    await db.delete(leads);
    await db.delete(autonomyPolicies);
    await db.delete(approvals);
    await db.delete(principalPermissionGrants);
    await db.delete(companyMemberships);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function setup() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `R${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    const agentId = randomUUID();
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Sales",
      role: "sales",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
    });
    // The agent needs its company grant for messages (A1 creates it for real agents).
    await db.insert(companyMemberships).values({ companyId, principalType: "agent", principalId: agentId, status: "active", membershipRole: "member" });
    await db.insert(principalPermissionGrants).values({ companyId, principalType: "agent", principalId: agentId, permissionKey: "channels:message" });
    await db.insert(autonomyPolicies).values({ companyId, agentId, actionType: "message", level: "send_with_approval" });
    const { conversation } = await recordInboundMessage(db, companyId, {
      channel: "webchat",
      externalThreadId: `thread-${randomUUID()}`,
      externalMessageId: `msg-${randomUUID()}`,
      from: { email: "ana@example.com" },
      body: "Quiero un presupuesto",
    });
    return { companyId, agentId, conversationId: conversation.id };
  }

  /** Drafts and requests a send: the gate stores a pending action and a linked approval. */
  async function requestSend(f: { companyId: string; agentId: string; conversationId: string }, key: string) {
    const svc = conversationMessageService(db);
    const draft = await svc.draft(f.companyId, f.conversationId, { body: "Presupuesto", attachments: [], idempotencyKey: key }, { agentId: f.agentId });
    const outcome = await svc.send(f.companyId, draft.id, { agentId: f.agentId });
    expect(outcome.mode).toBe("approval");
    expect(outcome.action?.approvalId).toBeTruthy();
    return { messageId: draft.id, actionId: outcome.action!.id, approvalId: outcome.action!.approvalId! };
  }

  it("approving the approval executes the gated message", async () => {
    const f = await setup();
    const { messageId, actionId, approvalId } = await requestSend(f, "approve-1");

    await approvalService(db).approve(approvalId, "board-user", null);
    const approval = await approvalService(db).getById(approvalId);
    const linked = await resolveExternalActionApproval(db, { approval: approval!, decision: "approved", approverUserId: "board-user" });

    expect(linked).toEqual({ actionId });
    const [action] = await db.select().from(externalActions).where(eq(externalActions.id, actionId));
    expect(action?.status).toBe("executed");
    expect(send).toHaveBeenCalledTimes(1);
    const [message] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, messageId));
    expect(message?.deliveryStatus).toBe("sent");
  });

  it("rejecting the approval marks the action rejected and never sends", async () => {
    const f = await setup();
    const { messageId, actionId, approvalId } = await requestSend(f, "reject-1");

    await approvalService(db).reject(approvalId, "board-user", "tono incorrecto");
    const approval = await approvalService(db).getById(approvalId);
    await resolveExternalActionApproval(db, { approval: approval!, decision: "rejected", approverUserId: "board-user", reason: "tono incorrecto" });

    const [action] = await db.select().from(externalActions).where(eq(externalActions.id, actionId));
    expect(action?.status).toBe("rejected");
    expect(send).not.toHaveBeenCalled();
    const [message] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, messageId));
    expect(message?.deliveryStatus).toBe("draft");
  });

  it("after a restart, an approved message waits for an executor and retry delivers it", async () => {
    const f = await setup();
    const { messageId, actionId, approvalId } = await requestSend(f, "restart-1");

    // The approval is decided, but the process that held the executor is gone:
    // a fresh module instance has an empty executor map and no registered transport.
    await approvalService(db).approve(approvalId, "board-user", null);
    vi.resetModules();
    const restartedGate = await import("./external-action-gate.js");
    const restartedRetry = await import("./external-action-retry.js");
    const restartedMessages = await import("./conversations/messages.js");
    const restartedApprovals = await import("./approvals.js");
    restartedMessages.registerConversationTransport(fakeTransport);

    const approval = await restartedApprovals.approvalService(db).getById(approvalId);
    const waiting = await restartedGate.resolveExternalActionApproval(db, {
      approval: approval!,
      decision: "approved",
      approverUserId: "board-user",
    });
    expect(waiting).toEqual({ actionId });
    const [parked] = await db.select().from(externalActions).where(eq(externalActions.id, actionId));
    expect(parked?.status).toBe("approved");
    expect(parked?.result).toEqual({ reason: "executor_unavailable" });
    expect(send).not.toHaveBeenCalled();

    const retried = await restartedRetry.retryExternalAction(db, actionId);
    expect(retried.action.status).toBe("executed");
    expect(send).toHaveBeenCalledTimes(1);
    const [message] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, messageId));
    expect(message?.deliveryStatus).toBe("sent");

    await expect(restartedRetry.retryExternalAction(db, actionId)).rejects.toMatchObject({ status: 409 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses to retry an action that is still pending and does not wait for an executor", async () => {
    const f = await setup();
    const { actionId } = await requestSend(f, "refuse-1");
    await expect(retryExternalAction(db, actionId)).rejects.toMatchObject({ status: 409 });
    expect(send).not.toHaveBeenCalled();
  });
});
