import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path, { basename, dirname, resolve } from "node:path";
import { eq } from "drizzle-orm";
import {
  createDb, companies, companyMemberships, companyDecisionModels, decisionInvocations,
  productizationCopilotRequests, productizationOnboarding,
} from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "@paperclipai/db/test-embedded-postgres";
import { DECISION_MODELS } from "@paperclipai/shared";
import type { DecisionAnswer, DecisionRequest } from "@paperclipai/shared";
import { ONBOARDING_JOURNEY_VERSION } from "@paperclipai/shared/productization/onboarding-journey";
import { COPILOT_PROPOSAL_FEATURE } from "@paperclipai/shared/productization/description-builder";
import { aiConnectionService } from "../services/ai-connections.js";
import { decisionReceipt, type DecisionProviderOutcome } from "../services/decision-model-provider.js";
import { productizationConfigurationCopilotService } from "../services/productization/configuration-copilot.js";

let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
let db: ReturnType<typeof createDb>;
let home: string;
let sequence = 0;

beforeAll(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), "paperclip-builder-copilot-")));
  vi.stubEnv("PAPERCLIP_HOME", home);
  // The private temp root can be long on Windows. Keep the instance segment
  // compact so SQLite can create its lock and rollback-journal files within
  // the platform's legacy path limit.
  vi.stubEnv("PAPERCLIP_INSTANCE_ID", "bct");
  database = await startEmbeddedPostgresTestDatabase("paperclip-builder-copilot-db-");
  db = createDb(database.connectionString);
}, 90_000);
afterAll(async () => {
  await database?.cleanup();
  if (home) {
    const expectedHome = home;
    const actualHome = await realpath(expectedHome);
    const actualTmp = await realpath(os.tmpdir());
    const homeInfo = await lstat(expectedHome);
    if (actualHome !== resolve(expectedHome) || homeInfo.isSymbolicLink()
      || resolve(dirname(actualHome)) !== actualTmp
      || !basename(actualHome).startsWith("paperclip-builder-copilot-")) {
      throw new Error("productization_copilot_test_cleanup_path_unverified");
    }
    await rm(actualHome, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

const successfulAnswers: Record<string, DecisionAnswer> = {
  role: { type: "choice", choice: "operations_assistant" },
  autonomy: { type: "choice", choice: "draft_only" },
  budget: { type: "choice", choice: "usd_25" },
  daily_brief: { type: "boolean", probability: 0.1 },
  brief_time: { type: "choice", choice: "h09" },
  lead_notification: { type: "boolean", probability: 0.1 },
};
const success: DecisionProviderOutcome = {
  answers: successfulAnswers,
  receipt: decisionReceipt("openai", { usage: { inputTokens: 80, outputTokens: 35 } }),
};

function successFor(request: DecisionRequest): DecisionProviderOutcome {
  const answers = structuredClone(success.answers ?? {});
  for (const [key, question] of Object.entries(request.questions)) {
    if (answers[key]) continue;
    answers[key] = question.type === "boolean" ? { type: "boolean", probability: 0.1 }
      : question.type === "choice" ? { type: "choice", choice: Object.keys(question.criteria)[0]! }
        : { type: "score", score: 0 };
  }
  return { ...structuredClone(success), answers };
}

async function fixture(provider: typeof import("../services/decision-model-provider.js").runDecisionProvider = async ({ request }) => successFor(request)) {
  const companyId = randomUUID();
  await db.insert(companies).values({ id: companyId, name: "Builder copilot", issuePrefix: `BC${++sequence}` });
  await db.insert(companyMemberships).values({ companyId, principalId: "alice", principalType: "user", status: "active", membershipRole: "owner" });
  const now = new Date().toISOString();
  await db.insert(productizationOnboarding).values({ companyId, revision: 1, journey: {
    version: ONBOARDING_JOURNEY_VERSION, id: randomUUID(), companyId, accountId: null,
    path: "entrepreneur", createdAt: now, connections: [], builderDrafts: [],
  } });
  const connections = aiConnectionService(db);
  const binding = await connections.save(companyId, "alice", {
    provider: "openai", method: "api_key", name: "Decision model", ownership: "shared", apiKey: "test-only", agentIds: [], allAgents: true,
  }, "copilot-test-key");
  const model = { ...binding, enabled: true, allowBackground: true };
  const { decisionModelService } = await import("../services/decision-models.js");
  await decisionModelService(db).configure(companyId, "alice", model);
  const actor = { actorType: "user" as const, actorId: "alice", agentId: null };
  const context = { actor: { type: "board" as const, userId: "alice", source: "session" as const,
    companyIds: [companyId], memberships: [{ companyId, membershipRole: "owner" as const, status: "active" as const }] } };
  const service = productizationConfigurationCopilotService(db, { decisionProvider: provider });
  return { companyId, service, actor, context };
}

const input = (idempotencyKey: string, message = "Organize internal work") => ({ expectedRevision: 1, idempotencyKey, message });

describe("productization configuration copilot request ledger", () => {
  it("rejects changed input on a saved idempotency key without another provider call", async () => {
    const provider = vi.fn(async ({ request }) => successFor(request));
    const f = await fixture(provider);
    const key = randomUUID();
    const firstResult = await f.service.propose(f.companyId, input(key), f.actor, f.context);
    expect(firstResult.status, JSON.stringify(firstResult)).toBe("saved");
    await expect(f.service.propose(f.companyId, input(key, "Different request"), f.actor, f.context)).rejects.toMatchObject({
      status: 409, details: { code: "copilot_idempotency_conflict" },
    });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("prevents cross-service duplicate calls while a paid invocation is pending", async () => {
    let signalStarted!: () => void;
    let resolveProvider!: (value: DecisionProviderOutcome) => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const providerResult = new Promise<DecisionProviderOutcome>((resolve) => { resolveProvider = resolve; });
    const provider = vi.fn(async ({ request }) => { signalStarted(); return providerResult.then((result) => ({ ...result, answers: successFor(request).answers })); });
    const f = await fixture(provider);
    const secondService = productizationConfigurationCopilotService(db, { decisionProvider: provider });
    const request = input(randomUUID());
    const first = f.service.propose(f.companyId, request, f.actor, f.context);
    await started;
    await expect(secondService.propose(f.companyId, request, f.actor, f.context)).rejects.toMatchObject({
      status: 409, details: { code: "copilot_request_in_progress" },
    });
    await expect(f.service.propose(f.companyId, input(request.idempotencyKey, "Changed while pending"), f.actor, f.context)).rejects.toMatchObject({
      status: 409, details: { code: "copilot_idempotency_conflict" },
    });
    await expect(f.service.propose(f.companyId, request, { ...f.actor, actorId: "bob" }, f.context)).rejects.toMatchObject({
      status: 409, details: { code: "copilot_idempotency_actor_conflict" },
    });
    resolveProvider(structuredClone(success));
    expect((await first).status).toBe("saved");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("preserves invocation provenance when model settings change during a paid call", async () => {
    const f = await fixture(async ({ request }) => {
      await db.update(companyDecisionModels).set({ model: "changed-after-admission" }).where(eq(companyDecisionModels.companyId, f.companyId));
      return successFor(request);
    });
    const result = await f.service.propose(f.companyId, input(randomUUID()), f.actor, f.context);
    expect(result.status, JSON.stringify(result)).toBe("saved");
    if (result.status !== "saved") return;
    const [invocation] = await db.select().from(decisionInvocations).where(eq(decisionInvocations.companyId, f.companyId));
    expect(invocation).toBeDefined();
    expect(result.journey.builderDrafts?.[0]?.versions[0]?.proposal).toMatchObject({
      invocationId: invocation!.id, provider: invocation!.provider, model: invocation!.model,
    });
    expect(invocation!.model).toBe(DECISION_MODELS.openai.id);
  });

  it("does not reinvoke a request whose durable reservation has unknown outcome", async () => {
    const provider = vi.fn(async ({ request }) => successFor(request));
    const f = await fixture(provider);
    const key = randomUUID();
    const requestHash = createHash("sha256").update(JSON.stringify({ draftId: null, baseVersion: null, message: "Organize internal work" })).digest("hex");
    await db.insert(productizationCopilotRequests).values({
      companyId: f.companyId, feature: COPILOT_PROPOSAL_FEATURE, idempotencyKey: key, requestHash,
      actorType: f.actor.actorType, actorId: f.actor.actorId, status: "unknown",
      request: { companyId: f.companyId, input: { draftId: null, baseVersion: null, message: "Organize internal work" } },
    });
    await expect(f.service.propose(f.companyId, input(key), f.actor, f.context)).rejects.toMatchObject({
      status: 409, details: { code: "copilot_request_outcome_unknown" },
    });
    expect(provider).not.toHaveBeenCalled();
  });
});
