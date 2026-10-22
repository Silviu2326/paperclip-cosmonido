import { and, asc, desc, eq, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, agreementPeriods, proposals, serviceAgreements } from "@paperclipai/db";
import type {
  AgreementPeriodKind,
  CreateServiceAgreementInput,
  ServiceAgreementDeliverable,
  UpdateServiceAgreementInput,
  UpsellSuggestInput,
} from "@paperclipai/shared";
import { badRequest, notFound, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { assignmentService } from "./assignments.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ["active", "notice"] as const;
const EXCLUDED_AGENT_STATUSES = ["terminated", "pending_approval"];

export interface AssignmentForPeriodContext {
  companyId: string;
  agreement: typeof serviceAgreements.$inferSelect;
  period: typeof agreementPeriods.$inferSelect;
  title: string;
  acceptanceCriteria: string;
  budgetCents: number;
  idempotencyKey: string;
}

export interface ServiceAgreementDeps {
  createAssignmentForPeriod?: (ctx: AssignmentForPeriodContext) => Promise<{ goalId: string }>;
  createRenewalProposal?: (ctx: {
    companyId: string;
    agreement: typeof serviceAgreements.$inferSelect;
    period: typeof agreementPeriods.$inferSelect;
  }) => Promise<{ proposalId: string } | null>;
  requestRenewalDecision?: (ctx: {
    companyId: string;
    agreement: typeof serviceAgreements.$inferSelect;
    period: typeof agreementPeriods.$inferSelect;
    proposalId: string;
  }) => Promise<{ decisionId: string } | null>;
  now?: () => Date;
}

export interface TickResult {
  periodsStarted: number;
  periodErrors: Array<{ periodId: string; message: string }>;
  renewalsRequested: number;
}

const SYSTEM_ACTOR = { actorType: "system" as const, actorId: "system" };

/** Adds one billing period to a date. Calendar months are counted in UTC. */
export function addPeriod(start: Date, kind: AgreementPeriodKind): Date {
  const months = kind === "monthly" ? 1 : kind === "quarterly" ? 3 : 12;
  const next = new Date(start.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Human label of the period that starts at `start`: `2026-10`, `2026-T4` or `2026`. */
export function periodLabel(start: Date, kind: AgreementPeriodKind): string {
  const year = start.getUTCFullYear();
  if (kind === "yearly") return `${year}`;
  if (kind === "quarterly") return `${year}-T${Math.floor(start.getUTCMonth() / 3) + 1}`;
  return `${year}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Acceptance criteria of one period, one checklist line per deliverable. */
export function renderPeriodAcceptance(deliverables: ServiceAgreementDeliverable[]) {
  return deliverables.map((item) => `- ${item.title}: ${item.acceptanceCriteria}`).join("\n");
}

export function serviceAgreementService(db: Db, deps: ServiceAgreementDeps = {}) {
  const now = deps.now ?? (() => new Date());

  async function latestPeriod(agreementId: string) {
    const [row] = await db
      .select()
      .from(agreementPeriods)
      .where(eq(agreementPeriods.agreementId, agreementId))
      .orderBy(desc(agreementPeriods.periodStart))
      .limit(1);
    return row ?? null;
  }

  /**
   * Plans periods so that the last one covers the agreement end (when there is one), or so that a
   * future period always exists (open-ended agreements). Idempotent: the unique (agreement, start) index
   * makes a second planning pass a no-op.
   */
  async function ensurePeriods(agreement: typeof serviceAgreements.$inferSelect, at: Date) {
    if (!(await latestPeriod(agreement.id))) {
      await db.insert(agreementPeriods).values({
        companyId: agreement.companyId,
        agreementId: agreement.id,
        periodStart: agreement.startsAt,
        periodEnd: addPeriod(agreement.startsAt, agreement.periodKind as AgreementPeriodKind),
        status: "planned",
      }).onConflictDoNothing();
    }
    for (let guard = 0; guard < 600; guard += 1) {
      const last = await latestPeriod(agreement.id);
      if (!last) break;
      const end = agreement.endsAt ? new Date(agreement.endsAt) : null;
      if (end && last.periodEnd.getTime() >= end.getTime()) break;
      const needsNext = end ? true : last.periodStart.getTime() <= at.getTime();
      if (!needsNext) break;
      await db.insert(agreementPeriods).values({
        companyId: agreement.companyId,
        agreementId: agreement.id,
        periodStart: last.periodEnd,
        periodEnd: addPeriod(last.periodEnd, agreement.periodKind as AgreementPeriodKind),
        status: "planned",
      }).onConflictDoNothing();
    }
  }

  async function resolveAssigneeAgentId(companyId: string, explicit: string | null) {
    if (explicit) return explicit;
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), notInArray(agents.status, EXCLUDED_AGENT_STATUSES)))
      .orderBy(asc(agents.createdAt), asc(agents.id))
      .limit(1);
    if (!agent) throw unprocessable("No hay agente disponible para asignar el encargo del periodo");
    return agent.id;
  }

  async function defaultAssignmentForPeriod(ctx: AssignmentForPeriodContext) {
    const assigneeAgentId = await resolveAssigneeAgentId(ctx.companyId, ctx.agreement.assigneeAgentId);
    const assignment = await assignmentService(db).create(ctx.companyId, {
      title: ctx.title,
      acceptanceCriteria: ctx.acceptanceCriteria,
      expectedDeliverable: null,
      budgetCents: ctx.budgetCents,
      projectId: null,
      assigneeAgentId,
      idempotencyKey: ctx.idempotencyKey,
    }, { userId: ctx.agreement.createdByUserId ?? null });
    return { goalId: assignment.id };
  }

  async function createAssignmentForPeriod(agreement: typeof serviceAgreements.$inferSelect, period: typeof agreementPeriods.$inferSelect) {
    const deliverables = agreement.deliverablesPerPeriod ?? [];
    const ctx: AssignmentForPeriodContext = {
      companyId: agreement.companyId,
      agreement,
      period,
      title: `${agreement.title} · ${periodLabel(period.periodStart, agreement.periodKind as AgreementPeriodKind)}`,
      acceptanceCriteria: renderPeriodAcceptance(deliverables) || `- Entregar: ${agreement.title}`,
      budgetCents: deliverables.reduce((sum, item) => sum + (item.budgetCents ?? 0), 0),
      // One assignment per period: the key is stable for the period row, so a replay returns the same goal.
      idempotencyKey: `agreement-period:${period.id}`,
    };
    return (deps.createAssignmentForPeriod ?? defaultAssignmentForPeriod)(ctx);
  }

  async function startDuePeriods(at: Date = now(), options: { companyId?: string } = {}): Promise<TickResult> {
    const conditions = [inArray(serviceAgreements.status, [...ACTIVE_STATUSES])];
    if (options.companyId) conditions.push(eq(serviceAgreements.companyId, options.companyId));
    const agreements = await db.select().from(serviceAgreements).where(and(...conditions));
    const result: TickResult = { periodsStarted: 0, periodErrors: [], renewalsRequested: 0 };

    for (const agreement of agreements) {
      await ensurePeriods(agreement, at);
      const due = await db
        .select()
        .from(agreementPeriods)
        .where(and(
          eq(agreementPeriods.agreementId, agreement.id),
          isNull(agreementPeriods.assignmentGoalId),
          lte(agreementPeriods.periodStart, at),
        ))
        .orderBy(asc(agreementPeriods.periodStart));
      for (const period of due) {
        try {
          const created = await createAssignmentForPeriod(agreement, period);
          await db.update(agreementPeriods).set({
            assignmentGoalId: created.goalId,
            status: "active",
            updatedAt: at,
          }).where(and(eq(agreementPeriods.id, period.id), isNull(agreementPeriods.assignmentGoalId)));
          result.periodsStarted += 1;
          await logActivity(db, {
            companyId: agreement.companyId,
            ...SYSTEM_ACTOR,
            action: "agreement.period_started",
            entityType: "agreement",
            entityId: agreement.id,
            details: { periodId: period.id, periodStart: period.periodStart, assignmentGoalId: created.goalId },
          });
        } catch (error) {
          result.periodErrors.push({ periodId: period.id, message: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    return result;
  }

  /**
   * X days before the end of an auto-renewing agreement, asks for a renewal proposal (WP8) and a decision (WP5).
   * The ids are stored on the last period, so a second run never creates a second proposal for it.
   */
  async function renewalsDue(at: Date = now(), options: { companyId?: string } = {}) {
    const conditions = [inArray(serviceAgreements.status, [...ACTIVE_STATUSES]), eq(serviceAgreements.autoRenew, true)];
    if (options.companyId) conditions.push(eq(serviceAgreements.companyId, options.companyId));
    const agreements = await db.select().from(serviceAgreements).where(and(...conditions));
    let requested = 0;

    for (const agreement of agreements) {
      if (!agreement.endsAt) continue;
      const noticeAt = new Date(agreement.endsAt).getTime() - agreement.noticeDays * DAY_MS;
      if (noticeAt > at.getTime()) continue;
      await ensurePeriods(agreement, at);
      const last = await latestPeriod(agreement.id);
      if (!last) continue;

      let proposalId = last.renewalProposalId;
      let decisionId = last.renewalDecisionId;
      if (!proposalId && deps.createRenewalProposal) {
        const created = await deps.createRenewalProposal({ companyId: agreement.companyId, agreement, period: last });
        if (created) {
          proposalId = created.proposalId;
          await db.update(agreementPeriods).set({ renewalProposalId: proposalId, updatedAt: at }).where(eq(agreementPeriods.id, last.id));
        }
      }
      if (proposalId && !decisionId && deps.requestRenewalDecision) {
        const decision = await deps.requestRenewalDecision({ companyId: agreement.companyId, agreement, period: last, proposalId });
        if (decision) {
          decisionId = decision.decisionId;
          await db.update(agreementPeriods).set({ renewalDecisionId: decisionId, updatedAt: at }).where(eq(agreementPeriods.id, last.id));
        }
      }
      if (agreement.status === "active") {
        await db.update(serviceAgreements).set({ status: "notice", updatedAt: at }).where(eq(serviceAgreements.id, agreement.id));
      }
      if (proposalId || decisionId) {
        requested += 1;
        await logActivity(db, {
          companyId: agreement.companyId,
          ...SYSTEM_ACTOR,
          action: "agreement.renewal_requested",
          entityType: "agreement",
          entityId: agreement.id,
          details: { periodId: last.id, renewalProposalId: proposalId, renewalDecisionId: decisionId },
        });
      }
    }
    return { renewalsRequested: requested };
  }

  async function tick(companyId: string, at: Date = now()): Promise<TickResult> {
    const started = await startDuePeriods(at, { companyId });
    const renewals = await renewalsDue(at, { companyId });
    return { ...started, renewalsRequested: renewals.renewalsRequested };
  }

  async function assertProposalInCompany(companyId: string, proposalId: string | null | undefined) {
    if (!proposalId) return;
    const [row] = await db.select({ id: proposals.id, companyId: proposals.companyId }).from(proposals).where(eq(proposals.id, proposalId));
    if (!row || row.companyId !== companyId) throw notFound("Proposal not found");
  }

  async function assertAgentInCompany(companyId: string, agentId: string | null | undefined) {
    if (!agentId) return;
    const [row] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)));
    if (!row) throw notFound("Assignee agent not found in this company");
  }

  async function create(companyId: string, input: CreateServiceAgreementInput, actor: { userId?: string | null } = {}) {
    if (input.endsAt && input.endsAt.getTime() <= input.startsAt.getTime()) {
      throw badRequest("The agreement end must be after its start");
    }
    await assertProposalInCompany(companyId, input.proposalId);
    await assertAgentInCompany(companyId, input.assigneeAgentId);
    const [agreement] = await db.insert(serviceAgreements).values({
      companyId,
      customerId: input.customerId ?? null,
      proposalId: input.proposalId ?? null,
      title: input.title,
      periodKind: input.periodKind,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      deliverablesPerPeriod: input.deliverablesPerPeriod,
      autoRenew: input.autoRenew,
      noticeDays: input.noticeDays,
      assigneeAgentId: input.assigneeAgentId ?? null,
      createdByUserId: actor.userId ?? null,
    }).returning();
    await ensurePeriods(agreement!, now());
    return agreement!;
  }

  async function update(id: string, input: UpdateServiceAgreementInput) {
    const existing = await getById(id);
    if (!existing) return null;
    if (input.endsAt && input.endsAt.getTime() <= new Date(existing.startsAt).getTime()) {
      throw badRequest("The agreement end must be after its start");
    }
    await assertAgentInCompany(existing.companyId, input.assigneeAgentId);
    const [row] = await db.update(serviceAgreements).set({ ...input, updatedAt: now() }).where(eq(serviceAgreements.id, id)).returning();
    if (row && input.endsAt !== undefined) await ensurePeriods(row, now());
    return row ?? null;
  }

  async function cancel(id: string) {
    const [row] = await db.update(serviceAgreements).set({ status: "cancelled", updatedAt: now() }).where(eq(serviceAgreements.id, id)).returning();
    return row ?? null;
  }

  async function getById(id: string) {
    const [row] = await db.select().from(serviceAgreements).where(eq(serviceAgreements.id, id));
    return row ?? null;
  }

  async function list(companyId: string) {
    return db.select().from(serviceAgreements).where(eq(serviceAgreements.companyId, companyId)).orderBy(desc(serviceAgreements.createdAt));
  }

  async function listPeriods(agreementId: string) {
    return db.select().from(agreementPeriods).where(eq(agreementPeriods.agreementId, agreementId)).orderBy(asc(agreementPeriods.periodStart));
  }

  /** Records a suggestion only. Nothing is sold, priced or sent; the activity entry is the whole effect. */
  async function recordUpsell(companyId: string, input: UpsellSuggestInput, actor: { agentId?: string | null; userId?: string | null } = {}) {
    if (input.agreementId) {
      const agreement = await getById(input.agreementId);
      if (!agreement || agreement.companyId !== companyId) throw notFound("Agreement not found");
    }
    const suggestions = input.suggestions;
    await logActivity(db, {
      companyId,
      actorType: actor.agentId ? "agent" : actor.userId ? "user" : "system",
      actorId: actor.agentId ?? actor.userId ?? "system",
      agentId: actor.agentId ?? null,
      action: "agreement.upsell_suggested",
      entityType: input.agreementId ? "agreement" : "company",
      entityId: input.agreementId ?? companyId,
      details: { customerId: input.customerId ?? null, agreementId: input.agreementId ?? null, suggestions },
    });
    return { suggestions };
  }

  return {
    create,
    update,
    cancel,
    getById,
    list,
    listPeriods,
    startDuePeriods,
    renewalsDue,
    tick,
    recordUpsell,
  };
}

export type ServiceAgreementService = ReturnType<typeof serviceAgreementService>;
