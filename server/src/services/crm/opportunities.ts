import { and, eq, ilike, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { contacts, customers, opportunities, pipelineStages, pipelineTransitions, pipelines } from "@paperclipai/db";
import {
  OPPORTUNITY_STATUSES,
  type ChangeOpportunityStage,
  type CreateOpportunity,
  type SalesStageKey,
  type UpdateOpportunity,
} from "@paperclipai/shared";
import { badRequest, conflict, notFound, unprocessable } from "../../errors.js";
import { pipelineService } from "../pipelines.js";
import {
  crmActivityService,
  decodeCrmCursor,
  encodeCrmCursor,
  idempotencyRef,
  type CrmActor,
  type CrmCursorPage,
} from "./activities.js";

// Sprint 2 pista A2. Sales opportunities on the shared `pipelines` tables.

export const SALES_PIPELINE_KEY = "sales";

// Stage kinds must be working | review | done | cancelled (see pipelines.ts normalizeStageKind).
const SALES_STAGES: ReadonlyArray<{ key: SalesStageKey; name: string; kind: "working" | "done" | "cancelled"; position: number }> = [
  { key: "new", name: "New", kind: "working", position: 100 },
  { key: "qualified", name: "Qualified", kind: "working", position: 200 },
  { key: "proposal", name: "Proposal", kind: "working", position: 300 },
  { key: "negotiation", name: "Negotiation", kind: "working", position: 400 },
  { key: "won", name: "Won", kind: "done", position: 900 },
  { key: "lost", name: "Lost", kind: "cancelled", position: 1000 },
];

export interface SalesPipeline {
  id: string;
  enforceTransitions: boolean;
  stageIds: Record<SalesStageKey, string>;
}

export const setNextActionSchema = z.object({
  nextAction: z.string().trim().min(1).max(500),
  nextActionAt: z.string().datetime({ offset: true }).optional().nullable(),
  expectedVersion: z.number().int().min(1).optional(),
});
export type SetNextAction = z.infer<typeof setNextActionSchema>;

export const closeOpportunitySchema = z
  .object({
    outcome: z.enum(["won", "lost"]),
    expectedVersion: z.number().int().min(1),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => value.outcome !== "lost" || Boolean(value.reason), {
    message: "A reason is required to close an opportunity as lost",
    path: ["reason"],
  });
export type CloseOpportunity = z.infer<typeof closeOpportunitySchema>;

export interface OpportunityListQuery {
  status?: string;
  stageKey?: string;
  ownerId?: string;
  customerId?: string;
  nextActionBefore?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export type OpportunityRow = typeof opportunities.$inferSelect;

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function statusForStage(stageKey: SalesStageKey): "open" | "won" | "lost" {
  if (stageKey === "won") return "won";
  if (stageKey === "lost") return "lost";
  return "open";
}

export function opportunityService(db: Db) {
  const activities = crmActivityService(db);

  async function readSalesPipeline(companyId: string): Promise<SalesPipeline | null> {
    const [pipeline] = await db
      .select({ id: pipelines.id, enforceTransitions: pipelines.enforceTransitions })
      .from(pipelines)
      .where(and(eq(pipelines.companyId, companyId), eq(pipelines.key, SALES_PIPELINE_KEY)))
      .limit(1);
    if (!pipeline) return null;
    const stages = await db
      .select({ id: pipelineStages.id, key: pipelineStages.key })
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, pipeline.id));
    const byKey = new Map(stages.map((stage) => [stage.key, stage.id]));
    const stageIds = {} as Record<SalesStageKey, string>;
    for (const stage of SALES_STAGES) {
      const id = byKey.get(stage.key);
      if (!id) throw unprocessable(`Sales pipeline is missing stage "${stage.key}"`, { code: "validation" });
      stageIds[stage.key] = id;
    }
    return { id: pipeline.id, enforceTransitions: pipeline.enforceTransitions, stageIds };
  }

  /** Creates the company's `sales` pipeline with its stages the first time it is needed. */
  async function ensureSalesPipeline(companyId: string): Promise<SalesPipeline> {
    const existing = await readSalesPipeline(companyId);
    if (existing) return existing;
    try {
      await pipelineService(db).createPipeline({
        companyId,
        key: SALES_PIPELINE_KEY,
        name: "Sales",
        description: "Default sales pipeline for opportunities",
        enforceTransitions: false,
        stages: SALES_STAGES.map((stage) => ({ key: stage.key, name: stage.name, kind: stage.kind, position: stage.position })),
        actor: { type: "user", userId: "system" },
      });
    } catch (error) {
      // A concurrent request created it first; the unique (company_id, key) index decides the winner.
      if (!isUniqueViolation(error)) throw error;
    }
    const created = await readSalesPipeline(companyId);
    if (!created) throw new Error("Sales pipeline could not be created");
    return created;
  }

  async function assertCustomerInCompany(companyId: string, customerId: string) {
    const [row] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
      .limit(1);
    if (!row) throw notFound("Customer not found");
  }

  async function assertContactInCompany(companyId: string, contactId: string) {
    const [row] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)))
      .limit(1);
    if (!row) throw notFound("Contact not found");
  }

  async function getByIdInCompany(companyId: string, id: string): Promise<OpportunityRow | null> {
    const [row] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  function versionConflict(current: OpportunityRow, expectedVersion: number) {
    return conflict("Opportunity was changed by someone else", {
      code: "version_conflict",
      expectedVersion,
      currentVersion: current.version,
    });
  }

  const svc = {
    ensureSalesPipeline,

    async list(companyId: string, query: OpportunityListQuery = {}): Promise<CrmCursorPage<OpportunityRow>> {
      const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
      const conditions: SQL[] = [eq(opportunities.companyId, companyId)];
      if (query.status) {
        if (!(OPPORTUNITY_STATUSES as readonly string[]).includes(query.status)) {
          throw badRequest("Invalid opportunity status");
        }
        conditions.push(eq(opportunities.status, query.status));
      }
      if (query.stageKey) conditions.push(eq(opportunities.stageKey, query.stageKey));
      if (query.customerId) conditions.push(eq(opportunities.customerId, query.customerId));
      if (query.ownerId === "unassigned") {
        conditions.push(isNull(opportunities.ownerUserId), isNull(opportunities.ownerAgentId));
      } else if (query.ownerId) {
        conditions.push(
          or(eq(opportunities.ownerUserId, query.ownerId), sql`${opportunities.ownerAgentId}::text = ${query.ownerId}`)!,
        );
      }
      if (query.nextActionBefore) {
        const before = new Date(query.nextActionBefore);
        if (Number.isNaN(before.getTime())) throw badRequest("Invalid nextActionBefore");
        conditions.push(lte(opportunities.nextActionAt, before));
      }
      if (query.q) conditions.push(ilike(opportunities.title, `%${escapeLike(query.q)}%`));

      const orderTs = sql`date_trunc('milliseconds', ${opportunities.updatedAt})`;
      if (query.cursor) {
        const c = decodeCrmCursor(query.cursor);
        conditions.push(or(sql`${orderTs} < ${c.t.toISOString()}::timestamptz`, and(sql`${orderTs} = ${c.t.toISOString()}::timestamptz`, lt(opportunities.id, c.i)))!);
      }
      const rows = await db
        .select()
        .from(opportunities)
        .where(and(...conditions))
        .orderBy(sql`${orderTs} desc`, sql`${opportunities.id} desc`)
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor = rows.length > limit && last ? encodeCrmCursor(new Date(last.updatedAt), last.id) : null;
      return { items, nextCursor };
    },

    async getById(companyId: string, id: string): Promise<OpportunityRow | null> {
      return getByIdInCompany(companyId, id);
    },

    /** Lookup by id only, for route access checks (the caller then verifies the company). */
    async findById(id: string): Promise<OpportunityRow | null> {
      const [row] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
      return row ?? null;
    },

    async create(companyId: string, input: CreateOpportunity, actor: CrmActor = {}): Promise<OpportunityRow> {
      const ref = input.idempotencyKey ? idempotencyRef("opportunity", input.idempotencyKey) : null;
      if (ref) {
        const existing = await activities.findByExternalRef(companyId, ref);
        if (existing) {
          const row = await getByIdInCompany(companyId, existing.subjectId);
          if (row) return row;
        }
      }
      await assertCustomerInCompany(companyId, input.customerId);
      if (input.primaryContactId) await assertContactInCompany(companyId, input.primaryContactId);

      const sales = await ensureSalesPipeline(companyId);
      const stageKey = (input.stageKey ?? "new") as SalesStageKey;
      const status = statusForStage(stageKey);
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(opportunities)
          .values({
            companyId,
            customerId: input.customerId,
            primaryContactId: input.primaryContactId ?? null,
            title: input.title,
            pipelineId: sales.id,
            stageId: sales.stageIds[stageKey],
            stageKey,
            amountCents: input.amountCents ?? null,
            currency: input.currency ?? null,
            probability: input.probability ?? null,
            expectedCloseAt: input.expectedCloseAt ? new Date(input.expectedCloseAt) : null,
            nextAction: input.nextAction ?? null,
            nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
            ownerUserId: input.ownerUserId ?? null,
            ownerAgentId: input.ownerAgentId ?? null,
            source: input.source ?? null,
            status,
            closedAt: status === "open" ? null : new Date(),
          })
          .returning();
        await activities.log(
          companyId,
          {
            subjectKind: "opportunity",
            subjectId: row!.id,
            kind: "system",
            summary: `Opportunity created in stage ${stageKey}`,
            externalRef: ref,
          },
          actor,
          tx,
        );
        return row!;
      });
    },

    async update(companyId: string, id: string, input: UpdateOpportunity): Promise<OpportunityRow> {
      const { expectedVersion, ...fields } = input;
      if (fields.customerId) await assertCustomerInCompany(companyId, fields.customerId);
      if (fields.primaryContactId) await assertContactInCompany(companyId, fields.primaryContactId);
      const patch: Partial<typeof opportunities.$inferInsert> = {};
      if (fields.customerId !== undefined) patch.customerId = fields.customerId!;
      if (fields.primaryContactId !== undefined) patch.primaryContactId = fields.primaryContactId ?? null;
      if (fields.title !== undefined) patch.title = fields.title;
      if (fields.amountCents !== undefined) patch.amountCents = fields.amountCents ?? null;
      if (fields.currency !== undefined) patch.currency = fields.currency ?? null;
      if (fields.probability !== undefined) patch.probability = fields.probability ?? null;
      if (fields.expectedCloseAt !== undefined) patch.expectedCloseAt = fields.expectedCloseAt ? new Date(fields.expectedCloseAt) : null;
      if (fields.nextAction !== undefined) patch.nextAction = fields.nextAction ?? null;
      if (fields.nextActionAt !== undefined) patch.nextActionAt = fields.nextActionAt ? new Date(fields.nextActionAt) : null;
      if (fields.ownerUserId !== undefined) patch.ownerUserId = fields.ownerUserId ?? null;
      if (fields.ownerAgentId !== undefined) patch.ownerAgentId = fields.ownerAgentId ?? null;
      if (fields.source !== undefined) patch.source = fields.source ?? null;
      if (fields.lostReason !== undefined) patch.lostReason = fields.lostReason ?? null;

      // Optimistic concurrency: the version is compared in the same UPDATE that bumps it.
      const [row] = await db
        .update(opportunities)
        .set({ ...patch, version: sql`${opportunities.version} + 1`, updatedAt: new Date() })
        .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId), eq(opportunities.version, expectedVersion)))
        .returning();
      if (row) return row;
      const current = await getByIdInCompany(companyId, id);
      if (!current) throw notFound("Opportunity not found");
      throw versionConflict(current, expectedVersion);
    },

    /**
     * Moves an opportunity to another sales stage. Checks `expectedVersion` under a row lock,
     * validates the edge when the pipeline enforces transitions, bumps `version` and records
     * a `stage_change` activity in the same transaction.
     */
    async changeStage(companyId: string, id: string, input: ChangeOpportunityStage, actor: CrmActor = {}): Promise<OpportunityRow> {
      const sales = await ensureSalesPipeline(companyId);
      const toKey = input.stageKey as SalesStageKey;
      const toStageId = sales.stageIds[toKey];

      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(opportunities)
          .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId)))
          .for("update")
          .limit(1);
        if (!current) throw notFound("Opportunity not found");
        if (current.version !== input.expectedVersion) throw versionConflict(current, input.expectedVersion);
        if (current.stageKey === toKey) return current;

        if (sales.enforceTransitions && current.stageId) {
          const [edge] = await tx
            .select({ id: pipelineTransitions.id })
            .from(pipelineTransitions)
            .where(and(
              eq(pipelineTransitions.pipelineId, sales.id),
              eq(pipelineTransitions.fromStageId, current.stageId),
              eq(pipelineTransitions.toStageId, toStageId),
            ))
            .limit(1);
          if (!edge) {
            throw unprocessable(`Transition from ${current.stageKey} to ${toKey} is not allowed`, {
              code: "transition_not_allowed",
            });
          }
        }

        const status = statusForStage(toKey);
        const [row] = await tx
          .update(opportunities)
          .set({
            stageId: toStageId,
            stageKey: toKey,
            pipelineId: sales.id,
            status,
            closedAt: status === "open" ? null : new Date(),
            lostReason: status === "lost" ? (input.reason ?? null) : null,
            version: sql`${opportunities.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(opportunities.id, id), eq(opportunities.version, input.expectedVersion)))
          .returning();
        if (!row) throw versionConflict(current, input.expectedVersion);

        await activities.log(
          companyId,
          {
            subjectKind: "opportunity",
            subjectId: id,
            kind: "stage_change",
            summary: `Stage ${current.stageKey ?? "none"} -> ${toKey}`,
            payload: {
              fromStageKey: current.stageKey,
              toStageKey: toKey,
              reason: input.reason ?? null,
              version: row.version,
            },
          },
          actor,
          tx,
        );
        return row;
      });
    },

    async setNextAction(companyId: string, id: string, input: SetNextAction, actor: CrmActor = {}): Promise<OpportunityRow> {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(opportunities)
          .where(and(eq(opportunities.id, id), eq(opportunities.companyId, companyId)))
          .for("update")
          .limit(1);
        if (!current) throw notFound("Opportunity not found");
        if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
          throw versionConflict(current, input.expectedVersion);
        }
        const [row] = await tx
          .update(opportunities)
          .set({
            nextAction: input.nextAction,
            nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
            version: sql`${opportunities.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(opportunities.id, id))
          .returning();
        await activities.log(
          companyId,
          { subjectKind: "opportunity", subjectId: id, kind: "task", summary: `Next action: ${input.nextAction}` },
          actor,
          tx,
        );
        return row!;
      });
    },

    /** Closes as won or lost through the stage path, so the same version check and activity apply. */
    async close(companyId: string, id: string, input: CloseOpportunity, actor: CrmActor = {}): Promise<OpportunityRow> {
      return svc.changeStage(
        companyId,
        id,
        { stageKey: input.outcome, expectedVersion: input.expectedVersion, reason: input.reason },
        actor,
      );
    },

    /** Open opportunities of one customer, used by the customer detail tab and the agent tools. */
    async listOpenForCustomer(companyId: string, customerId: string): Promise<OpportunityRow[]> {
      return db
        .select()
        .from(opportunities)
        .where(and(
          eq(opportunities.companyId, companyId),
          eq(opportunities.customerId, customerId),
          eq(opportunities.status, "open"),
          isNull(opportunities.closedAt),
        ))
        .orderBy(sql`${opportunities.createdAt} asc`)
        .limit(100);
    },
  };
  return svc;
}
