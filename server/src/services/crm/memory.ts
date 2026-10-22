import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { customers } from "@paperclipai/db/schema/customers";
import { conversations } from "@paperclipai/db/schema/conversations";
import { customerMemoryNotes } from "@paperclipai/db/schema/customer_memory";

export type CustomerMemorySource = "user" | "agent" | "detected";

export type AppendCustomerMemoryInput = {
  key: string;
  content: string;
  source: CustomerMemorySource;
  agentId?: string | null;
  runId?: string | null;
  validUntil?: Date | null;
  idempotencyKey?: string | null;
};

/**
 * Customer memory (Sprint 2 pista K). Notes are an append-only history: `append`
 * always inserts, and `archive` only sets `archived_at`. Every query is scoped
 * to the company; customer-level isolation for agents lives in the route layer
 * (see `linkedCustomerIdsForRun`).
 */
export function customerMemoryService(db: Db) {
  return {
    async findCustomer(customerId: string) {
      const [row] = await db.select().from(customers).where(eq(customers.id, customerId));
      return row ?? null;
    },

    /** Active (non-archived) notes, ordered by key and then by creation within each key. */
    async get(companyId: string, customerId: string) {
      return db
        .select()
        .from(customerMemoryNotes)
        .where(
          and(
            eq(customerMemoryNotes.companyId, companyId),
            eq(customerMemoryNotes.customerId, customerId),
            isNull(customerMemoryNotes.archivedAt),
          ),
        )
        .orderBy(asc(customerMemoryNotes.key), asc(customerMemoryNotes.createdAt), asc(customerMemoryNotes.id));
    },

    /**
     * Inserts a new note. A repeated `idempotencyKey` in the same company returns the
     * existing row instead of inserting a duplicate (agent retries).
     */
    async append(companyId: string, customerId: string, input: AppendCustomerMemoryInput) {
      if (input.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(customerMemoryNotes)
          .where(
            and(
              eq(customerMemoryNotes.companyId, companyId),
              eq(customerMemoryNotes.idempotencyKey, input.idempotencyKey),
            ),
          );
        if (existing) return existing;
      }
      const [row] = await db
        .insert(customerMemoryNotes)
        .values({
          companyId,
          customerId,
          key: input.key,
          content: input.content,
          source: input.source,
          agentId: input.agentId ?? null,
          runId: input.runId ?? null,
          validUntil: input.validUntil ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();
      return row;
    },

    /** Returns the archived note, or null when it is missing in this company or already archived. */
    async archive(companyId: string, noteId: string) {
      const [row] = await db
        .update(customerMemoryNotes)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(customerMemoryNotes.id, noteId),
            eq(customerMemoryNotes.companyId, companyId),
            isNull(customerMemoryNotes.archivedAt),
          ),
        )
        .returning();
      return row ?? null;
    },

    async findNote(noteId: string) {
      const [row] = await db.select().from(customerMemoryNotes).where(eq(customerMemoryNotes.id, noteId));
      return row ?? null;
    },
  };
}

/**
 * Customers an agent run may read or write memory for. The run is linked to a
 * customer only through its conversation: `contextSnapshot.conversationId` must
 * name a conversation of the same company whose `customer_id` is set.
 * TODO(integration): `projects.customerId` does not exist yet. When it is added,
 * also include the customer of the run's project.
 */
export async function linkedCustomerIdsForRun(
  db: Db,
  input: { companyId: string; contextSnapshot: Record<string, unknown> | null | undefined },
): Promise<string[]> {
  const conversationId = input.contextSnapshot?.conversationId;
  if (typeof conversationId !== "string" || conversationId.length === 0) return [];
  const [conversation] = await db
    .select({ customerId: conversations.customerId })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.companyId, input.companyId)));
  return conversation?.customerId ? [conversation.customerId] : [];
}
