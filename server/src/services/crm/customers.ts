import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { contactIdentities, customerContacts, customers } from "@paperclipai/db";
import { CUSTOMER_STATUSES, type CreateCustomer, type CrmListQuery, type UpdateCustomer } from "@paperclipai/shared";
import { badRequest, unprocessable } from "../../errors.js";
import { logActivity } from "../activity-log.js";
import {
  CrmDuplicateError,
  decodeCursor,
  findIdempotentEntityId,
  likeContains,
  lockIdempotencyKey,
  toPage,
  type CrmActor,
  type DuplicateCandidate,
} from "./common.js";
import { normalizeDomain, normalizeEmail, normalizeOrganizationName } from "./identity.js";

// Customers (pista A1). Writes run in a transaction together with their activity row,
// so a failed write never leaves an activity entry and vice versa.

export type CustomerRow = typeof customers.$inferSelect;

export interface CustomerDuplicateQuery {
  name: string;
  domain?: string | null;
  /** Email of a contact that would be attached to the customer. */
  contactEmail?: string | null;
}

const MAX_CANDIDATES = 10;

export function customerService(db: Db) {
  async function findDuplicatesIn(
    executor: Db,
    companyId: string,
    input: CustomerDuplicateQuery,
  ): Promise<DuplicateCandidate<CustomerRow>[]> {
    const domain = normalizeDomain(input.domain);
    const nameKey = normalizeOrganizationName(input.name);
    const email = normalizeEmail(input.contactEmail);
    const found = new Map<string, DuplicateCandidate<CustomerRow>>();
    const add = (row: CustomerRow, reason: string) => {
      const current = found.get(row.id);
      if (!current) {
        found.set(row.id, { record: row, reasons: [reason] });
      } else if (!current.reasons.includes(reason)) {
        current.reasons.push(reason);
      }
    };
    const active = and(eq(customers.companyId, companyId), eq(customers.status, "active"));

    if (domain) {
      const rows = await executor.select().from(customers).where(and(active, eq(customers.domain, domain))).limit(MAX_CANDIDATES);
      for (const row of rows) add(row, "domain");
    }

    if (nameKey) {
      // Prefilter in SQL by the first token, then compare normalized names in memory.
      const token = nameKey.split(" ")[0]!;
      const rows = await executor
        .select()
        .from(customers)
        .where(and(active, ilike(customers.name, likeContains(token))))
        .limit(200);
      for (const row of rows) {
        if (normalizeOrganizationName(row.name) === nameKey) add(row, "name");
      }
    }

    if (email) {
      const rows = await executor
        .select({ customer: customers })
        .from(contactIdentities)
        .innerJoin(customerContacts, eq(customerContacts.contactId, contactIdentities.contactId))
        .innerJoin(customers, eq(customers.id, customerContacts.customerId))
        .where(
          and(
            eq(contactIdentities.companyId, companyId),
            eq(contactIdentities.channel, "email"),
            eq(contactIdentities.identifier, email),
            active,
          ),
        )
        .limit(MAX_CANDIDATES);
      for (const row of rows) add(row.customer, "contact_email");
    }

    return [...found.values()]
      .sort((a, b) => b.reasons.length - a.reasons.length)
      .slice(0, MAX_CANDIDATES);
  }

  return {
    /** Read-only duplicate candidates. Never merges anything. */
    findDuplicates: (companyId: string, input: CustomerDuplicateQuery) => findDuplicatesIn(db, companyId, input),

    list: async (companyId: string, query: CrmListQuery) => {
      const conditions = [eq(customers.companyId, companyId)];
      if (query.status !== undefined) {
        if (!(CUSTOMER_STATUSES as readonly string[]).includes(query.status)) {
          throw badRequest("Invalid status", { field: "status" });
        }
        conditions.push(eq(customers.status, query.status));
      }
      if (query.q) {
        conditions.push(
          or(ilike(customers.name, likeContains(query.q)), ilike(customers.domain, likeContains(query.q)))!,
        );
      }
      const cursor = decodeCursor(query.cursor);
      if (cursor) {
        conditions.push(
          sql`(${customers.updatedAt}, ${customers.id}) < (${cursor.updatedAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
        );
      }
      const rows = await db
        .select()
        .from(customers)
        .where(and(...conditions))
        .orderBy(desc(customers.updatedAt), desc(customers.id))
        .limit(query.limit + 1);
      return toPage(rows, query.limit);
    },

    getById: (id: string) =>
      db
        .select()
        .from(customers)
        .where(eq(customers.id, id))
        .then((rows) => rows[0] ?? null),

    /**
     * Creates a customer. Idempotent by `idempotencyKey`: a retry returns the customer
     * the first call created (created = false). Without `force`, possible duplicates
     * throw CrmDuplicateError and nothing is written.
     */
    create: async (
      companyId: string,
      input: CreateCustomer,
      options: { actor: CrmActor; force?: boolean; contactEmail?: string | null },
    ): Promise<{ customer: CustomerRow; created: boolean }> => {
      const domain = input.domain ? normalizeDomain(input.domain) : null;
      if (input.domain && !domain) throw unprocessable("Invalid domain", { field: "domain" });
      const action = "customer.created";

      return db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        if (input.idempotencyKey) {
          await lockIdempotencyKey(txDb, companyId, action, input.idempotencyKey);
          const priorId = await findIdempotentEntityId(txDb, {
            companyId,
            action,
            entityType: "customer",
            key: input.idempotencyKey,
          });
          if (priorId) {
            const prior = await txDb
              .select()
              .from(customers)
              .where(and(eq(customers.id, priorId), eq(customers.companyId, companyId)))
              .then((rows) => rows[0] ?? null);
            if (prior) return { customer: prior, created: false };
          }
        }

        const candidates = await findDuplicatesIn(txDb, companyId, {
          name: input.name,
          domain,
          contactEmail: options.contactEmail ?? null,
        });
        if (candidates.length > 0 && !options.force) {
          throw new CrmDuplicateError(candidates);
        }

        const [row] = await txDb
          .insert(customers)
          .values({
            companyId,
            kind: input.kind,
            name: input.name,
            domain,
            tags: input.tags ?? [],
            ownerUserId: input.ownerUserId ?? null,
            ownerAgentId: input.ownerAgentId ?? null,
            health: input.health ?? null,
            notes: input.notes ?? null,
          })
          .returning();

        await logActivity(txDb, {
          companyId,
          ...options.actor,
          action,
          entityType: "customer",
          entityId: row!.id,
          details: {
            name: row!.name,
            ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
            ...(candidates.length > 0 ? { forcedWithDuplicates: candidates.map((c) => c.record.id) } : {}),
          },
        });
        return { customer: row!, created: true };
      });
    },

    /** Updates fields. Setting status to archived stamps archivedAt and logs customer.archived. */
    update: async (companyId: string, id: string, input: UpdateCustomer, options: { actor: CrmActor }) => {
      const domain = input.domain === undefined ? undefined : input.domain ? normalizeDomain(input.domain) : null;
      if (input.domain && !domain) throw unprocessable("Invalid domain", { field: "domain" });

      return db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        const existing = await txDb
          .select()
          .from(customers)
          .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
          .then((rows) => rows[0] ?? null);
        if (!existing) return null;

        const patch: Partial<typeof customers.$inferInsert> = { updatedAt: new Date() };
        if (input.kind !== undefined) patch.kind = input.kind;
        if (input.name !== undefined) patch.name = input.name;
        if (domain !== undefined) patch.domain = domain;
        if (input.tags !== undefined) patch.tags = input.tags;
        if (input.ownerUserId !== undefined) patch.ownerUserId = input.ownerUserId;
        if (input.ownerAgentId !== undefined) patch.ownerAgentId = input.ownerAgentId;
        if (input.health !== undefined) patch.health = input.health;
        if (input.notes !== undefined) patch.notes = input.notes;
        if (input.status !== undefined) {
          patch.status = input.status;
          patch.archivedAt = input.status === "archived" ? (existing.archivedAt ?? new Date()) : null;
        }

        const [row] = await txDb
          .update(customers)
          .set(patch)
          .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
          .returning();

        const archived = existing.status !== "archived" && row!.status === "archived";
        await logActivity(txDb, {
          companyId,
          ...options.actor,
          action: archived ? "customer.archived" : "customer.updated",
          entityType: "customer",
          entityId: id,
          details: { changedFields: Object.keys(input).filter((key) => (input as Record<string, unknown>)[key] !== undefined) },
        });
        return row!;
      });
    },
  };
}
