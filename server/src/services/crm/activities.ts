import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { commitments, contacts, crmActivities, customers, leads, conversations, opportunities } from "@paperclipai/db";
import type { CrmActivityKind, CrmSubjectKind, CreateCrmActivity } from "@paperclipai/shared";
import { badRequest, notFound } from "../../errors.js";

// Sprint 2 pista A2. Activity timeline shared by opportunities, commitments and customers.
// Writes happen inside the caller's transaction when one is passed.

export type CrmDbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface CrmActor {
  userId?: string | null;
  agentId?: string | null;
}

export interface LogCrmActivityInput extends Omit<CreateCrmActivity, "occurredAt" | "idempotencyKey"> {
  occurredAt?: string;
  idempotencyKey?: string;
}

export interface CrmCursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Stable reference stored in `external_ref` to make a create idempotent without a new column. */
export function idempotencyRef(scope: string, key: string) {
  return `idem:${scope}:${key}`;
}

/**
 * Keyset cursor over `(date_trunc('milliseconds', ts) desc, id desc)`. Truncating to
 * milliseconds keeps the JS cursor value exact for the comparison.
 */
export function encodeCrmCursor(ts: Date, id: string) {
  return Buffer.from(JSON.stringify({ t: ts.toISOString(), i: id }), "utf8").toString("base64url");
}

export function decodeCrmCursor(cursor: string): { t: Date; i: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== "string" || typeof parsed.i !== "string") throw new Error("shape");
    const t = new Date(parsed.t);
    if (Number.isNaN(t.getTime())) throw new Error("date");
    return { t, i: parsed.i };
  } catch {
    throw badRequest("Invalid cursor");
  }
}

export function crmActivityService(db: Db) {
  const svc = {
    /** Confirms the subject record exists in this company before an activity is attached to it. */
    async assertSubject(companyId: string, kind: CrmSubjectKind, id: string) {
      let row: { companyId: string } | undefined;
      switch (kind) {
        case "customer":
          [row] = await db.select({ companyId: customers.companyId }).from(customers).where(eq(customers.id, id)).limit(1);
          break;
        case "contact":
          [row] = await db.select({ companyId: contacts.companyId }).from(contacts).where(eq(contacts.id, id)).limit(1);
          break;
        case "lead":
          [row] = await db.select({ companyId: leads.companyId }).from(leads).where(eq(leads.id, id)).limit(1);
          break;
        case "opportunity":
          [row] = await db.select({ companyId: opportunities.companyId }).from(opportunities).where(eq(opportunities.id, id)).limit(1);
          break;
        case "conversation":
          [row] = await db.select({ companyId: conversations.companyId }).from(conversations).where(eq(conversations.id, id)).limit(1);
          break;
        case "commitment":
          [row] = await db.select({ companyId: commitments.companyId }).from(commitments).where(eq(commitments.id, id)).limit(1);
          break;
      }
      if (!row || row.companyId !== companyId) throw notFound("Subject not found");
    },

    /** Appends one activity. A repeated `idempotencyKey` returns the stored row instead of inserting again. */
    async log(companyId: string, input: LogCrmActivityInput, actor: CrmActor = {}, executor: CrmDbOrTx = db) {
      const storedRef = input.idempotencyKey
        ? idempotencyRef(`activity:${input.subjectKind}`, input.idempotencyKey)
        : (input.externalRef ?? null);
      if (input.idempotencyKey) {
        const existing = await svc.findByExternalRef(companyId, storedRef!, executor);
        if (existing) return existing;
      }
      const payload = input.idempotencyKey && input.externalRef
        ? { ...(input.payload ?? {}), externalRef: input.externalRef }
        : (input.payload ?? null);
      const [row] = await executor
        .insert(crmActivities)
        .values({
          companyId,
          subjectKind: input.subjectKind,
          subjectId: input.subjectId,
          kind: input.kind as CrmActivityKind,
          actorUserId: actor.agentId ? null : (actor.userId ?? null),
          actorAgentId: actor.agentId ?? null,
          summary: input.summary,
          payload,
          externalRef: storedRef,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        })
        .returning();
      return row!;
    },

    async findByExternalRef(companyId: string, externalRef: string, executor: CrmDbOrTx = db) {
      const [row] = await executor
        .select()
        .from(crmActivities)
        .where(and(eq(crmActivities.companyId, companyId), eq(crmActivities.externalRef, externalRef)))
        .limit(1);
      return row ?? null;
    },

    /** Timeline of one subject, newest first, keyset-paginated. */
    async listBySubject(
      companyId: string,
      input: { subjectKind: CrmSubjectKind; subjectId: string; cursor?: string | null; limit?: number },
    ): Promise<CrmCursorPage<typeof crmActivities.$inferSelect>> {
      const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
      const orderTs = sql`date_trunc('milliseconds', ${crmActivities.occurredAt})`;
      const conditions = [
        eq(crmActivities.companyId, companyId),
        eq(crmActivities.subjectKind, input.subjectKind),
        eq(crmActivities.subjectId, input.subjectId),
      ];
      if (input.cursor) {
        const c = decodeCrmCursor(input.cursor);
        conditions.push(or(lt(orderTs, c.t), and(sql`${orderTs} = ${c.t}`, lt(crmActivities.id, c.i)))!);
      }
      const rows = await db
        .select()
        .from(crmActivities)
        .where(and(...conditions))
        .orderBy(desc(orderTs), desc(crmActivities.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      const nextCursor = rows.length > limit && last
        ? encodeCrmCursor(new Date(last.occurredAt), last.id)
        : null;
      return { items: page, nextCursor };
    },
  };
  return svc;
}
