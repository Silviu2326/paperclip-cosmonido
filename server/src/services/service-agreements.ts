import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, agreementPeriods, companyMemberships, decisions, goals, heartbeatRuns, proposals, serviceAgreements } from "@paperclipai/db";
import type {
  AgreementPeriodKind,
  CreateServiceAgreementInput,
  ServiceAgreementDeliverable,
  UpdateServiceAgreementInput,
  UpsellSuggestInput,
} from "@paperclipai/shared";
import { badRequest, conflict, notFound, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { assignmentService } from "./assignments.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ["active", "notice"] as const;

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
  /** Compatibility hooks for callers with an actual authorized run; scheduler tick does not impersonate that run. */
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
  renewalTasksCreated?: number;
  renewalErrors?: Array<{ periodId: string; message: string }>;
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

  async function assertResponsibleUser(companyId: string, userId: string | null) {
    if (!userId) throw unprocessable("El acuerdo no tiene un usuario responsable configurado");
    const [membership] = await db.select({ id: companyMemberships.id }).from(companyMemberships).where(and(
      eq(companyMemberships.companyId, companyId),
      eq(companyMemberships.principalType, "user"),
      eq(companyMemberships.principalId, userId),
      eq(companyMemberships.status, "active"),
    )).limit(1);
    if (!membership) throw unprocessable("El usuario responsable del acuerdo ya no pertenece activamente a la empresa");
  }

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

  async function defaultAssignmentForPeriod(ctx: AssignmentForPeriodContext) {
    const assigneeAgentId = ctx.agreement.assigneeAgentId;
    if (!assigneeAgentId) throw unprocessable("El acuerdo no tiene un agente responsable configurado");
    const [agent] = await db.select({ id: agents.id }).from(agents).where(and(
      eq(agents.id, assigneeAgentId), eq(agents.companyId, ctx.companyId), inArray(agents.status, ["active", "idle", "running"]),
    )).limit(1);
    if (!agent) throw unprocessable("El agente responsable del acuerdo no pertenece a la empresa o no está activo");
    const assignment = await assignmentService(db).create(ctx.companyId, {
      title: ctx.title,
      acceptanceCriteria: ctx.acceptanceCriteria,
      expectedDeliverable: null,
      budgetCents: ctx.budgetCents,
      projectId: null,
      assigneeAgentId,
      idempotencyKey: ctx.idempotencyKey,
    }, { userId: ctx.agreement.createdByUserId ?? null, systemActorId: "service-agreement-period" });
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
    await assertResponsibleUser(agreement.companyId, agreement.createdByUserId);
    if (!agreement.assigneeAgentId) throw unprocessable("El acuerdo no tiene un agente responsable configurado");
    const [agent] = await db.select({ id: agents.id }).from(agents).where(and(
      eq(agents.id, agreement.assigneeAgentId), eq(agents.companyId, agreement.companyId), inArray(agents.status, ["active", "idle", "running"]),
    )).limit(1);
    if (!agent) throw unprocessable("El agente responsable del acuerdo no pertenece a la empresa o no está activo");
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
   * X days before the end of an auto-renewing agreement, creates one assigned preparation task.
   * The agent's real issue run decides whether to create the renewal proposal and WP5 decision.
   */
  async function renewalsDue(at: Date = now(), options: { companyId?: string } = {}) {
    const conditions = [inArray(serviceAgreements.status, [...ACTIVE_STATUSES]), eq(serviceAgreements.autoRenew, true)];
    if (options.companyId) conditions.push(eq(serviceAgreements.companyId, options.companyId));
    const agreements = await db.select().from(serviceAgreements).where(and(...conditions));
    let requested = 0;
    let tasksCreated = 0;
    const errors: Array<{ periodId: string; message: string }> = [];

    for (const agreement of agreements) {
      if (!agreement.endsAt) continue;
      const noticeAt = new Date(agreement.endsAt).getTime() - agreement.noticeDays * DAY_MS;
      if (noticeAt > at.getTime()) continue;
      await ensurePeriods(agreement, at);
      const last = await latestPeriod(agreement.id);
      if (!last) continue;

      if (last.renewalTaskId || last.renewalProposalId || last.renewalDecisionId) continue;

      try {
        // The scheduler may create assigned work, but it cannot impersonate the issue
        // run needed to create a proposal or commercial decision. The agent completes
        // those governed actions from this durable task under its real run authority.
        const assigneeAgentId = agreement.assigneeAgentId;
        await assertResponsibleUser(agreement.companyId, agreement.createdByUserId);
        if (!assigneeAgentId) throw unprocessable("El acuerdo no tiene un agente responsable configurado para la renovación");
        const [agent] = await db.select({ id: agents.id }).from(agents).where(and(
          eq(agents.id, assigneeAgentId), eq(agents.companyId, agreement.companyId), inArray(agents.status, ["active", "idle", "running"]),
        )).limit(1);
        if (!agent) throw unprocessable("El agente responsable del acuerdo no pertenece a la empresa o no está activo");
        const assignment = await assignmentService(db).create(agreement.companyId, {
          title: `Preparar renovación: ${agreement.title}`.slice(0, 200),
          description: [
            `El acuerdo vence el ${agreement.endsAt.toISOString()}.`,
            `Aviso configurado: ${agreement.noticeDays} días.`,
            `Acuerdo: ${agreement.id}; periodo: ${last.id}.`,
            "Revisa el estado de la cuenta y las conversaciones. Si procede, crea una propuesta y una decisión humana (approve_proposal o price_exception) con las herramientas comerciales habituales.",
            `Después registra ambas referencias con POST /api/service-agreements/${agreement.id}/periods/${last.id}/renewal-request usando este run de issue.`,
          ].join("\n"),
          acceptanceCriteria: "- Registrar la recomendación de renovación y sus razones.\n- Si procede, crear una propuesta y una decisión gobernada usando la autoridad de este run.",
          expectedDeliverable: "Recomendación de renovación con propuesta/decisión cuando corresponda",
          budgetCents: 0,
          projectId: null,
          assigneeAgentId,
          idempotencyKey: `agreement-renewal:${agreement.id}:${last.id}`,
        }, { userId: agreement.createdByUserId ?? null, systemActorId: "service-agreement-renewal" });
        const [claimed] = await db.update(agreementPeriods).set({
          renewalTaskId: assignment.id,
          status: "renewal_requested_pending_run",
          updatedAt: at,
        }).where(and(eq(agreementPeriods.id, last.id), isNull(agreementPeriods.renewalTaskId))).returning({ id: agreementPeriods.id });
        if (claimed) {
          requested += 1;
          tasksCreated += 1;
          await logActivity(db, {
            companyId: agreement.companyId,
            ...SYSTEM_ACTOR,
            action: "agreement.renewal_task_created",
            entityType: "agreement",
            entityId: agreement.id,
            details: { periodId: last.id, renewalTaskId: assignment.id },
          });
        }
      } catch (error) {
        errors.push({ periodId: last.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return { renewalsRequested: requested, renewalTasksCreated: tasksCreated, renewalErrors: errors };
  }

  async function tick(companyId: string, at: Date = now()): Promise<TickResult> {
    const started = await startDuePeriods(at, { companyId });
    const renewals = await renewalsDue(at, { companyId });
    return { ...started, renewalsRequested: renewals.renewalsRequested, renewalTasksCreated: renewals.renewalTasksCreated, renewalErrors: renewals.renewalErrors };
  }

  /**
   * Links a renewal proposal and decision after the assigned agent created both from
   * its real issue run. This is the only transition from a pending scheduler handoff
   * to a requested renewal; a scheduler cannot call it because it has no agent/run.
   */
  async function recordRenewalRequest(companyId: string, agreementId: string, periodId: string, input: {
    proposalId: string;
    decisionId: string;
  }, actor: { agentId: string; runId: string }) {
    const [agreement] = await db.select().from(serviceAgreements)
      .where(and(eq(serviceAgreements.id, agreementId), eq(serviceAgreements.companyId, companyId))).limit(1);
    if (!agreement) throw notFound("Service agreement not found");
    const [period] = await db.select().from(agreementPeriods)
      .where(and(eq(agreementPeriods.id, periodId), eq(agreementPeriods.agreementId, agreementId), eq(agreementPeriods.companyId, companyId))).limit(1);
    if (!period || !period.renewalTaskId) throw notFound("Renewal preparation task not found");
    const [task] = await db.select({ rootIssueId: goals.rootIssueId }).from(goals)
      .where(and(eq(goals.id, period.renewalTaskId), eq(goals.companyId, companyId), eq(goals.kind, "assignment"))).limit(1);
    if (!task?.rootIssueId) throw conflict("Renewal preparation task has no issue authority", { code: "renewal_task_unavailable" });
    const [run] = await db.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and(
      eq(heartbeatRuns.id, actor.runId),
      eq(heartbeatRuns.companyId, companyId),
      eq(heartbeatRuns.agentId, actor.agentId),
      eq(heartbeatRuns.issueId, task.rootIssueId),
      eq(heartbeatRuns.status, "running"),
    )).limit(1);
    if (!run) throw conflict("Renewal proposal and decision must be recorded by the assigned task's active agent run", { code: "renewal_run_required" });

    const [proposal] = await db.select({ id: proposals.id, createdByAgentId: proposals.createdByAgentId }).from(proposals)
      .where(and(eq(proposals.id, input.proposalId), eq(proposals.companyId, companyId))).limit(1);
    if (!proposal || proposal.createdByAgentId !== actor.agentId) throw notFound("Renewal proposal not found for this agent in this company");
    const [decision] = await db.select().from(decisions).where(and(
      eq(decisions.id, input.decisionId),
      eq(decisions.companyId, companyId),
      eq(decisions.originAgentId, actor.agentId),
      eq(decisions.originRunId, actor.runId),
      eq(decisions.originIssueId, task.rootIssueId),
      eq(decisions.status, "open"),
    )).limit(1);
    const commercial = (decision?.metadata as { commercial?: { type?: string; subject?: { kind?: string; id?: string } } } | null)?.commercial;
    if (!decision || !["approve_proposal", "price_exception"].includes(commercial?.type ?? "") || commercial?.subject?.kind !== "proposal" || commercial?.subject?.id !== input.proposalId) {
      throw notFound("A commercial decision for this proposal and issue run was not found");
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agreement-renewal-result:${companyId}:${periodId}`}, 0))`);
      const [current] = await tx.select().from(agreementPeriods).where(and(
        eq(agreementPeriods.id, periodId),
        eq(agreementPeriods.companyId, companyId),
      )).for("update").limit(1);
      if (!current) throw notFound("Agreement period not found");
      if (current.renewalProposalId || current.renewalDecisionId) {
        if (current.renewalProposalId === input.proposalId && current.renewalDecisionId === input.decisionId) return { period: current, changed: false };
        throw conflict("A different renewal request is already recorded for this period", { code: "renewal_already_recorded" });
      }
      const [row] = await tx.update(agreementPeriods).set({
        renewalProposalId: input.proposalId,
        renewalDecisionId: input.decisionId,
        status: "renewal_requested",
        updatedAt: now(),
      }).where(eq(agreementPeriods.id, periodId)).returning();
      await tx.update(serviceAgreements).set({ status: "notice", updatedAt: now() })
        .where(and(eq(serviceAgreements.id, agreementId), eq(serviceAgreements.companyId, companyId), eq(serviceAgreements.status, "active")));
      return { period: row!, changed: true };
    });
    if (result.changed) {
      await logActivity(db, {
        companyId,
        actorType: "agent",
        actorId: actor.agentId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "agreement.renewal_requested",
        entityType: "agreement",
        entityId: agreementId,
        details: { periodId, renewalProposalId: input.proposalId, renewalDecisionId: input.decisionId },
      });
    }
    return result.period;
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
    recordRenewalRequest,
    recordUpsell,
  };
}

export type ServiceAgreementService = ReturnType<typeof serviceAgreementService>;
