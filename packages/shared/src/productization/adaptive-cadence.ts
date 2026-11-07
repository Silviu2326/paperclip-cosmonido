import { z } from "zod";

// A preference for future admission decisions, never execution authority.
const id = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const nonNegativeCount = z.number().int().nonnegative();
const positiveCount = z.number().int().positive();

export const cadenceSettingsSchema = z.object({
  scheduledChecksPerDay: nonNegativeCount,
  maxConsecutiveCycles: positiveCount,
}).strict();

const activeChangeSchema = z.object({
  proposalId: id,
  startsAt: timestamp,
  endsAt: timestamp,
  settings: cadenceSettingsSchema,
}).strict().refine((change) => Date.parse(change.startsAt) < Date.parse(change.endsAt), {
  message: "A temporary cadence must have a positive duration",
  path: ["endsAt"],
});

export const cadencePolicySchema = z.object({
  version: z.literal(1),
  companyId: id,
  agentId: id,
  revision: nonNegativeCount,
  base: cadenceSettingsSchema,
  ceilings: cadenceSettingsSchema,
  maxChangeDurationMs: positiveCount,
  manualPaused: z.boolean(),
  eventWakeupsEnabled: z.boolean(),
  activeChange: activeChangeSchema.nullable(),
}).strict().superRefine((policy, ctx) => {
  const candidates = [policy.base, ...(policy.activeChange ? [policy.activeChange.settings] : [])];
  if (candidates.some((settings) => !withinCeilings(settings, policy.ceilings))) {
    ctx.addIssue({ code: "custom", message: "Cadence exceeds the policy ceilings" });
  }
  if (policy.activeChange && Date.parse(policy.activeChange.endsAt) -
      Date.parse(policy.activeChange.startsAt) > policy.maxChangeDurationMs) {
    ctx.addIssue({ code: "custom", message: "Temporary cadence exceeds the allowed duration" });
  }
});

export const cadenceProposalSchema = z.object({
  version: z.literal(1),
  id,
  companyId: id,
  agentId: id,
  proposedByAgentId: id,
  basePolicyRevision: nonNegativeCount,
  reason: z.string().trim().min(1).max(4_000),
  expectedEffect: z.string().trim().min(1).max(4_000),
  evidenceReferences: z.array(id).min(1).max(40),
  createdAt: timestamp,
  decisionDeadline: timestamp,
  startsAt: timestamp,
  endsAt: timestamp,
  settings: cadenceSettingsSchema,
}).strict().superRefine((proposal, ctx) => {
  const created = Date.parse(proposal.createdAt);
  const deadline = Date.parse(proposal.decisionDeadline);
  const starts = Date.parse(proposal.startsAt);
  const ends = Date.parse(proposal.endsAt);
  if (!(created < deadline && deadline <= starts && starts < ends)) {
    ctx.addIssue({ code: "custom", message: "Proposal dates must follow creation, deadline, start, end order" });
  }
});

export type CadenceSettings = z.infer<typeof cadenceSettingsSchema>;
export type CadencePolicy = z.infer<typeof cadencePolicySchema>;
export type CadenceProposal = z.infer<typeof cadenceProposalSchema>;

function withinCeilings(settings: CadenceSettings, ceilings: CadenceSettings): boolean {
  return settings.scheduledChecksPerDay <= ceilings.scheduledChecksPerDay &&
    settings.maxConsecutiveCycles <= ceilings.maxConsecutiveCycles;
}

export type EffectiveCadence =
  | { kind: "held"; reason: "invalid_policy_or_clock" }
  | {
      kind: "preferences";
      source: "base" | "temporary_change" | "manual_pause";
      scheduledChecksPerDay: number;
      maxConsecutiveCycles: number;
      eventWakeupsEnabled: boolean;
      activeProposalId: string | null;
    };

/**
 * Expiry restores the base preference without a timer or a DB write. A manual
 * pause suppresses both timer and event preferences. This does not stop an
 * in-flight provider, schedule work, or grant permission to continue a run.
 */
export function getEffectiveCadence(policyInput: unknown, nowInput: unknown): EffectiveCadence {
  const policyResult = cadencePolicySchema.safeParse(policyInput);
  const clockResult = timestamp.safeParse(nowInput);
  if (!policyResult.success || !clockResult.success) {
    return { kind: "held", reason: "invalid_policy_or_clock" };
  }
  const policy = policyResult.data;
  if (policy.manualPaused) {
    return {
      kind: "preferences", source: "manual_pause", scheduledChecksPerDay: 0,
      maxConsecutiveCycles: 0, eventWakeupsEnabled: false, activeProposalId: null,
    };
  }
  const now = Date.parse(clockResult.data);
  const change = policy.activeChange;
  const active = change && Date.parse(change.startsAt) <= now && now < Date.parse(change.endsAt)
    ? change : null;
  return {
    kind: "preferences",
    source: active ? "temporary_change" : "base",
    ...(active?.settings ?? policy.base),
    eventWakeupsEnabled: policy.eventWakeupsEnabled,
    activeProposalId: active?.proposalId ?? null,
  };
}

const resolutionSchema = z.object({
  policy: cadencePolicySchema,
  proposal: cadenceProposalSchema,
  outcome: z.enum(["approve", "reject"]),
  now: timestamp,
  /** Loaded from authenticated server context, never from a model or HTTP body. */
  actor: z.object({ companyId: id, userId: id, canManageCadence: z.boolean() }).strict(),
}).strict();

export type CadenceResolution =
  | { kind: "blocked"; reason:
      "invalid_data" | "scope_mismatch" | "permission_denied" | "stale_revision" |
      "decision_window_closed" | "policy_limit_exceeded" | "active_change_exists" }
  | {
      kind: "decision_to_persist";
      decision: {
        proposalId: string;
        companyId: string;
        agentId: string;
        userId: string;
        outcome: "approve" | "reject";
        resolvedAt: string;
      };
      /** CAS and decision uniqueness must both hold in the owning transaction. */
      expectedPolicyRevision: number;
      policyToPersist: CadencePolicy;
    };

/**
 * Prepares a human decision without persisting or executing it. The server must
 * validate evidence/proposer ownership and current authority, then atomically
 * claim the pending proposal and compare-and-swap the policy revision. Budget,
 * plan allowance, pause/Stop, single-assignee checkout and external-action gates
 * remain separate checks at every admission/dispatch/continuation.
 */
export function resolveCadenceProposal(input: unknown): CadenceResolution {
  const parsed = resolutionSchema.safeParse(input);
  if (!parsed.success) return { kind: "blocked", reason: "invalid_data" };
  const { policy, proposal, actor, outcome, now } = parsed.data;
  if (policy.companyId !== proposal.companyId || policy.agentId !== proposal.agentId ||
      actor.companyId !== policy.companyId) {
    return { kind: "blocked", reason: "scope_mismatch" };
  }
  if (!actor.canManageCadence) return { kind: "blocked", reason: "permission_denied" };
  if (proposal.basePolicyRevision !== policy.revision) {
    return { kind: "blocked", reason: "stale_revision" };
  }
  const instant = Date.parse(now);
  if (instant < Date.parse(proposal.createdAt) || instant >= Date.parse(proposal.decisionDeadline)) {
    return { kind: "blocked", reason: "decision_window_closed" };
  }
  // V1 has a single temporary change. Never silently replace an active or
  // scheduled change: doing so could discard the currently approved cadence.
  if (outcome === "approve" && policy.activeChange && instant < Date.parse(policy.activeChange.endsAt)) {
    return { kind: "blocked", reason: "active_change_exists" };
  }
  // A rejection remains possible even if policy ceilings changed after drafting.
  if (outcome === "approve" && (!withinCeilings(proposal.settings, policy.ceilings) ||
      Date.parse(proposal.endsAt) - Date.parse(proposal.startsAt) > policy.maxChangeDurationMs ||
      !Number.isSafeInteger(policy.revision + 1))) {
    return { kind: "blocked", reason: "policy_limit_exceeded" };
  }
  return {
    kind: "decision_to_persist",
    decision: {
      proposalId: proposal.id, companyId: policy.companyId, agentId: policy.agentId,
      userId: actor.userId, outcome, resolvedAt: now,
    },
    expectedPolicyRevision: policy.revision,
    policyToPersist: outcome === "reject" ? policy : {
      ...policy,
      revision: policy.revision + 1,
      activeChange: {
        proposalId: proposal.id, startsAt: proposal.startsAt,
        endsAt: proposal.endsAt, settings: proposal.settings,
      },
    },
  };
}
