import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import {
  type Db,
  agents,
  conversations,
  conversationMessages,
  customers,
  leads,
  opportunities,
} from "@paperclipai/db";
import type {
  Conversation,
  ConversationMessage,
  CreateConversation,
  SetConversationState,
} from "@paperclipai/shared";
import { z } from "zod";
import { badRequest, notFound } from "../../errors.js";
import { logActivity } from "../activity-log.js";

/** Company-wide first-response target. Constant until company settings expose it. */
export const CONVERSATION_SLA_HOURS = 4;

export interface ConversationActor {
  userId?: string | null;
  agentId?: string | null;
}

export const conversationListQuerySchema = z.object({
  status: z.enum(["open", "waiting_us", "waiting_them", "closed"]).optional(),
  channel: z.enum(["email", "whatsapp", "messenger", "instagram", "telegram", "webchat", "voice", "sms"]).optional(),
  /** "none" lists unassigned conversations; any other value matches an assigned user or agent id. */
  assigned: z.string().trim().min(1).max(120).optional(),
  customerId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  cursor: z.string().regex(/^\d{1,9}$/).optional(),
});
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export interface ConversationPage {
  items: Conversation[];
  nextCursor: string | null;
}

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof conversationMessages.$inferSelect;

const iso = (value: Date | null) => (value ? value.toISOString() : null);

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    companyId: row.companyId,
    channel: row.channel as Conversation["channel"],
    contactId: row.contactId,
    customerId: row.customerId,
    opportunityId: row.opportunityId,
    leadId: row.leadId,
    externalThreadId: row.externalThreadId,
    subject: row.subject,
    status: row.status as Conversation["status"],
    priority: row.priority as Conversation["priority"],
    slaDueAt: iso(row.slaDueAt),
    assignedUserId: row.assignedUserId,
    assignedAgentId: row.assignedAgentId,
    lastMessageAt: iso(row.lastMessageAt),
    lastInboundAt: iso(row.lastInboundAt),
    lastOutboundAt: iso(row.lastOutboundAt),
    language: row.language,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toConversationMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    companyId: row.companyId,
    conversationId: row.conversationId,
    direction: row.direction as ConversationMessage["direction"],
    actorKind: row.actorKind as ConversationMessage["actorKind"],
    actorUserId: row.actorUserId,
    actorAgentId: row.actorAgentId,
    body: row.body,
    attachments: row.attachments,
    language: row.language,
    deliveryStatus: row.deliveryStatus as ConversationMessage["deliveryStatus"],
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    providerReceipt: row.providerReceipt ?? null,
    externalActionId: row.externalActionId,
    sentAt: iso(row.sentAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function activityActor(actor: ConversationActor) {
  if (actor.agentId) return { actorType: "agent" as const, actorId: actor.agentId, agentId: actor.agentId };
  return { actorType: "user" as const, actorId: actor.userId ?? "board", agentId: null };
}

/** Thread-level SLA: the first unanswered inbound message sets the deadline; an outbound clears it. */
export function slaDeadline(from: Date): Date {
  return new Date(from.getTime() + CONVERSATION_SLA_HOURS * 60 * 60 * 1000);
}

export function conversationService(db: Db) {
  async function loadRow(companyId: string, id: string): Promise<ConversationRow> {
    const [row] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.companyId, companyId), eq(conversations.id, id)))
      .limit(1);
    if (!row) throw notFound("Conversation not found");
    return row;
  }

  async function assertAgentInCompany(companyId: string, agentId: string) {
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), eq(agents.id, agentId)))
      .limit(1);
    if (!agent) throw badRequest("Agent not found in this company");
  }

  return {
    async list(companyId: string, query: ConversationListQuery): Promise<ConversationPage> {
      const filters: SQL[] = [eq(conversations.companyId, companyId)];
      if (query.status) filters.push(eq(conversations.status, query.status));
      if (query.channel) filters.push(eq(conversations.channel, query.channel));
      if (query.customerId) filters.push(eq(conversations.customerId, query.customerId));
      if (query.contactId) filters.push(eq(conversations.contactId, query.contactId));
      if (query.assigned === "none") {
        filters.push(isNull(conversations.assignedUserId), isNull(conversations.assignedAgentId));
      } else if (query.assigned) {
        const value = query.assigned;
        const match = or(eq(conversations.assignedUserId, value), eq(conversations.assignedAgentId, value));
        if (match) filters.push(match);
      }
      if (query.overdue === "true") {
        filters.push(
          eq(conversations.status, "waiting_us"),
          isNotNull(conversations.slaDueAt),
          lt(conversations.slaDueAt, new Date()),
        );
      }
      const offset = query.cursor ? Number(query.cursor) : 0;
      const rows = await db
        .select()
        .from(conversations)
        .where(and(...filters))
        .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, desc(conversations.id))
        .limit(query.limit)
        .offset(offset);
      return {
        items: rows.map(toConversation),
        nextCursor: rows.length === query.limit ? String(offset + query.limit) : null,
      };
    },

    /** Loads by id alone, for route-level access checks (getAccessibleResource). */
    async findById(id: string): Promise<Conversation | null> {
      const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      return row ? toConversation(row) : null;
    },

    async getById(companyId: string, id: string): Promise<Conversation | null> {
      const [row] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.companyId, companyId), eq(conversations.id, id)))
        .limit(1);
      return row ? toConversation(row) : null;
    },

    /** Messages in chronological order. The caller has already checked company access. */
    async messages(conversationId: string, limit = 500): Promise<ConversationMessage[]> {
      const rows = await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))
        .orderBy(asc(conversationMessages.createdAt), asc(conversationMessages.id))
        .limit(limit);
      return rows.map(toConversationMessage);
    },

    async create(companyId: string, input: CreateConversation, actor: ConversationActor): Promise<Conversation> {
      if (input.externalThreadId) {
        // Idempotent per (company, channel, thread): the same thread returns the existing conversation.
        const [existing] = await db
          .select()
          .from(conversations)
          .where(and(
            eq(conversations.companyId, companyId),
            eq(conversations.channel, input.channel),
            eq(conversations.externalThreadId, input.externalThreadId),
          ))
          .limit(1);
        if (existing) return toConversation(existing);
      }
      const row = await db.transaction(async (tx) => {
        const t = tx as unknown as Db;
        if (input.assignedAgentId) await assertAgentInCompany(companyId, input.assignedAgentId);
        const [created] = await t
          .insert(conversations)
          .values({
            companyId,
            channel: input.channel,
            contactId: input.contactId ?? null,
            customerId: input.customerId ?? null,
            opportunityId: input.opportunityId ?? null,
            leadId: input.leadId ?? null,
            externalThreadId: input.externalThreadId ?? null,
            subject: input.subject ?? null,
            priority: input.priority ?? "normal",
            language: input.language ?? null,
            assignedUserId: input.assignedUserId ?? null,
            assignedAgentId: input.assignedAgentId ?? null,
          })
          .returning();
        await logActivity(t, {
          companyId,
          ...activityActor(actor),
          action: "conversation.created",
          entityType: "conversation",
          entityId: created.id,
          details: { channel: input.channel },
        });
        return created;
      });
      return toConversation(row);
    },

    async setState(companyId: string, id: string, input: SetConversationState, actor: ConversationActor): Promise<Conversation> {
      const current = await loadRow(companyId, id);
      const [row] = await db
        .update(conversations)
        .set({
          status: input.status,
          priority: input.priority ?? current.priority,
          // Closing a thread clears the pending deadline; reopening waits for the customer again.
          slaDueAt: input.status === "closed" ? null : current.slaDueAt,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, id))
        .returning();
      await logActivity(db, {
        companyId,
        ...activityActor(actor),
        action: "conversation.state_changed",
        entityType: "conversation",
        entityId: id,
        details: { from: current.status, to: input.status, priority: row.priority },
      });
      return toConversation(row);
    },

    async assign(
      companyId: string,
      id: string,
      input: { assignedUserId?: string | null; assignedAgentId?: string | null },
      actor: ConversationActor,
    ): Promise<Conversation> {
      await loadRow(companyId, id);
      if (input.assignedAgentId) await assertAgentInCompany(companyId, input.assignedAgentId);
      const assignedAgentId = input.assignedAgentId ?? null;
      const assignedUserId = assignedAgentId ? null : (input.assignedUserId ?? null);
      const [row] = await db
        .update(conversations)
        .set({ assignedUserId, assignedAgentId, updatedAt: new Date() })
        .where(eq(conversations.id, id))
        .returning();
      await logActivity(db, {
        companyId,
        ...activityActor(actor),
        action: "conversation.assigned",
        entityType: "conversation",
        entityId: id,
        details: { assignedUserId, assignedAgentId },
      });
      return toConversation(row);
    },

    async link(
      companyId: string,
      id: string,
      input: { customerId?: string | null; opportunityId?: string | null; leadId?: string | null },
      actor: ConversationActor,
    ): Promise<Conversation> {
      await loadRow(companyId, id);
      if (input.customerId) {
        const [found] = await db.select({ id: customers.id }).from(customers)
          .where(and(eq(customers.companyId, companyId), eq(customers.id, input.customerId))).limit(1);
        if (!found) throw badRequest("Customer not found in this company");
      }
      if (input.opportunityId) {
        const [found] = await db.select({ id: opportunities.id }).from(opportunities)
          .where(and(eq(opportunities.companyId, companyId), eq(opportunities.id, input.opportunityId))).limit(1);
        if (!found) throw badRequest("Opportunity not found in this company");
      }
      if (input.leadId) {
        const [found] = await db.select({ id: leads.id }).from(leads)
          .where(and(eq(leads.companyId, companyId), eq(leads.id, input.leadId))).limit(1);
        if (!found) throw badRequest("Lead not found in this company");
      }
      const row = await db.transaction(async (tx) => {
        const t = tx as unknown as Db;
        const [updated] = await t
          .update(conversations)
          .set({
            ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
            ...(input.opportunityId !== undefined ? { opportunityId: input.opportunityId } : {}),
            ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, id))
          .returning();
        if (input.leadId) {
          await t.update(leads).set({ conversationId: id, updatedAt: new Date() })
            .where(and(eq(leads.companyId, companyId), eq(leads.id, input.leadId)));
        }
        await logActivity(t, {
          companyId,
          ...activityActor(actor),
          action: "conversation.linked",
          entityType: "conversation",
          entityId: id,
          details: { customerId: input.customerId ?? null, opportunityId: input.opportunityId ?? null, leadId: input.leadId ?? null },
        });
        return updated;
      });
      return toConversation(row);
    },

    /** Called by messageService when an outbound message is accepted as sent. */
    async recordOutboundSent(conversationId: string, sentAt: Date): Promise<void> {
      await db
        .update(conversations)
        .set({
          lastOutboundAt: sentAt,
          lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${sentAt}), ${sentAt})`,
          status: sql`case when ${conversations.status} = 'closed' then 'closed' else 'waiting_them' end`,
          slaDueAt: null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));
    },
  };
}
