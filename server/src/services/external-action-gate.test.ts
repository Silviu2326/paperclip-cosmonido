import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, autonomyPolicies, companies, createDb, type Db } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "../__tests__/helpers/embedded-postgres.js";
import {
  approveExternalAction,
  gateExternalAction,
  rejectExternalAction,
  resolveAutonomyLevel,
} from "./external-action-gate.js";

const support = await getEmbeddedPostgresTestSupport();
const describePostgres = support.supported ? describe : describe.skip;
if (!support.supported) console.warn(`Skipping external action gate tests: ${support.reason}`);

describePostgres("external action gate", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: Db;

  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("external-action-gate-");
    db = createDb(database.connectionString);
  }, 180_000);

  afterAll(async () => {
    await db?.$client.end({ timeout: 0 });
    await database?.cleanup();
  });

  async function fixture() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Gate", issuePrefix: `G${companyId.slice(0, 7)}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "Seller", adapterType: "codex_local" });
    return { companyId, agentId };
  }

  function spyExecutor(value: Record<string, unknown> = { sent: true }) {
    return vi.fn(async () => value);
  }

  function input(
    f: { companyId: string; agentId?: string },
    execute: () => Promise<Record<string, unknown>>,
    idempotencyKey: string = randomUUID(),
  ) {
    return {
      companyId: f.companyId,
      actionType: "email" as const,
      actor: f.agentId ? { agentId: f.agentId } : { userId: "board-user" },
      payload: { to: "customer@example.com", body: "hola" },
      idempotencyKey,
      execute,
    };
  }

  it("defaults to draft_only when no policy exists", async () => {
    const f = await fixture();
    expect(await resolveAutonomyLevel(db, { companyId: f.companyId, agentId: f.agentId, actionType: "email" })).toBe(
      "draft_only",
    );

    const execute = spyExecutor();
    const out = await gateExternalAction(db, input(f, execute, "default-draft"));

    expect(out.mode).toBe("draft");
    expect(out.action.status).toBe("pending");
    expect(out.action.levelApplied).toBe("draft_only");
    expect(execute).not.toHaveBeenCalled();
  });

  it("lets the agent policy win over the company policy", async () => {
    const f = await fixture();
    await db.insert(autonomyPolicies).values([
      { companyId: f.companyId, agentId: null, actionType: "email", level: "send_direct" },
      { companyId: f.companyId, agentId: f.agentId, actionType: "email", level: "draft_only" },
    ]);

    expect(await resolveAutonomyLevel(db, { companyId: f.companyId, agentId: f.agentId, actionType: "email" })).toBe(
      "draft_only",
    );
    const execute = spyExecutor();
    const out = await gateExternalAction(db, input(f, execute));
    expect(out.mode).toBe("draft");
    expect(execute).not.toHaveBeenCalled();
  });

  it("falls back to the company policy when the agent has none", async () => {
    const f = await fixture();
    await db.insert(autonomyPolicies).values({
      companyId: f.companyId,
      agentId: null,
      actionType: "email",
      level: "send_direct",
    });

    const execute = spyExecutor({ messageId: "m1" });
    const out = await gateExternalAction(db, input(f, execute));
    expect(out.mode).toBe("direct");
    expect(out.action.status).toBe("executed");
    expect(out.result).toEqual({ messageId: "m1" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("ignores revoked policies", async () => {
    const f = await fixture();
    await db.insert(autonomyPolicies).values([
      {
        companyId: f.companyId,
        agentId: f.agentId,
        actionType: "email",
        level: "send_direct",
        revokedAt: new Date(),
      },
      { companyId: f.companyId, agentId: null, actionType: "email", level: "send_with_approval", revokedAt: new Date() },
    ]);

    expect(await resolveAutonomyLevel(db, { companyId: f.companyId, agentId: f.agentId, actionType: "email" })).toBe(
      "draft_only",
    );
    const out = await gateExternalAction(db, input(f, spyExecutor()));
    expect(out.mode).toBe("draft");
  });

  it("executes board user actions directly", async () => {
    const f = await fixture();
    const execute = spyExecutor({ ok: 1 });
    const out = await gateExternalAction(db, input({ companyId: f.companyId }, execute));

    expect(out.mode).toBe("direct");
    expect(out.action.status).toBe("executed");
    expect(out.action.actorUserId).toBe("board-user");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns the existing action for a repeated idempotency key without executing again", async () => {
    const f = await fixture();
    const execute = spyExecutor();
    const first = await gateExternalAction(db, input({ companyId: f.companyId }, execute, "same-key"));
    const second = await gateExternalAction(db, input({ companyId: f.companyId }, execute, "same-key"));

    expect(second.action.id).toBe(first.action.id);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("requires approval before executing send_with_approval actions", async () => {
    const f = await fixture();
    await db.insert(autonomyPolicies).values({
      companyId: f.companyId,
      agentId: f.agentId,
      actionType: "email",
      level: "send_with_approval",
    });

    const execute = spyExecutor({ sent: "after-approval" });
    const requested = await gateExternalAction(db, input(f, execute));
    expect(requested.mode).toBe("approval");
    expect(requested.action.status).toBe("pending");
    expect(requested.action.approvalId).not.toBeNull();
    expect(execute).not.toHaveBeenCalled();

    const approved = await approveExternalAction(db, {
      actionId: requested.action.id,
      approverUserId: "board-user",
    });
    expect(approved.action.status).toBe("executed");
    expect(approved.result).toEqual({ sent: "after-approval" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects approval-mode actions without executing them", async () => {
    const f = await fixture();
    await db.insert(autonomyPolicies).values({
      companyId: f.companyId,
      agentId: f.agentId,
      actionType: "email",
      level: "send_with_approval",
    });

    const execute = spyExecutor();
    const requested = await gateExternalAction(db, input(f, execute));
    const rejected = await rejectExternalAction(db, {
      actionId: requested.action.id,
      approverUserId: "board-user",
      reason: "tono incorrecto",
    });
    expect(rejected.status).toBe("rejected");
    expect(execute).not.toHaveBeenCalled();
  });
});
