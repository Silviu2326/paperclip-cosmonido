import { and, eq, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { commitments, contacts, conversations, customers, opportunities } from "@paperclipai/db";
import { COMMITMENT_STATUSES, type CreateCommitment, type ResolveCommitment } from "@paperclipai/shared";
import { badRequest, conflict, notFound } from "../../errors.js";
import type { CommitmentCandidate } from "@paperclipai/shared";
import type { CommitmentPersistResult } from "../commitment-extractor.js";
import {
  crmActivityService,
  decodeCrmCursor,
  encodeCrmCursor,
  idempotencyRef,
  type CrmActor,
  type CrmCursorPage,
} from "./activities.js";

// Sprint 2 pista A2. Commitments made by us or by the customer. Lifecycle: proposed|open -> kept|missed|cancelled.

export type CommitmentRow = typeof commitments.$inferSelect;

export interface CommitmentListQuery {
  status?: string;
  customerId?: string;
  opportunityId?: string;
  cursor?: string;
  limit?: number;
}

const RESOLVABLE_FROM = ["proposed", "open"] as const;

export function commitmentService(db: Db) {
  const activities = crmActivityService(db);

  async function assertLinksInCompany(
    companyId: string,
    links: { customerId?: string | null; contactId?: string | null; opportunityId?: string | null },
  ) {
    if (links.customerId) {
      const [row] = await db.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.id, links.customerId), eq(customers.companyId, companyId))).limit(1);
      if (!row) throw notFound("Customer not found");
    }
    if (links.contactId) {
      const [row] = await db.select({ id: contacts.id }).from(contacts)
        .where(and(eq(contacts.id, links.contactId), eq(contacts.companyId, companyId))).limit(1);
      if (!row) throw notFound("Contact not found");
    }
    if (links.opportunityId) {
      const [row] = await db.select({ id: opportunities.id }).from(opportunities)
        .where(and(eq(opportunities.id, links.opportunityId), eq(opportunities.companyId, companyId))).limit(1);
      if (!row) throw notFound("Opportunity not found");
    }
  }

  const svc = {
    async list(companyId: string, query: CommitmentListQuery = {}): Promise<CrmCursorPage<CommitmentRow>> {
      const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
      const conditions: SQL[] = [eq(commitments.companyId, companyId)];
      if (query.status) {
        if (!(COMMITMENT_STATUSES as readonly string[]).includes(query.status)) throw badRequest("Invalid commitment status");
        conditions.push(eq(commitments.status, query.status));
      }
      if (query.customerId) conditions.push(eq(commitments.customerId, query.customerId));
      if (query.opportunityId) conditions.push(eq(commitments.opportunityId, query.opportunityId));
      const orderTs = sql`date_trunc('milliseconds', ${commitments.updatedAt})`;
      if (query.cursor) {
        const c = decodeCrmCursor(query.cursor);
        conditions.push(or(sql`${orderTs} < ${c.t.toISOString()}::timestamptz`, and(sql`${orderTs} = ${c.t.toISOString()}::timestamptz`, lt(commitments.id, c.i)))!);
      }
      const rows = await db
        .select()
        .from(commitments)
        .where(and(...conditions))
        .orderBy(sql`${orderTs} desc`, sql`${commitments.id} desc`)
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      const nextCursor = rows.length > limit && last ? encodeCrmCursor(new Date(last.updatedAt), last.id) : null;
      return { items, nextCursor };
    },

    /** Lookup by id only, for route access checks (the caller then verifies the company). */
    async findById(id: string): Promise<CommitmentRow | null> {
      const [row] = await db.select().from(commitments).where(eq(commitments.id, id)).limit(1);
      return row ?? null;
    },

    async getById(companyId: string, id: string): Promise<CommitmentRow | null> {
      const [row] = await db.select().from(commitments)
        .where(and(eq(commitments.id, id), eq(commitments.companyId, companyId))).limit(1);
      return row ?? null;
    },

    /** Creates a commitment; a repeated `idempotencyKey` returns the commitment created the first time. */
    async create(companyId: string, input: CreateCommitment, actor: CrmActor = {}): Promise<CommitmentRow> {
      const ref = input.idempotencyKey ? idempotencyRef("commitment", input.idempotencyKey) : null;
      if (ref) {
        const existing = await activities.findByExternalRef(companyId, ref);
        if (existing) {
          const row = await svc.getById(companyId, existing.subjectId);
          if (row) return row;
        }
      }
      await assertLinksInCompany(companyId, input);
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(commitments)
          .values({
            companyId,
            who: input.who,
            what: input.what,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            status: "open",
            source: "manual",
            customerId: input.customerId ?? null,
            contactId: input.contactId ?? null,
            opportunityId: input.opportunityId ?? null,
            conversationId: input.conversationId ?? null,
            evidence: input.evidence ?? null,
          })
          .returning();
        await activities.log(
          companyId,
          {
            subjectKind: "commitment",
            subjectId: row!.id,
            kind: "system",
            summary: `Commitment created (${input.who === "us" ? "by us" : "by the customer"})`,
            externalRef: ref,
          },
          actor,
          tx,
        );
        return row!;
      });
    },

    /** Marks a commitment as kept, missed or cancelled. Only open or proposed commitments can be resolved. */
    async resolve(companyId: string, id: string, input: ResolveCommitment, actor: CrmActor = {}): Promise<CommitmentRow> {
      return db.transaction(async (tx) => {
        const [current] = await tx.select().from(commitments)
          .where(and(eq(commitments.id, id), eq(commitments.companyId, companyId))).for("update").limit(1);
        if (!current) throw notFound("Commitment not found");
        if (!(RESOLVABLE_FROM as readonly string[]).includes(current.status)) {
          throw conflict(`Commitment is already ${current.status}`, { code: "already_resolved" });
        }
        const now = new Date();
        const [row] = await tx
          .update(commitments)
          .set({ status: input.status, resolvedAt: now, updatedAt: now })
          .where(and(eq(commitments.id, id), eq(commitments.status, current.status)))
          .returning();
        if (!row) throw conflict("Commitment was changed by someone else", { code: "version_conflict" });
        await activities.log(
          companyId,
          {
            subjectKind: "commitment",
            subjectId: id,
            kind: "status_change",
            summary: `Commitment ${current.status} -> ${input.status}`,
            payload: { fromStatus: current.status, toStatus: input.status, note: input.note ?? null },
          },
          actor,
          tx,
        );
        return row;
      });
    },
  };
  return svc;
}

/**
 * Persistence for the Sprint 3 commitment extractor (`CommitmentServiceDeps.persist`).
 * Detected candidates are written to this table as `proposed` with source `detected`;
 * a candidate whose fingerprint already exists for the conversation counts as existing.
 */
export function detectedCommitmentsPersist(db: Db) {
  const activities = crmActivityService(db);
  return async (
    companyId: string,
    candidates: CommitmentCandidate[],
    actor: CrmActor,
    context: { conversationId: string },
  ): Promise<CommitmentPersistResult> => {
    const [conversation] = await db.select({ id: conversations.id }).from(conversations)
      .where(and(eq(conversations.id, context.conversationId), eq(conversations.companyId, companyId))).limit(1);
    if (!conversation) throw notFound("Conversation not found");

    let created = 0;
    let existing = 0;
    for (const candidate of candidates) {
      const [hit] = await db.select({ id: commitments.id }).from(commitments)
        .where(and(
          eq(commitments.companyId, companyId),
          eq(commitments.conversationId, context.conversationId),
          eq(commitments.source, "detected"),
          sql`${commitments.evidence}->>'fingerprint' = ${candidate.fingerprint}`,
        )).limit(1);
      if (hit) {
        existing += 1;
        continue;
      }
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(commitments)
          .values({
            companyId,
            who: candidate.who,
            what: candidate.what,
            dueAt: candidate.dueAt ? new Date(candidate.dueAt) : null,
            status: "proposed",
            source: "detected",
            conversationId: context.conversationId,
            evidence: { quote: candidate.evidence, fingerprint: candidate.fingerprint, confidence: candidate.confidence },
          })
          .returning();
        await activities.log(
          companyId,
          {
            subjectKind: "commitment",
            subjectId: row!.id,
            kind: "system",
            summary: `Commitment detected (${candidate.who === "us" ? "by us" : "by the customer"})`,
          },
          actor,
          tx,
        );
      });
      created += 1;
    }
    return { created, existing };
  };
}
