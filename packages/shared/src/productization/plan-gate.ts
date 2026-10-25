import { z } from "zod";

/** Plan entitlements are capacity limits, never permissions or spend budgets. */
export const PLAN_GATE_METRICS = [
  "companies",
  "agents",
  "jobs_per_month",
  "video_minutes",
  "messages",
  "connections",
] as const;

export type PlanGateMetric = (typeof PLAN_GATE_METRICS)[number];
export type PlanGatePeriod =
  | { kind: "current_capacity"; observedAt: string }
  | { kind: "calendar_month"; start: string; end: string };

const nonEmptyId = z.string().trim().min(1);
const count = z.number().finite().nonnegative().int().max(Number.MAX_SAFE_INTEGER);
const quantityFor = (metric: PlanGateMetric) =>
  metric === "video_minutes"
    ? z.number().finite().nonnegative()
    : count;

const periodSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("current_capacity"),
    observedAt: z.string().datetime({ offset: true }),
  }).strict(),
  z
    .object({
      kind: z.literal("calendar_month"),
      start: z.string().datetime({ offset: true }),
      end: z.string().datetime({ offset: true }),
    })
    .strict()
    .refine(({ start, end }) => {
      const startMs = Date.parse(start);
      const endMs = Date.parse(end);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

      const canonicalStart = new Date(startMs);
      canonicalStart.setUTCDate(1);
      canonicalStart.setUTCHours(0, 0, 0, 0);
      const canonicalEnd = new Date(canonicalStart.getTime());
      canonicalEnd.setUTCMonth(canonicalEnd.getUTCMonth() + 1);
      if (!Number.isFinite(canonicalStart.getTime()) || !Number.isFinite(canonicalEnd.getTime())) {
        return false;
      }
      return start === canonicalStart.toISOString() && end === canonicalEnd.toISOString();
    }, {
      message: "calendar month must use canonical UTC month boundaries",
      path: ["end"],
    }),
]);

const limitsSchema = z
  .object({
    companies: count.nullable(),
    agents: count.nullable(),
    jobs_per_month: count.nullable(),
    video_minutes: z.number().finite().nonnegative().nullable(),
    messages: count.nullable(),
    connections: count.nullable(),
  })
  .strict();

const accountSchema = z
  .object({
    id: nonEmptyId,
    planId: nonEmptyId,
    /** Product access state normalized by the server, independent of billing provider. */
    access: z.enum(["active", "trial_eligible", "inactive"]),
    /** Companies currently owned by this billing account. */
    companyIds: z.array(nonEmptyId).max(100_000),
  })
  .strict()
  .refine(({ companyIds }) => new Set(companyIds).size === companyIds.length, {
    message: "companyIds must be unique",
    path: ["companyIds"],
  });

const planSchema = z
  .object({ id: nonEmptyId, name: z.string().trim().min(1), limits: limitsSchema })
  .strict();

const usageSchema = z
  .object({
    accountId: nonEmptyId,
    metric: z.enum(PLAN_GATE_METRICS),
    period: periodSchema,
    consumed: z.number().finite().nonnegative(),
  })
  .strict();

const requestSchema = z
  .object({
    metric: z.enum(PLAN_GATE_METRICS),
    /** Required to attribute the operation within an account; null only for creating a company. */
    companyId: nonEmptyId.nullable(),
    requested: z.number().finite().positive(),
    period: periodSchema,
  })
  .strict();

const evaluationSchema = z.object({
  /** Current server time; keeps the decision deterministic and rejects stale/future snapshots. */
  now: z.string().datetime({ offset: true }),
  /** Server-configured freshness window for current-capacity snapshots. */
  maxCapacitySnapshotAgeMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

export const planGateInputSchema = z
  .object({ account: accountSchema, plan: planSchema, usage: usageSchema, request: requestSchema, evaluation: evaluationSchema })
  .strict();

export type PlanGateAccount = z.infer<typeof accountSchema>;
export type PlanGatePlan = z.infer<typeof planSchema>;
export type PlanGateUsage = z.infer<typeof usageSchema>;
export type PlanGateRequest = z.infer<typeof requestSchema>;
export type PlanGateInput = z.infer<typeof planGateInputSchema>;

export type PlanGateDenialCode =
  | "plan_gate_data_incomplete"
  | "plan_gate_scope_mismatch"
  | "plan_gate_account_inactive"
  | "plan_gate_limit_reached";

export type PlanGateResult =
  | {
      allowed: true;
      metric: PlanGateMetric;
      consumed: number;
      requested: number;
      projected: number;
      limit: number | null;
      utilizationPercent: number | null;
      notices: Array<80 | 100>;
    }
  | {
      allowed: false;
      code: PlanGateDenialCode;
      metric: PlanGateMetric | null;
      upgradePath?: "/billing";
      limit: number | null;
      consumed: number | null;
      requested: number | null;
      projected: number | null;
      utilizationPercent: number | null;
    };

function denied(
  code: PlanGateDenialCode,
  metric: PlanGateMetric | null = null,
  values: Partial<Pick<Extract<PlanGateResult, { allowed: false }>,
    "limit" | "consumed" | "requested" | "projected" | "utilizationPercent">> = {},
): PlanGateResult {
  return {
    allowed: false,
    code,
    metric,
    ...(code === "plan_gate_limit_reached" ? { upgradePath: "/billing" as const } : {}),
    limit: values.limit ?? null,
    consumed: values.consumed ?? null,
    requested: values.requested ?? null,
    projected: values.projected ?? null,
    utilizationPercent: values.utilizationPercent ?? null,
  };
}

/**
 * Evaluate one account-wide plan meter. The caller must supply current,
 * aggregate usage for that account and period; capacity usage is a fresh
 * current-state snapshot, not a historical creation count. This function does no
 * I/O, reservation, mutation, permission check, or budget check.
 */
export function evaluatePlanGate(input: unknown): PlanGateResult {
  const parsed = planGateInputSchema.safeParse(input);
  if (!parsed.success) {
    return denied("plan_gate_data_incomplete");
  }

  const { account, plan, usage, request, evaluation } = parsed.data;
  if (account.access !== "active" && account.access !== "trial_eligible") {
    return denied("plan_gate_account_inactive", request.metric);
  }
  if (account.planId !== plan.id || usage.accountId !== account.id || usage.metric !== request.metric) {
    return denied("plan_gate_data_incomplete", request.metric);
  }

  if (request.metric === "companies" ? request.companyId !== null :
    request.companyId === null || !account.companyIds.includes(request.companyId)) {
    return denied("plan_gate_scope_mismatch", request.metric);
  }

  const metric = request.metric;
  const isCapacity = metric === "companies" || metric === "agents" || metric === "connections";
  const expectedPeriod = isCapacity ? "current_capacity" : "calendar_month";
  if (usage.period.kind !== expectedPeriod || request.period.kind !== expectedPeriod ||
    usage.period.kind !== request.period.kind ||
    (usage.period.kind === "calendar_month" && request.period.kind === "calendar_month" &&
      (usage.period.start !== request.period.start || usage.period.end !== request.period.end)) ||
    (usage.period.kind === "current_capacity" && request.period.kind === "current_capacity" &&
      usage.period.observedAt !== request.period.observedAt)) {
    return denied("plan_gate_data_incomplete", metric);
  }

  const nowMs = Date.parse(evaluation.now);
  if (usage.period.kind === "calendar_month") {
    if (nowMs < Date.parse(usage.period.start) || nowMs >= Date.parse(usage.period.end)) {
      return denied("plan_gate_data_incomplete", metric);
    }
  } else {
    const observedAtMs = Date.parse(usage.period.observedAt);
    const ageMs = nowMs - observedAtMs;
    if (ageMs < 0 || ageMs > evaluation.maxCapacitySnapshotAgeMs) {
      return denied("plan_gate_data_incomplete", metric);
    }
  }

  const consumedResult = quantityFor(metric).safeParse(usage.consumed);
  const requestedResult = quantityFor(metric).safeParse(request.requested);
  if (!consumedResult.success || !requestedResult.success) {
    return denied("plan_gate_data_incomplete", metric);
  }
  const consumed = consumedResult.data;
  const requested = requestedResult.data;
  const projected = consumed + requested;
  if (!Number.isFinite(projected) || projected <= consumed ||
      (metric !== "video_minutes" && !Number.isSafeInteger(projected))) {
    return denied("plan_gate_data_incomplete", metric);
  }
  const limit = plan.limits[metric];
  const rawUtilizationPercent = limit === null || limit === 0 ? null : (projected / limit) * 100;
  const utilizationPercent = rawUtilizationPercent === null
    ? null
    : Number.isFinite(rawUtilizationPercent) ? rawUtilizationPercent : Number.MAX_VALUE;

  if (limit !== null && projected > limit) {
    return denied("plan_gate_limit_reached", metric, {
      limit, consumed, requested, projected, utilizationPercent,
    });
  }

  const notices: Array<80 | 100> = [];
  if (limit !== null && limit > 0) {
    if (projected >= limit) notices.push(100);
    else if (projected / limit >= 0.8) notices.push(80);
  }

  return {
    allowed: true,
    metric,
    consumed,
    requested,
    projected,
    limit,
    utilizationPercent,
    notices,
  };
}
