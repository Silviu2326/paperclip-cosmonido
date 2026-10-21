import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { crmActivities, customers, contacts, leads } from "@paperclipai/db";
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  crmListQuerySchema,
  type ConvertLead,
  type UpdateLead,
} from "@paperclipai/shared";
import { conflict, notFound } from "../../errors.js";
import { decodeCursor, toPage, type CrmActor } from "../crm/common.js";
import { normalizeEmail, normalizePhoneE164 } from "../crm/identity.js";
import {
  createContactWithIdentities,
  createCustomer,
  createOpportunity,
  findContactByIdentity,
  identityKeys,
  linkCustomerContact,
} from "./adapters.js";

// Local validators for the leads queue. They sit next to the service because the
// shared CRM validators are owned by the contract; integration may move them.

export const leadListQuerySchema = crmListQuerySchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  /** "unassigned" | "user:<userId>" | "agent:<agentId>" */
  assigned: z.string().trim().min(1).max(200).optional(),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

export const triageLeadSchema = z
  .object({
    priority: z.enum(LEAD_PRIORITIES).optional().nullable(),
    language: z.string().trim().min(2).max(10).optional().nullable(),
    assignedUserId: z.string().trim().min(1).max(200).optional().nullable(),
    assignedAgentId: z.string().uuid().optional().nullable(),
  })
  .refine((value) => !(value.assignedUserId && value.assignedAgentId), {
    message: "Assign to a user or an agent, not both",
  });
export type TriageLead = z.infer<typeof triageLeadSchema>;

export const discardLeadSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type DiscardLead = z.infer<typeof discardLeadSchema>;

export type LeadRow = typeof leads.$inferSelect;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function activityActor(actor: CrmActor) {
  return {
    actorUserId: actor.actorType === "user" ? actor.actorId : null,
    actorAgentId: actor.agentId ?? null,
  };
}

export function leadService(db: Db) {
  async function getRow(id: string): Promise<LeadRow | null> {
    const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return row ?? null;
  }

  async function assertCustomerInCompany(tx: Pick<Db, "select">, companyId: string, id: string) {
    const rows = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
      .limit(1);
    if (rows.length === 0) throw notFound("Customer not found");
  }

  async function assertContactInCompany(tx: Pick<Db, "select">, companyId: string, id: string) {
    const rows = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.companyId, companyId)))
      .limit(1);
    if (rows.length === 0) throw notFound("Contact not found");
  }

  async function recordStatusChange(
    tx: Pick<Db, "insert">,
    lead: LeadRow,
    actor: CrmActor,
    summary: string,
    payload: Record<string, unknown>,
    externalRef?: string | null,
  ) {
    await tx.insert(crmActivities).values({
      companyId: lead.companyId,
      subjectKind: "lead",
      subjectId: lead.id,
      kind: "status_change",
      ...activityActor(actor),
      summary,
      payload,
      externalRef: externalRef ?? null,
    });
  }

  return {
    getRow,

    async list(companyId: string, query: LeadListQuery) {
      const conditions: SQL[] = [eq(leads.companyId, companyId)];
      if (query.status) conditions.push(eq(leads.status, query.status));
      if (query.source) conditions.push(eq(leads.source, query.source));
      if (query.priority) conditions.push(eq(leads.priority, query.priority));
      if (query.assigned === "unassigned") {
        conditions.push(sql`${leads.assignedUserId} is null and ${leads.assignedAgentId} is null`);
      } else if (query.assigned?.startsWith("user:")) {
        conditions.push(eq(leads.assignedUserId, query.assigned.slice("user:".length)));
      } else if (query.assigned?.startsWith("agent:")) {
        conditions.push(eq(leads.assignedAgentId, query.assigned.slice("agent:".length)));
      } else if (query.assigned) {
        throw notFound("Unknown assignment filter");
      }
      if (query.q) {
        conditions.push(sql`${leads.payload}::text ilike ${`%${escapeLike(query.q)}%`}`);
      }
      const cursor = decodeCursor(query.cursor);
      if (cursor) {
        const older = or(
          lt(leads.updatedAt, cursor.updatedAt),
          and(eq(leads.updatedAt, cursor.updatedAt), lt(leads.id, cursor.id)),
        );
        if (older) conditions.push(older);
      }
      const rows = await db
        .select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(desc(leads.updatedAt), desc(leads.id))
        .limit(query.limit + 1);
      return toPage(rows, query.limit);
    },

    async getById(id: string) {
      return getRow(id);
    },

    /** Activity recorded on one lead (receipts, triage, conversion). Newest first. */
    async activity(leadId: string) {
      return db
        .select()
        .from(crmActivities)
        .where(and(eq(crmActivities.subjectKind, "lead"), eq(crmActivities.subjectId, leadId)))
        .orderBy(desc(crmActivities.occurredAt))
        .limit(100);
    },

    async update(id: string, input: UpdateLead, actor: CrmActor) {
      const current = await getRow(id);
      if (!current) throw notFound("Lead not found");
      const patch: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
      if (input.sourceRef !== undefined) patch.sourceRef = input.sourceRef ?? null;
      if (input.payload !== undefined) patch.payload = input.payload;
      if (input.priority !== undefined) patch.priority = input.priority ?? null;
      if (input.language !== undefined) patch.language = input.language ?? null;
      if (input.contactId !== undefined) patch.contactId = input.contactId ?? null;
      if (input.customerId !== undefined) patch.customerId = input.customerId ?? null;
      if (input.assignedUserId !== undefined) patch.assignedUserId = input.assignedUserId ?? null;
      if (input.assignedAgentId !== undefined) patch.assignedAgentId = input.assignedAgentId ?? null;
      return db.transaction(async (tx) => {
        if (input.contactId) await assertContactInCompany(tx, current.companyId, input.contactId);
        if (input.customerId) await assertCustomerInCompany(tx, current.companyId, input.customerId);
        const [updated] = await tx.update(leads).set(patch).where(eq(leads.id, id)).returning();
        await recordStatusChange(tx, updated, actor, "Lead actualizado", {
          fields: Object.keys(patch).filter((key) => key !== "updatedAt"),
        });
        return updated;
      });
    },

    /** Sets priority, language and assignment. A 'new' lead becomes 'triaged'. */
    async triage(id: string, input: TriageLead, actor: CrmActor) {
      return db.transaction(async (tx) => {
        const [lead] = await tx.select().from(leads).where(eq(leads.id, id)).for("update");
        if (!lead) throw notFound("Lead not found");
        if (lead.status === "converted" || lead.status === "discarded") {
          throw conflict(`Lead is ${lead.status} and cannot be triaged`, { status: lead.status });
        }
        const patch: Partial<typeof leads.$inferInsert> = {
          status: lead.status === "new" ? "triaged" : lead.status,
          updatedAt: new Date(),
        };
        if (input.priority !== undefined) patch.priority = input.priority ?? null;
        if (input.language !== undefined) patch.language = input.language ?? null;
        if (input.assignedUserId !== undefined) {
          patch.assignedUserId = input.assignedUserId ?? null;
          patch.assignedAgentId = null;
        }
        if (input.assignedAgentId !== undefined) {
          patch.assignedAgentId = input.assignedAgentId ?? null;
          if (input.assignedAgentId) patch.assignedUserId = null;
        }
        const [updated] = await tx.update(leads).set(patch).where(eq(leads.id, id)).returning();
        await recordStatusChange(tx, updated, actor, `Lead triado: ${updated.status}`, {
          from: lead.status,
          to: updated.status,
          priority: updated.priority,
          assignedUserId: updated.assignedUserId,
          assignedAgentId: updated.assignedAgentId,
        });
        return updated;
      });
    },

    /**
     * Converts a lead into a customer, contact and (optionally) an opportunity.
     * Idempotent per idempotencyKey: a repeated key returns the lead without writing.
     * A different key on an already converted lead is a conflict.
     */
    async convert(id: string, input: ConvertLead, actor: CrmActor): Promise<{ lead: LeadRow; replayed: boolean }> {
      return db.transaction(async (tx) => {
        const [lead] = await tx.select().from(leads).where(eq(leads.id, id)).for("update");
        if (!lead) throw notFound("Lead not found");

        const externalRef = `lead-convert:${input.idempotencyKey}`;
        const [previous] = await tx
          .select({ id: crmActivities.id })
          .from(crmActivities)
          .where(and(
            eq(crmActivities.companyId, lead.companyId),
            eq(crmActivities.subjectKind, "lead"),
            eq(crmActivities.subjectId, lead.id),
            eq(crmActivities.externalRef, externalRef),
          ))
          .limit(1);
        if (previous) return { lead, replayed: true };

        if (lead.status === "converted") {
          throw conflict("Lead was already converted with another idempotency key", {
            customerId: lead.customerId,
            contactId: lead.contactId,
            opportunityId: lead.opportunityId,
          });
        }
        if (lead.status === "discarded") throw conflict("Discarded leads cannot be converted");

        if (input.customerId) await assertCustomerInCompany(tx, lead.companyId, input.customerId);
        if (input.contactId) await assertContactInCompany(tx, lead.companyId, input.contactId);

        const payload = (lead.payload ?? {}) as Record<string, unknown>;
        const companyName = text(payload.company);
        const personName = text(payload.name);
        const email = normalizeEmail(text(payload.email));
        const phone = normalizePhoneE164(text(payload.phone));
        const keys = identityKeys({ email, phone, channel: null });
        const displayName = personName ?? companyName ?? email ?? phone ?? "Lead";

        let contactId: string | null = input.contactId ?? lead.contactId ?? null;
        if (!contactId && keys.length > 0) {
          contactId = await findContactByIdentity(tx, lead.companyId, keys);
        }
        if (!contactId && (personName || email || phone)) {
          contactId = await createContactWithIdentities(tx, lead.companyId, {
            displayName,
            language: lead.language,
            keys,
            source: lead.source,
          });
        }

        const wantsOpportunity = input.createOpportunity === true;
        let customerId: string | null = input.customerId ?? lead.customerId ?? null;
        if (!customerId && (companyName || contactId || wantsOpportunity)) {
          customerId = await createCustomer(tx, lead.companyId, {
            name: companyName ?? displayName,
            kind: companyName ? "organization" : "person",
          });
        }
        if (customerId && contactId) {
          await linkCustomerContact(tx, lead.companyId, { customerId, contactId, isPrimary: true });
        }

        let opportunityId: string | null = lead.opportunityId ?? null;
        if (wantsOpportunity && customerId && !opportunityId) {
          opportunityId = await createOpportunity(tx, lead.companyId, {
            customerId,
            primaryContactId: contactId,
            title: input.opportunityTitle ?? `${companyName ?? displayName} (${lead.source})`,
            source: lead.source,
          });
        }

        const now = new Date();
        const [updated] = await tx
          .update(leads)
          .set({
            status: "converted",
            customerId,
            contactId,
            opportunityId,
            convertedAt: now,
            updatedAt: now,
          })
          .where(eq(leads.id, id))
          .returning();
        await recordStatusChange(tx, updated, actor, "Lead convertido", {
          from: lead.status,
          to: "converted",
          customerId,
          contactId,
          opportunityId,
        }, externalRef);
        return { lead: updated, replayed: false };
      });
    },

    async discard(id: string, input: DiscardLead, actor: CrmActor) {
      return db.transaction(async (tx) => {
        const [lead] = await tx.select().from(leads).where(eq(leads.id, id)).for("update");
        if (!lead) throw notFound("Lead not found");
        if (lead.status === "discarded") return lead;
        if (lead.status === "converted") throw conflict("Converted leads cannot be discarded");
        const [updated] = await tx
          .update(leads)
          .set({ status: "discarded", discardReason: input.reason ?? null, updatedAt: new Date() })
          .where(eq(leads.id, id))
          .returning();
        await recordStatusChange(tx, updated, actor, "Lead descartado", {
          from: lead.status,
          to: "discarded",
          reason: input.reason ?? null,
        });
        return updated;
      });
    },
  };
}
