import { and, eq, inArray, ne } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { agents, companySkills, decisionInvocations, playbooks, productizationCopilotRequests, productizationOnboarding } from "@paperclipai/db";
import { createRoutineSchema, createRoutineTriggerSchema } from "@paperclipai/shared";
import type { DecisionAnswer, DecisionRequest, DecisionResult } from "@paperclipai/shared";
import {
  COPILOT_BUDGET_TIERS_USD, COPILOT_PROPOSABLE_AUTONOMY, COPILOT_PROPOSAL_FEATURE, COPILOT_ROLE_CATALOG, COPILOT_SANDBOX_FEATURE,
} from "@paperclipai/shared/productization/description-builder";
import type {
  BuilderApplication, BuilderApplicationChange, BuilderDraft, BuilderDraftVersion, BuilderPlan, BuilderSandboxRun, BuilderSelection,
  CopilotApplyPlanRequest, CopilotOutcome, CopilotProposalRequest, CopilotSandboxRequest,
  CopilotApplyChangeRequest,
} from "@paperclipai/shared/productization/description-builder";
import { onboardingJourneySchema } from "@paperclipai/shared/productization/onboarding-api";
import { conflict, notFound, unprocessable } from "../../errors.js";
import { decisionModelService, defineDecisionFeature, type DecisionContext } from "../decision-models.js";
import { runDecisionProvider } from "../decision-model-provider.js";
import type { BudgetServiceHooks } from "../budgets.js";
import { productizationConnectionHealthService } from "./connection-health.js";
import { productizationDescriptionBuilderService } from "./description-builder.js";
import { routineService } from "../routines.js";
import { publishActivity, type ActivityPublication } from "../activity-log.js";

type Actor = Parameters<ReturnType<typeof productizationDescriptionBuilderService>["internals"]["save"]>[3];
type Journey = ReturnType<typeof onboardingJourneySchema.parse>;
type Sink = { signal?: AbortSignal };

const proposalFeature = defineDecisionFeature(COPILOT_PROPOSAL_FEATURE);
const sandboxFeature = defineDecisionFeature(COPILOT_SANDBOX_FEATURE);
const THRESHOLD = 0.6;
const MAX_SKILLS = 8;
const MAX_CONNECTIONS = 4;
const MAX_PLAYBOOKS = 5;
const BRIEF_TIMES = { h07: [7, 0], h09: [9, 0], h18: [18, 0] } as const;
const SANDBOX_ACTIONS = {
  reply_draft: "Prepare a draft reply for a person to review",
  ask_clarification: "Ask the customer or the team for missing information before acting",
  escalate_to_human: "Hand the case to a human owner without acting",
  decline_out_of_scope: "Decline because the request is outside the configured role",
} as const;

const routineMarker = (applicationId: string, changeId: string) => `[copilot:${applicationId.slice(0, 8)}:${changeId}]`;
const probability = (answers: Record<string, DecisionAnswer>, key: string) => {
  const answer = answers[key];
  return answer?.type === "boolean" && Number.isFinite(answer.probability) ? answer.probability : null;
};
const choice = <T extends readonly string[]>(answers: Record<string, DecisionAnswer>, key: string, allowed: T): T[number] | null => {
  const answer = answers[key];
  return answer?.type === "choice" ? allowed.find((value) => value === answer.choice) ?? null : null;
};
const validTimezone = (timezone: string) => { try { new Intl.DateTimeFormat("en", { timeZone: timezone }); return true; } catch { return false; } };

type Catalog = {
  skills: Array<{ id: string; name: string }>;
  connections: Array<{ id: string; name: string; application: string }>;
  playbooks: Array<{ id: string; name: string }>;
};

/** Shared, deliberately small bridge from natural language to a governed configuration proposal. */
export function productizationConfigurationCopilotService(db: Db, options: { budgetHooks?: BudgetServiceHooks; decisionProvider?: typeof runDecisionProvider } = {}) {
  const inflight = new Map<string, Promise<unknown>>();
  const builder = productizationDescriptionBuilderService(db);
  const { read, save, validateSelection } = builder.internals;
  const decisions = decisionModelService(db, { budgetHooks: options.budgetHooks, provider: options.decisionProvider });
  const connectionHealth = productizationConnectionHealthService(db);

  async function loadCatalog(companyId: string): Promise<Catalog> {
    const [skillRows, connectionRows, playbookRows] = await Promise.all([
      db.select({ id: companySkills.id, name: companySkills.name, compatibility: companySkills.compatibility }).from(companySkills).where(eq(companySkills.companyId, companyId)),
      connectionHealth.list(companyId),
      db.select({ id: playbooks.id, name: playbooks.name, status: playbooks.status }).from(playbooks).where(eq(playbooks.companyId, companyId)),
    ]);
    const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    return {
      skills: byId(skillRows.filter((row) => row.compatibility !== "invalid")).slice(0, MAX_SKILLS).map(({ id, name }) => ({ id, name })),
      connections: byId(connectionRows.filter((row) => row.stage === "authorized" || row.stage === "checked")).slice(0, MAX_CONNECTIONS)
        .map((row) => ({ id: row.id, name: row.name, application: row.applicationName })),
      playbooks: byId(playbookRows.filter((row) => row.status !== "draft" && row.status !== "archived")).slice(0, MAX_PLAYBOOKS).map(({ id, name }) => ({ id, name })),
    };
  }
  const digest = (catalog: Catalog) => createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
  const hashRequest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

  async function claimRequest(feature: string, key: string, requestHash: string, actor: Actor, request: unknown) {
    return db.transaction(async (tx) => {
      const [inserted] = await tx.insert(productizationCopilotRequests).values({
        companyId: (request as { companyId: string }).companyId, feature, idempotencyKey: key, requestHash,
        actorType: actor.actorType, actorId: actor.actorId, request, status: "pending",
      }).onConflictDoNothing({ target: [productizationCopilotRequests.companyId, productizationCopilotRequests.feature, productizationCopilotRequests.idempotencyKey] }).returning();
      if (inserted) return { kind: "owner" as const, id: inserted.id, request, response: null as DecisionResult | null };
      const [prior] = await tx.select().from(productizationCopilotRequests).where(and(
        eq(productizationCopilotRequests.companyId, (request as { companyId: string }).companyId),
        eq(productizationCopilotRequests.feature, feature), eq(productizationCopilotRequests.idempotencyKey, key),
      )).for("update");
      if (!prior) throw conflict("The copilot request reservation could not be read. Retry with the same key.", { code: "copilot_request_unavailable" });
      if (prior.actorType !== actor.actorType || prior.actorId !== actor.actorId) throw conflict("This idempotency key belongs to another actor.", { code: "copilot_idempotency_actor_conflict" });
      if (prior.requestHash !== requestHash) throw conflict("This idempotency key was already used for different copilot input.", { code: "copilot_idempotency_conflict" });
      if (prior.status === "responded" && prior.response) return { kind: "resume" as const, id: prior.id, request: prior.request, response: prior.response as DecisionResult };
      if (prior.status === "completed" && prior.response) return { kind: "completed" as const, id: prior.id, request: prior.request, response: prior.response as DecisionResult };
      throw conflict("This request has an unresolved model invocation and will not be sent again. Check its invocation history before creating a new key.", {
        code: prior.status === "pending" ? "copilot_request_in_progress" : "copilot_request_outcome_unknown",
        invocationId: prior.invocationId ?? undefined,
      });
    });
  }

  async function assertReplayOwner(companyId: string, feature: string, key: string, requestHash: string, actor: Actor) {
    const [row] = await db.select({ requestHash: productizationCopilotRequests.requestHash, actorType: productizationCopilotRequests.actorType, actorId: productizationCopilotRequests.actorId })
      .from(productizationCopilotRequests).where(and(eq(productizationCopilotRequests.companyId, companyId), eq(productizationCopilotRequests.feature, feature), eq(productizationCopilotRequests.idempotencyKey, key)));
    if (row && (row.requestHash !== requestHash || row.actorType !== actor.actorType || row.actorId !== actor.actorId))
      throw conflict("This idempotency key belongs to another input or actor.", { code: "copilot_idempotency_conflict" });
  }

  async function persistDecisionResponse(id: string, companyId: string, feature: string, result: DecisionResult) {
    let identity: { provider: string | null; model: string | null } = { provider: null, model: null };
    if (result.invocationId) {
      const [invocation] = await db.select({ provider: decisionInvocations.provider, model: decisionInvocations.model })
        .from(decisionInvocations).where(and(eq(decisionInvocations.companyId, companyId), eq(decisionInvocations.id, result.invocationId), eq(decisionInvocations.feature, feature)));
      if (!invocation) throw conflict("The model invocation provenance could not be verified.", { code: "copilot_invocation_provenance_missing", invocationId: result.invocationId });
      identity = invocation;
    }
    await db.update(productizationCopilotRequests).set({
      response: result, invocationId: result.invocationId ?? null, provider: identity.provider, model: identity.model,
      status: result.status === "succeeded" ? "responded" : "completed", updatedAt: new Date(), finishedAt: result.status === "succeeded" ? null : new Date(),
    }).where(and(eq(productizationCopilotRequests.id, id), eq(productizationCopilotRequests.companyId, companyId), eq(productizationCopilotRequests.status, "pending")));
    return identity;
  }

  async function completeRequest(id: string, companyId: string, response: DecisionResult) {
    await db.update(productizationCopilotRequests).set({ status: "completed", response, invocationId: response.invocationId ?? null, updatedAt: new Date(), finishedAt: new Date() })
      .where(and(eq(productizationCopilotRequests.id, id), eq(productizationCopilotRequests.companyId, companyId), eq(productizationCopilotRequests.status, "responded")));
  }

  async function markRequestUnknown(id: string, companyId: string) {
    await db.update(productizationCopilotRequests).set({ status: "unknown", updatedAt: new Date(), finishedAt: new Date() })
      .where(and(eq(productizationCopilotRequests.id, id), eq(productizationCopilotRequests.companyId, companyId), eq(productizationCopilotRequests.status, "pending")));
  }

  async function invokeOrResume(claim: Awaited<ReturnType<typeof claimRequest>>, companyId: string, feature: string, call: () => Promise<DecisionResult>) {
    if (claim.kind === "completed") return { result: claim.response!, identity: null };
    if (claim.kind === "resume") return { result: claim.response!, identity: null };
    try {
      const result = await call();
      const identity = await persistDecisionResponse(claim.id, companyId, feature, result);
      return { result, identity };
    } catch (error) {
      await markRequestUnknown(claim.id, companyId).catch(() => undefined);
      throw error;
    }
  }

  function proposalRequest(message: string, catalog: Catalog, history: string[], current: BuilderSelection | null): DecisionRequest {
    const questions: DecisionRequest["questions"] = {
      role: { type: "choice", instructions: "Which role best matches what the business owner asked for?", criteria: Object.fromEntries(COPILOT_ROLE_CATALOG.map((role) => [role.id, `${role.label}: ${role.hint}`])) },
      autonomy: { type: "choice", instructions: "What is the least autonomy that satisfies the request? Prefer draft_only unless the owner clearly wants the assistant to send after approval.", criteria: { draft_only: "Only prepares drafts for a person", send_with_approval: "May send after a person approves each action" } },
      budget: { type: "choice", instructions: "Which monthly spending cap is proportionate to the request? This is only a request; nothing is spent or granted.", criteria: Object.fromEntries(COPILOT_BUDGET_TIERS_USD.map((usd) => [`usd_${usd}`, `Up to ${usd} USD per month`])) },
      daily_brief: { type: "boolean", instructions: "Does the owner ask for a recurring daily summary of company activity?" },
      brief_time: { type: "choice", instructions: "At which time should a requested daily summary arrive? Choose h09 if unspecified.", criteria: { h07: "07:00", h09: "09:00", h18: "18:00" } },
      lead_notification: { type: "boolean", instructions: "Does the owner ask to be notified when a new lead arrives?" },
    };
    catalog.skills.forEach((skill, index) => { questions[`skill_${index}`] = { type: "boolean", instructions: `Is the installed skill "${skill.name}" needed for this request?` }; });
    catalog.connections.forEach((connection, index) => { questions[`connection_${index}`] = { type: "boolean", instructions: `Is the authorized connection "${connection.application}: ${connection.name}" needed for this request?` }; });
    if (catalog.playbooks.length) questions.playbook = { type: "choice", instructions: "Which existing playbook, if any, should this assistant follow?", criteria: { none: "No playbook", ...Object.fromEntries(catalog.playbooks.map((playbook, index) => [`p${index}`, playbook.name])) } };
    return { state: { task: "Propose a business-assistant configuration. Answer only from the options in each question. Never invent identifiers.", ownerMessage: message, earlierOwnerMessages: history, currentConfiguration: current ? { role: current.role, autonomy: current.autonomy, monthlyBudgetUsd: current.monthlyBudgetUsd, skillCount: current.skillIds.length, connectionCount: current.connectionIds.length } : null }, questions };
  }

  /** Returns null unless every question that drives the configuration has a valid answer. */
  function interpret(answers: Record<string, DecisionAnswer>, catalog: Catalog): { selection: BuilderSelection; plan: BuilderPlan } | null {
    const role = choice(answers, "role", COPILOT_ROLE_CATALOG.map((item) => item.id));
    const autonomy = choice(answers, "autonomy", COPILOT_PROPOSABLE_AUTONOMY);
    const budget = choice(answers, "budget", COPILOT_BUDGET_TIERS_USD.map((usd) => `usd_${usd}`));
    const brief = probability(answers, "daily_brief");
    const lead = probability(answers, "lead_notification");
    const briefTime = choice(answers, "brief_time", Object.keys(BRIEF_TIMES));
    if (!role || !autonomy || !budget || brief === null || lead === null || !briefTime) return null;
    const skillScores = catalog.skills.map((_, index) => probability(answers, `skill_${index}`));
    const connectionScores = catalog.connections.map((_, index) => probability(answers, `connection_${index}`));
    if ([...skillScores, ...connectionScores].some((score) => score === null)) return null;
    let playbookId: string | null = null;
    if (catalog.playbooks.length) {
      const picked = choice(answers, "playbook", ["none", ...catalog.playbooks.map((_, index) => `p${index}`)]);
      if (!picked) return null;
      playbookId = picked === "none" ? null : catalog.playbooks[Number(picked.slice(1))]!.id;
    }
    const [hour, minute] = BRIEF_TIMES[briefTime as keyof typeof BRIEF_TIMES];
    const routines: BuilderPlan["routines"] = [];
    if (brief >= THRESHOLD) routines.push({ template: "daily_brief", hour, minute });
    if (lead >= THRESHOLD) routines.push({ template: "lead_notification", hour: 0, minute: 0 });
    return {
      selection: {
        role: COPILOT_ROLE_CATALOG.find((item) => item.id === role)!.label,
        skillIds: catalog.skills.filter((_, index) => skillScores[index]! >= THRESHOLD).map((skill) => skill.id),
        connectionIds: catalog.connections.filter((_, index) => connectionScores[index]! >= THRESHOLD).map((connection) => connection.id),
        autonomy, monthlyBudgetUsd: Number(budget.slice(4)),
      },
      plan: { routines, playbookId },
    };
  }

  function selectionDiff(from: BuilderSelection | null, to: BuilderSelection, fromPlan: BuilderPlan | undefined, toPlan: BuilderPlan | undefined) {
    const rows: Array<{ field: string; from: unknown; to: unknown }> = [];
    const track = (field: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) rows.push({ field, from: a ?? null, to: b ?? null }); };
    track("role", from?.role, to.role);
    track("skillIds", from?.skillIds ?? [], to.skillIds);
    track("connectionIds", from?.connectionIds ?? [], to.connectionIds);
    track("autonomy", from?.autonomy, to.autonomy);
    track("monthlyBudgetUsd", from?.monthlyBudgetUsd, to.monthlyBudgetUsd);
    track("routines", fromPlan?.routines.map((item) => item.template) ?? [], toPlan?.routines.map((item) => item.template) ?? []);
    track("playbookId", fromPlan?.playbookId ?? null, toPlan?.playbookId ?? null);
    return rows;
  }

  async function invocationIdentityFor(requestId: string, companyId: string, invocationId: string, feature: string) {
    const [request] = await db.select({ provider: productizationCopilotRequests.provider, model: productizationCopilotRequests.model, invocationId: productizationCopilotRequests.invocationId })
      .from(productizationCopilotRequests).where(and(eq(productizationCopilotRequests.id, requestId), eq(productizationCopilotRequests.companyId, companyId), eq(productizationCopilotRequests.feature, feature)));
    if (!request || request.invocationId !== invocationId || !request.provider || !request.model)
      throw conflict("The model invocation provenance could not be verified.", { code: "copilot_invocation_provenance_missing", invocationId });
    return { provider: request.provider, model: request.model };
  }

  function findByKey(journey: Journey, idempotencyKey: string): { draft: BuilderDraft; version: BuilderDraftVersion } | null {
    for (const draft of journey.builderDrafts ?? []) {
      const version = draft.versions.find((item) => item.proposal?.idempotencyKey === idempotencyKey);
      if (version) return { draft, version };
    }
    return null;
  }

  async function once<T>(key: string, work: () => Promise<T>): Promise<T> {
    const running = inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const promise = work().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  function failure(result: Exclude<DecisionResult, { status: "succeeded" }>): CopilotOutcome<never> {
    return result.status === "unavailable"
      ? { status: "unavailable", reason: result.reason, ...(result.invocationId ? { invocationId: result.invocationId } : {}) }
      : { status: "failed", errorCode: result.errorCode, invocationId: result.invocationId };
  }

  return {
    availability: async (companyId: string, context: Pick<DecisionContext, "actor">) => ({
      proposal: await decisions.availability({ companyId, actor: context.actor, feature: proposalFeature }),
      sandbox: await decisions.availability({ companyId, actor: context.actor, feature: sandboxFeature }),
    }),

    /** One real decision-model call per new idempotency key; replays return the saved immutable version without a provider call. */
    propose: (companyId: string, input: CopilotProposalRequest, actor: Actor, context: Pick<DecisionContext, "actor">, sink: Sink = {}) =>
      once(`propose:${companyId}:${input.idempotencyKey}:${actor.actorType}:${actor.actorId}:${hashRequest({ draftId: input.draftId ?? null, baseVersion: input.baseVersion ?? null, message: input.message })}`, async () => {
        const inputHash = hashRequest({ draftId: input.draftId ?? null, baseVersion: input.baseVersion ?? null, message: input.message });
        const first = await read(companyId);
        const replay = findByKey(first.journey, input.idempotencyKey);
        const replayResult = (found: NonNullable<typeof replay>, journey: Journey, revision: number) => ({
          status: "saved" as const, replayed: true, journey, revision, draftId: found.draft.id, version: found.version.version, serverNow: new Date().toISOString(), diff: [] as ReturnType<typeof selectionDiff>,
        });
        if (replay) {
          const savedHash = replay.version.proposal?.inputHash;
          if ((savedHash && savedHash !== inputHash) || (!savedHash && replay.version.proposal?.message !== input.message))
            throw conflict("This idempotency key was already used for different copilot input.", { code: "copilot_idempotency_conflict" });
          if (input.draftId && replay.draft.id !== input.draftId) throw conflict("This idempotency key belongs to another draft.", { code: "copilot_idempotency_conflict" });
          await assertReplayOwner(companyId, COPILOT_PROPOSAL_FEATURE, input.idempotencyKey, inputHash, actor);
          return replayResult(replay, first.journey, first.revision);
        }
        if (first.revision !== input.expectedRevision) throw conflict("Onboarding changed. Reload before asking the copilot.", { code: "onboarding_revision_conflict", currentRevision: first.revision });

        const drafts = first.journey.builderDrafts ?? [];
        const target = input.draftId ? drafts.find((item) => item.id === input.draftId) : undefined;
        if (input.draftId && !target) throw notFound("Builder draft not found.", { code: "builder_draft_not_found" });
        if (target && target.versions.length >= 10) throw conflict("This draft reached its 10-version limit. Clone it to continue.", { code: "builder_version_limit" });
        if (!target && drafts.length >= 20) throw conflict("This company reached its 20 saved draft limit.", { code: "builder_draft_limit" });
        const base = target ? (input.baseVersion ? target.versions.find((item) => item.version === input.baseVersion) : target.versions.at(-1)) : undefined;
        if (target && !base) throw notFound("Builder draft version not found.", { code: "builder_version_not_found" });

        const catalog = await loadCatalog(companyId);
        const history = (target?.versions ?? []).map((item) => item.proposal?.message ?? item.description).slice(-5).map((text) => text.slice(0, 500));
        const request = proposalRequest(input.message, catalog, history, base?.selection ?? null);
        const claim = await claimRequest(COPILOT_PROPOSAL_FEATURE, input.idempotencyKey, inputHash, actor, { companyId, input: { draftId: input.draftId ?? null, baseVersion: input.baseVersion ?? null, message: input.message }, catalog, request });
        const originalPayload = claim.request as { request: DecisionRequest; catalog: Catalog };
        const effectiveRequest = originalPayload.request;
        const effectiveCatalog = originalPayload.catalog;
        const invoked = await invokeOrResume(claim, companyId, COPILOT_PROPOSAL_FEATURE, () => decisions.decide({ companyId, actor: context.actor, feature: proposalFeature }, effectiveRequest, sink.signal));
        const result = invoked.result;
        const identity = invoked.identity;
        if (claim.kind === "completed") {
          if (result.status === "succeeded") throw conflict("The completed model request has no saved draft; it will not be invoked again.", { code: "copilot_request_outcome_unknown", invocationId: result.invocationId });
          return failure(result);
        }
        if (result.status !== "succeeded") return failure(result);

        const interpreted = interpret(result.answers, effectiveCatalog);
        if (!interpreted) return { status: "failed" as const, errorCode: "incomplete_model_response", invocationId: result.invocationId };
        await validateSelection(companyId, interpreted.selection);

        const latest = await read(companyId);
        const raced = findByKey(latest.journey, input.idempotencyKey);
        if (raced) return replayResult(raced, latest.journey, latest.revision);
        if (latest.revision !== input.expectedRevision) throw conflict("Onboarding changed while the model was answering. The answer was paid and is in decision history; ask again after reloading.", { code: "onboarding_revision_conflict", currentRevision: latest.revision, invocationId: result.invocationId });

        const now = new Date().toISOString();
        const invocationIdentity = identity ?? await invocationIdentityFor(claim.id, companyId, result.invocationId, COPILOT_PROPOSAL_FEATURE);
        const live = latest.journey.builderDrafts ?? [];
        const liveTarget = target ? live.find((item) => item.id === target.id) : undefined;
        if (target && (!liveTarget || liveTarget.versions.length >= 10)) throw conflict("The draft changed while the model was answering.", { code: "onboarding_revision_conflict", currentRevision: latest.revision, invocationId: result.invocationId });
        const version: BuilderDraftVersion = {
          version: (liveTarget?.versions.length ?? 0) + 1, createdAt: now, description: input.message, selection: interpreted.selection, plan: interpreted.plan, provenance: "model_proposed",
          proposal: {
            idempotencyKey: input.idempotencyKey, inputHash, message: input.message, feature: COPILOT_PROPOSAL_FEATURE, invocationId: result.invocationId, ...invocationIdentity, decidedAt: now,
            catalogDigest: digest(effectiveCatalog), request: effectiveRequest, answers: result.answers, usage: result.usage, baseline: liveTarget && base ? { draftId: liveTarget.id, version: base.version } : null,
          },
        };
        const draftId = liveTarget?.id ?? randomUUID();
        const nextDrafts: BuilderDraft[] = liveTarget
          ? live.map((item) => item.id === draftId ? { ...item, versions: [...item.versions, version] } : item)
          : [...live, { id: draftId, createdAt: now, versions: [version] }];
        const next = onboardingJourneySchema.parse({ ...latest.journey, builderDrafts: nextDrafts });
        const revision = await save(companyId, latest.revision, next, actor, "productization.builder.copilot_proposed");
        await completeRequest(claim.id, companyId, result);
        return { status: "saved" as const, replayed: false, journey: next, revision, draftId, version: version.version, serverNow: now, diff: selectionDiff(base?.selection ?? null, interpreted.selection, base?.plan, interpreted.plan) };
      }),

    /** Computes and records the governed change set. Nothing is created here; the caller creates each ready change with its own API permissions. */
    planApplication: async (companyId: string, input: CopilotApplyPlanRequest, actor: Actor) => {
      const { journey, revision } = await read(companyId);
      const draft = (journey.builderDrafts ?? []).find((item) => item.id === input.draftId);
      if (!draft) throw notFound("Builder draft not found.", { code: "builder_draft_not_found" });
      const existing = draft.applications?.find((item) => item.idempotencyKey === input.idempotencyKey);
      if (existing) return { journey, revision, application: existing, replayed: true, serverNow: new Date().toISOString() };
      if (revision !== input.expectedRevision) throw conflict("Onboarding changed. Reload before applying.", { code: "onboarding_revision_conflict", currentRevision: revision });
      const version = draft.versions.find((item) => item.version === input.version);
      if (!version) throw notFound("Builder draft version not found.", { code: "builder_version_not_found" });
      if (version.version !== draft.versions.at(-1)!.version) throw conflict("Only the latest version can be applied. Open the latest version or clone this one.", { code: "builder_version_not_latest" });
      if ((draft.applications?.length ?? 0) >= 20) throw conflict("This draft reached its 20 application limit. Clone it to continue.", { code: "builder_application_limit" });
      if (!validTimezone(input.timezone)) throw unprocessable("Enter a valid IANA time zone.", { code: "builder_timezone_invalid" });
      await validateSelection(companyId, version.selection);
      const [agent] = await db.select({ id: agents.id, status: agents.status }).from(agents).where(and(eq(agents.companyId, companyId), eq(agents.id, input.assigneeAgentId), inArray(agents.status, ["active", "idle", "running"])));
      if (!agent) throw unprocessable("Choose an active agent from this company.", { code: "builder_agent_not_available" });

      const applicationId = randomUUID();
      const changes: BuilderApplicationChange[] = [];
      for (const routine of version.plan?.routines ?? []) {
        if (routine.template === "daily_brief") {
          const changeId = "routine_daily_brief";
          const label = `${String(routine.hour).padStart(2, "0")}:${String(routine.minute).padStart(2, "0")}`;
          changes.push({
            changeId, kind: "routine", status: "ready", summary: `Crear la rutina «Resumen diario» a las ${label} (${input.timezone}).`,
            diff: ["crear una rutina interna nueva", "asignarla al agente elegido", "usar el gate require_external_activity", "crear un horario diario"],
            spec: {
              routine: { title: "Resumen diario", description: `Prepare a concise, internal daily summary from the company's current Paperclip work and metrics. Create an issue with the summary for human review. Do not send messages, contact customers, publish content, or change external records. ${routineMarker(applicationId, changeId)}`, assigneeAgentId: agent.id, status: "active", activityGatePolicy: "require_external_activity", activityGateScope: "company", priority: "medium", concurrencyPolicy: "coalesce_if_active", catchUpPolicy: "skip_missed", variables: [] },
              trigger: { kind: "schedule", label: `Diario ${label}`, cronExpression: `${routine.minute} ${routine.hour} * * *`, timezone: input.timezone, enabled: true },
            },
          });
        } else {
          const changeId = "routine_lead_notification";
          changes.push({
            changeId, kind: "routine", status: "ready", summary: "Crear la rutina «Aviso de nuevo lead» en pausa con un disparador API; el aviso será una tarea interna.",
            diff: ["crear una rutina interna en pausa", "asignarla al agente elegido", "crear un disparador API sin secretos compartidos"],
            spec: {
              routine: { title: "Aviso de nuevo lead", description: `When an incoming lead is reported, prepare an internal notification issue summarizing the lead for human review. Do not contact the lead, send external messages, or change external records. ${routineMarker(applicationId, changeId)}`, assigneeAgentId: agent.id, status: "paused", priority: "medium", concurrencyPolicy: "coalesce_if_active", catchUpPolicy: "skip_missed", variables: [] },
              trigger: { kind: "api", label: "Lead entrante", enabled: true },
            },
          });
          changes.push({ changeId: "lead_notification_channel", kind: "channel_request", status: "blocked", summary: "Canal externo del aviso (correo o mensajería).", blocker: "Hace falta una conexión autorizada en Apps. El constructor no crea canales ni credenciales; hasta entonces el aviso solo existe como tarea interna.", diff: [] });
          changes.push({ changeId: "lead_notification_source", kind: "request_only", status: "request_only", summary: "Enlazar la entrada de leads con el disparador API de la rutina.", blocker: "Esta aplicación no conecta formularios ni fuentes de leads; la rutina queda en pausa hasta que una persona la active.", diff: [] });
        }
      }
      changes.push({
        changeId: "agent_request", kind: "request_only", status: "request_only", summary: "Rol, skills, conexiones, autonomía y presupuesto quedan como solicitud en la versión; no se contrata, no se otorgan permisos y no se asigna presupuesto.",
        diff: [`rol: ${version.selection.role}`, `skills: ${version.selection.skillIds.length}`, `conexiones: ${version.selection.connectionIds.length}`, `autonomía solicitada: ${version.selection.autonomy}`, `presupuesto solicitado: ${version.selection.monthlyBudgetUsd} USD/mes`],
      });
      if (version.plan?.playbookId) changes.push({ changeId: "playbook_request", kind: "request_only", status: "request_only", summary: "Playbook propuesto; se activa desde su propia pantalla.", diff: [`playbook: ${version.plan.playbookId}`] });

      const application: BuilderApplication = { id: applicationId, idempotencyKey: input.idempotencyKey, version: version.version, createdAt: new Date().toISOString(), assigneeAgentId: agent.id, timezone: input.timezone, changes, results: [] };
      const nextDrafts = (journey.builderDrafts ?? []).map((item) => item.id === draft.id ? { ...item, applications: [...(item.applications ?? []), application] } : item);
      const next = onboardingJourneySchema.parse({ ...journey, builderDrafts: nextDrafts });
      const nextRevision = await save(companyId, revision, next, actor, "productization.builder.copilot_application_planned");
      return { journey: next, revision: nextRevision, application, replayed: false, serverNow: application.createdAt };
    },

    /** One transaction owns both canonical routine creation and its receipt.
     * Retries return the receipt; a lost response cannot create another routine. */
    applyChange: async (companyId: string, input: CopilotApplyChangeRequest, actor: Actor) => {
      const publications: ActivityPublication[] = [];
      const result = await db.transaction(async (tx) => {
      await tx.select({ companyId: productizationOnboarding.companyId }).from(productizationOnboarding)
        .where(eq(productizationOnboarding.companyId, companyId)).for("update");
      const txDb = tx as unknown as Db;
      const persistence = productizationDescriptionBuilderService(txDb).internals;
      const { journey, revision } = await persistence.read(companyId);
      const draft = (journey.builderDrafts ?? []).find(item => item.id === input.draftId);
      const application = draft?.applications?.find(item => item.id === input.applicationId);
      if (!draft || !application) throw notFound("Configuration application not found");
      const prior = application.results.find(item => item.changeId === input.changeId && item.outcome !== "failed");
      if (prior) return { journey, revision, application, replayed: true, serverNow: new Date().toISOString() };
      if (revision !== input.expectedRevision) throw conflict("Configuration changed. Reload before applying", { code: "onboarding_revision_conflict", currentRevision: revision });
      if (application.version !== draft.versions.at(-1)?.version) throw conflict("This application refers to an older draft version");
      const change = application.changes.find(item => item.changeId === input.changeId);
      if (!change || change.status !== "ready" || change.kind !== "routine" || !change.spec) throw unprocessable("This change requires configuration in its own settings page");
      const version = draft.versions.find(item => item.version === application.version)!;
      await persistence.validateSelection(companyId, version.selection);
      const routines = routineService(txDb);
      const routine = await routines.create(companyId, createRoutineSchema.parse(change.spec.routine), { userId: actor.actorId, agentId: null, runId: null });
      const trigger = await routines.createTrigger(routine.id, createRoutineTriggerSchema.parse(change.spec.trigger), { userId: actor.actorId, agentId: null, runId: null });
      const recordedAt = new Date().toISOString();
      const updated: BuilderApplication = { ...application, results: [...application.results.filter(item => item.changeId !== input.changeId), { changeId: input.changeId, outcome: "created", routineId: routine.id, triggerId: trigger.trigger.id, recordedAt }] };
      const next = onboardingJourneySchema.parse({ ...journey, builderDrafts: (journey.builderDrafts ?? []).map(item => item.id === draft.id ? { ...item, applications: (item.applications ?? []).map(app => app.id === application.id ? updated : app) } : item) });
      const nextRevision = await persistence.save(companyId, revision, next, actor, "productization.builder.copilot_change_applied", publications);
      return { journey: next, revision: nextRevision, application: updated, replayed: false, serverNow: recordedAt };
      });
      publications.forEach(publishActivity);
      return result;
    },

    /**
     * Conversational dry run. The model only answers questions about how the configured role would behave;
     * no tool, connection, message or routine is touched and the result never qualifies autonomy.
     */
    sandbox: (companyId: string, input: CopilotSandboxRequest, actor: Actor, context: Pick<DecisionContext, "actor">, sink: Sink = {}) =>
      once(`sandbox:${companyId}:${input.idempotencyKey}:${actor.actorType}:${actor.actorId}:${hashRequest({ draftId: input.draftId, version: input.version, scenario: input.scenario })}`, async () => {
        const inputHash = hashRequest({ draftId: input.draftId, version: input.version, scenario: input.scenario });
        const first = await read(companyId);
        const draft = (first.journey.builderDrafts ?? []).find((item) => item.id === input.draftId);
        if (!draft) throw notFound("Builder draft not found.", { code: "builder_draft_not_found" });
        const prior = draft.sandboxRuns?.find((item) => item.idempotencyKey === input.idempotencyKey);
        if (prior) {
          if ((prior.inputHash && prior.inputHash !== inputHash) || (!prior.inputHash && (prior.version !== input.version || prior.scenario !== input.scenario)))
            throw conflict("This idempotency key was already used for different dry-run input.", { code: "copilot_idempotency_conflict" });
          await assertReplayOwner(companyId, COPILOT_SANDBOX_FEATURE, input.idempotencyKey, inputHash, actor);
          return { status: "saved" as const, replayed: true, run: prior, journey: first.journey, revision: first.revision, serverNow: new Date().toISOString() };
        }
        if (first.revision !== input.expectedRevision) throw conflict("Onboarding changed. Reload before running the dry run.", { code: "onboarding_revision_conflict", currentRevision: first.revision });
        const version = draft.versions.find((item) => item.version === input.version);
        if (!version) throw notFound("Builder draft version not found.", { code: "builder_version_not_found" });
        const request: DecisionRequest = {
          state: { mode: "dry_run", note: "Nothing is executed. Describe only what the configured assistant would decide to do first.", role: version.selection.role, autonomy: version.selection.autonomy, scenario: input.scenario },
          questions: {
            first_action: { type: "choice", instructions: "Given the role and autonomy, what would the assistant do first for this scenario?", criteria: SANDBOX_ACTIONS },
            needs_approval: { type: "boolean", instructions: "Would a person have to approve before anything leaves the company?" },
            contacts_externally: { type: "boolean", instructions: "Would the assistant try to contact someone outside the company?" },
          },
        };
        const claim = await claimRequest(COPILOT_SANDBOX_FEATURE, input.idempotencyKey, inputHash, actor, { companyId, input: { draftId: input.draftId, version: input.version, scenario: input.scenario }, request });
        const effectiveRequest = (claim.request as { request: DecisionRequest }).request;
        const invoked = await invokeOrResume(claim, companyId, COPILOT_SANDBOX_FEATURE, () => decisions.decide({ companyId, actor: context.actor, feature: sandboxFeature }, effectiveRequest, sink.signal));
        const result = invoked.result;
        const identity = invoked.identity;
        if (claim.kind === "completed") {
          if (result.status === "succeeded") throw conflict("The completed model request has no saved dry run; it will not be invoked again.", { code: "copilot_request_outcome_unknown", invocationId: result.invocationId });
          return failure(result);
        }
        if (result.status !== "succeeded") return failure(result);
        if (!choice(result.answers, "first_action", Object.keys(SANDBOX_ACTIONS)) || probability(result.answers, "needs_approval") === null || probability(result.answers, "contacts_externally") === null)
          return { status: "failed" as const, errorCode: "incomplete_model_response", invocationId: result.invocationId };

        const latest = await read(companyId);
        const liveDraft = (latest.journey.builderDrafts ?? []).find((item) => item.id === input.draftId);
        const raced = liveDraft?.sandboxRuns?.find((item) => item.idempotencyKey === input.idempotencyKey);
        if (raced) return { status: "saved" as const, replayed: true, run: raced, journey: latest.journey, revision: latest.revision, serverNow: new Date().toISOString() };
        if (!liveDraft || latest.revision !== input.expectedRevision) throw conflict("Onboarding changed while the model was answering. The answer was paid and is in decision history.", { code: "onboarding_revision_conflict", currentRevision: latest.revision, invocationId: result.invocationId });
        const now = new Date().toISOString();
        const run: BuilderSandboxRun = {
          idempotencyKey: input.idempotencyKey, inputHash, version: version.version, createdAt: now, scenario: input.scenario, feature: COPILOT_SANDBOX_FEATURE, invocationId: result.invocationId, ...(identity ?? await invocationIdentityFor(claim.id, companyId, result.invocationId, COPILOT_SANDBOX_FEATURE)),
          request: effectiveRequest, answers: result.answers, usage: result.usage, toolsExecuted: false, sideEffects: false, qualifiesAutonomy: false,
        };
        const nextDrafts = (latest.journey.builderDrafts ?? []).map((item) => item.id === liveDraft.id ? { ...item, sandboxRuns: [...(item.sandboxRuns ?? []), run].slice(-10) } : item);
        const next = onboardingJourneySchema.parse({ ...latest.journey, builderDrafts: nextDrafts });
        const revision = await save(companyId, latest.revision, next, actor, "productization.builder.copilot_sandbox_run");
        await completeRequest(claim.id, companyId, result);
        return { status: "saved" as const, replayed: false, run, journey: next, revision, serverNow: now };
      }),
  };
}
