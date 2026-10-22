import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { activityLog, agents, goals, handoffReceipts, proposals } from "@paperclipai/db";
import {
  HANDOFF_STEPS,
  type HandoffFromOpportunityInput,
  type HandoffFromProposalInput,
  type HandoffSourceKind,
  type HandoffStep,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { assignmentService } from "./assignments.js";
import { documentService } from "./documents.js";
import { issueService } from "./issues.js";
import { projectService } from "./projects.js";
import { teamsCatalogService } from "./teams-catalog.js";

export interface HandoffSource {
  kind: HandoffSourceKind;
  id: string;
}

/** Actor of a handoff: an agent (its key) or a board user. */
export interface HandoffActor {
  agentId?: string | null;
  userId?: string | null;
}

/**
 * Everything a handoff needs. It is stored in the `handoff.started` activity entry so that a retry
 * does not depend on the source row (an opportunity has no table yet, its data arrives in the request).
 */
export interface HandoffPlan {
  title: string;
  acceptanceCriteria: string;
  budgetCents: number;
  customerId: string | null;
  assigneeAgentId: string;
  teamCatalogKey: string | null;
  summaryMarkdown: string | null;
  briefMarkdown: string;
}

export interface HandoffStepState {
  projectId: string | null;
  assignmentGoalId: string | null;
  rootIssueId: string | null;
}

export interface HandoffStepContext {
  /** Savepoint-scoped database handle: the writes of a failing step are rolled back on their own. */
  db: Db;
  companyId: string;
  receiptId: string;
  source: HandoffSource;
  plan: HandoffPlan;
  actor: HandoffActor;
  /** Mutable step outputs. A step sets these only when it has succeeded. */
  state: HandoffStepState;
  /** A step that was skipped on purpose (e.g. the team install failed). Recorded as `<step>:skipped`. */
  skipped: boolean;
}

export interface HandoffServiceDeps {
  steps?: Partial<Record<HandoffStep, (ctx: HandoffStepContext) => Promise<void>>>;
  installTeam?: (companyId: string, teamCatalogKey: string, projectId: string) => Promise<void>;
  now?: () => Date;
}

export type HandoffRunResult = typeof handoffReceipts.$inferSelect;

const EXCLUDED_AGENT_STATUSES = ["terminated", "pending_approval"];

function actorFields(actor: HandoffActor) {
  if (actor.agentId) return { actorType: "agent" as const, actorId: actor.agentId, agentId: actor.agentId };
  return { actorType: (actor.userId ? "user" : "system") as "user" | "system", actorId: actor.userId ?? "system", agentId: null };
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Checklist rendering of proposal scope items: "- título: descripción". */
export function renderScopeChecklist(scope: Array<{ title: string; description?: string | null }>) {
  return scope.map((item) => (item.description ? `- ${item.title}: ${item.description}` : `- ${item.title}`)).join("\n");
}

function renderBrief(input: { title: string; sourceLabel: string; priceCents: number; currency?: string | null; scopeChecklist: string; terms?: string | null }) {
  const price = `${(input.priceCents / 100).toFixed(2)} ${input.currency ?? ""}`.trim();
  const sections = [
    `# ${input.title}`,
    `Origen: ${input.sourceLabel}`,
    `Precio acordado: ${price}`,
    `## Alcance\n\n${input.scopeChecklist || "- Sin alcance detallado"}`,
  ];
  if (input.terms) sections.push(`## Condiciones\n\n${input.terms}`);
  return sections.join("\n\n");
}

export function handoffService(db: Db, deps: HandoffServiceDeps = {}) {
  const now = deps.now ?? (() => new Date());

  async function resolveAssigneeAgentId(companyId: string, explicit: string | null | undefined) {
    if (explicit) return explicit;
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), notInArray(agents.status, EXCLUDED_AGENT_STATUSES)))
      .orderBy(asc(agents.createdAt), asc(agents.id))
      .limit(1);
    if (!agent) throw unprocessable("No hay agente disponible para asignar el encargo de entrega");
    return agent.id;
  }

  /** Default step bodies. The runner executes each one inside its own savepoint. */
  const defaultSteps: Record<HandoffStep, (ctx: HandoffStepContext) => Promise<void>> = {
    project: async (ctx) => {
      if (ctx.state.projectId) return;
      const project = await projectService(ctx.db).create(ctx.companyId, {
        name: ctx.plan.title,
        description: `Traspaso de venta a entrega (${ctx.source.kind} ${ctx.source.id}).`,
      });
      ctx.state.projectId = project.id;
    },
    assignment: async (ctx) => {
      if (ctx.state.assignmentGoalId) return;
      if (!ctx.state.projectId) throw new Error("The assignment step requires the project step");
      const assignment = await assignmentService(ctx.db).create(ctx.companyId, {
        title: ctx.plan.title,
        acceptanceCriteria: ctx.plan.acceptanceCriteria,
        expectedDeliverable: null,
        budgetCents: ctx.plan.budgetCents,
        projectId: ctx.state.projectId,
        assigneeAgentId: ctx.plan.assigneeAgentId,
        idempotencyKey: `handoff:${ctx.source.kind}:${ctx.source.id}`,
      }, ctx.actor);
      ctx.state.assignmentGoalId = assignment.id;
      ctx.state.rootIssueId = assignment.rootIssueId ?? null;
    },
    team: async (ctx) => {
      const key = ctx.plan.teamCatalogKey;
      if (!key) return;
      if (!ctx.state.projectId) throw new Error("The team step requires the project step");
      const projectId = ctx.state.projectId;
      // Best effort: a team install can fail for reasons outside the handoff (missing skills or adapters).
      // The failure is isolated in a nested savepoint and the step is recorded as skipped.
      try {
        await ctx.db.transaction(async (inner) => {
          if (deps.installTeam) {
            await deps.installTeam(ctx.companyId, key, projectId);
          } else {
            await teamsCatalogService(inner as unknown as Db).installCatalogTeam(ctx.companyId, key, {});
          }
        });
      } catch {
        ctx.skipped = true;
      }
    },
    brief: async (ctx) => {
      if (!ctx.state.rootIssueId) throw new Error("The brief step requires the assignment step");
      // Projects have no document store in this codebase yet, so the brief lives on the assignment's root issue.
      await documentService(ctx.db).upsertIssueDocument({
        issueId: ctx.state.rootIssueId,
        key: "brief",
        title: "Brief del traspaso",
        format: "markdown",
        body: ctx.plan.briefMarkdown,
        createdByAgentId: ctx.actor.agentId ?? null,
        createdByUserId: ctx.actor.userId ?? null,
      });
    },
    summary: async (ctx) => {
      if (!ctx.state.rootIssueId) throw new Error("The summary step requires the assignment step");
      const summary = ctx.plan.summaryMarkdown?.trim() || "Sin resumen de conversaciones todavía.";
      await issueService(ctx.db).addComment(
        ctx.state.rootIssueId,
        `### Paquete de traspaso\n\n${summary}`,
        ctx.actor.agentId ? { agentId: ctx.actor.agentId } : { userId: ctx.actor.userId ?? undefined },
      );
    },
  };

  async function run(
    companyId: string,
    source: HandoffSource,
    plan: HandoffPlan,
    actor: HandoffActor,
    options: { retry?: boolean } = {},
  ): Promise<HandoffRunResult> {
    const lockKey = `handoff:${companyId}:${source.kind}:${source.id}`;
    return db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Db;
      // Serialises concurrent runs for the same source. Held until the run commits, so two calls create one project.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

      let [receipt] = await tx
        .select()
        .from(handoffReceipts)
        .where(and(
          eq(handoffReceipts.companyId, companyId),
          eq(handoffReceipts.sourceKind, source.kind),
          eq(handoffReceipts.sourceId, source.id),
        ));
      if (!receipt) {
        [receipt] = await tx.insert(handoffReceipts).values({
          companyId,
          sourceKind: source.kind,
          sourceId: source.id,
          customerId: plan.customerId,
          teamCatalogKey: plan.teamCatalogKey,
          status: "partial",
          stepsDone: [],
          createdByAgentId: actor.agentId ?? null,
          createdByUserId: actor.userId ?? null,
        }).returning();
        await logActivity(tx, {
          companyId,
          ...actorFields(actor),
          action: "handoff.started",
          entityType: "handoff",
          entityId: receipt!.id,
          details: { sourceKind: source.kind, sourceId: source.id, plan },
        });
      } else if (receipt.status === "complete") {
        return receipt;
      } else if (options.retry) {
        await logActivity(tx, {
          companyId,
          ...actorFields(actor),
          action: "handoff.retried",
          entityType: "handoff",
          entityId: receipt.id,
          details: { sourceKind: source.kind, sourceId: source.id, stepsDone: receipt.stepsDone },
        });
      }

      const receiptId = receipt!.id;
      const stepsDone = [...(receipt!.stepsDone ?? [])];
      const state: HandoffStepState = {
        projectId: receipt!.projectId,
        assignmentGoalId: receipt!.assignmentGoalId,
        rootIssueId: null,
      };
      if (state.assignmentGoalId) {
        const [goal] = await tx.select({ rootIssueId: goals.rootIssueId }).from(goals).where(eq(goals.id, state.assignmentGoalId));
        state.rootIssueId = goal?.rootIssueId ?? null;
      }
      const isDone = (step: HandoffStep) => stepsDone.includes(step) || stepsDone.includes(`${step}:skipped`);

      let lastError: string | null = null;
      for (const step of HANDOFF_STEPS) {
        if (isDone(step)) continue;
        const draft: HandoffStepState = { ...state };
        const runStep = deps.steps?.[step] ?? defaultSteps[step];
        let skipped = false;
        try {
          await tx.transaction(async (savepoint) => {
            const stepCtx: HandoffStepContext = {
              db: savepoint as unknown as Db,
              companyId,
              receiptId,
              source,
              plan,
              actor,
              state: draft,
              skipped: false,
            };
            await runStep(stepCtx);
            skipped = stepCtx.skipped;
          });
        } catch (error) {
          lastError = describeError(error);
          break;
        }
        Object.assign(state, draft);
        stepsDone.push(skipped ? `${step}:skipped` : step);
        await tx.update(handoffReceipts).set({
          projectId: state.projectId,
          assignmentGoalId: state.assignmentGoalId,
          stepsDone,
          error: null,
          updatedAt: now(),
        }).where(eq(handoffReceipts.id, receiptId));
      }

      const complete = HANDOFF_STEPS.every((step) => isDone(step));
      const [updated] = await tx.update(handoffReceipts).set({
        projectId: state.projectId,
        assignmentGoalId: state.assignmentGoalId,
        stepsDone,
        status: complete ? "complete" : "partial",
        error: complete ? null : lastError,
        updatedAt: now(),
      }).where(eq(handoffReceipts.id, receiptId)).returning();

      if (complete) {
        await logActivity(tx, {
          companyId,
          ...actorFields(actor),
          action: "handoff.completed",
          entityType: "handoff",
          entityId: receiptId,
          details: { projectId: state.projectId, assignmentGoalId: state.assignmentGoalId, stepsDone },
        });
      }
      return updated!;
    });
  }

  async function fromProposal(companyId: string, input: HandoffFromProposalInput, actor: HandoffActor) {
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, input.proposalId));
    if (!proposal || proposal.companyId !== companyId) throw notFound("Proposal not found");
    if (proposal.status !== "accepted") throw conflict("Only an accepted proposal can be handed off to delivery");
    const scopeChecklist = renderScopeChecklist(proposal.scope ?? []);
    const plan: HandoffPlan = {
      title: proposal.title,
      acceptanceCriteria: scopeChecklist || `- Entregar: ${proposal.title}`,
      budgetCents: proposal.priceCents,
      customerId: proposal.customerId ?? null,
      assigneeAgentId: await resolveAssigneeAgentId(companyId, input.assigneeAgentId),
      teamCatalogKey: input.teamCatalogKey ?? null,
      summaryMarkdown: input.summaryMarkdown ?? null,
      briefMarkdown: renderBrief({
        title: proposal.title,
        sourceLabel: `propuesta ${proposal.proposalKey} rev. ${proposal.revision}`,
        priceCents: proposal.priceCents,
        currency: proposal.currency,
        scopeChecklist,
        terms: proposal.terms,
      }),
    };
    return run(companyId, { kind: "proposal", id: proposal.id }, plan, actor);
  }

  async function fromOpportunity(companyId: string, input: HandoffFromOpportunityInput, actor: HandoffActor) {
    const budgetCents = input.budgetCents ?? 0;
    const plan: HandoffPlan = {
      title: input.title,
      acceptanceCriteria: input.acceptanceCriteria,
      budgetCents,
      customerId: input.customerId ?? null,
      assigneeAgentId: await resolveAssigneeAgentId(companyId, input.assigneeAgentId),
      teamCatalogKey: input.teamCatalogKey ?? null,
      summaryMarkdown: input.summaryMarkdown ?? null,
      briefMarkdown: renderBrief({
        title: input.title,
        sourceLabel: `oportunidad ${input.opportunityId}`,
        priceCents: budgetCents,
        scopeChecklist: input.acceptanceCriteria,
      }),
    };
    return run(companyId, { kind: "opportunity", id: input.opportunityId }, plan, actor);
  }

  async function retry(receiptId: string, actor: HandoffActor) {
    const receipt = await getById(receiptId);
    if (!receipt) throw notFound("Handoff receipt not found");
    if (receipt.status === "complete") return receipt;
    const [started] = await db
      .select({ details: activityLog.details })
      .from(activityLog)
      .where(and(
        eq(activityLog.companyId, receipt.companyId),
        eq(activityLog.entityType, "handoff"),
        eq(activityLog.entityId, receipt.id),
        eq(activityLog.action, "handoff.started"),
      ))
      .orderBy(desc(activityLog.createdAt))
      .limit(1);
    const plan = started?.details?.plan as HandoffPlan | undefined;
    if (!plan) throw unprocessable("The stored handoff plan is missing; create the handoff again from its source");
    return run(receipt.companyId, { kind: receipt.sourceKind as HandoffSourceKind, id: receipt.sourceId }, plan, actor, { retry: true });
  }

  async function getById(id: string) {
    const [row] = await db.select().from(handoffReceipts).where(eq(handoffReceipts.id, id));
    return row ?? null;
  }

  async function getBySource(companyId: string, kind: HandoffSourceKind, sourceId: string) {
    const [row] = await db
      .select()
      .from(handoffReceipts)
      .where(and(eq(handoffReceipts.companyId, companyId), eq(handoffReceipts.sourceKind, kind), eq(handoffReceipts.sourceId, sourceId)));
    return row ?? null;
  }

  async function list(companyId: string) {
    return db
      .select()
      .from(handoffReceipts)
      .where(eq(handoffReceipts.companyId, companyId))
      .orderBy(desc(handoffReceipts.createdAt), desc(handoffReceipts.id));
  }

  return { fromProposal, fromOpportunity, retry, getById, getBySource, list };
}

export type HandoffService = ReturnType<typeof handoffService>;
