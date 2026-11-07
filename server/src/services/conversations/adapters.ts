import { desc, eq, and } from "drizzle-orm";
import { type Db, customerContacts, leads } from "@paperclipai/db";
import { LEAD_SOURCES, type ConversationChannel, type LeadSource } from "@paperclipai/shared";
import { identityService } from "../crm/identity.js";
import { leadIntakeService } from "../leads/intake.js";

// Bridges from the inbound path to the CRM services: identity resolution (crm/identity.ts)
// and lead intake (leads/intake.ts). Kept here only for the customer link lookup and the
// channel-to-lead-source mapping.

export interface InboundFrom {
  email?: string | null;
  phone?: string | null;
  handle?: string | null;
}

/** Existing contact for the inbound identity (read-only) and its primary customer, if any. */
export async function resolveContactForInbound(
  db: Db,
  companyId: string,
  channel: ConversationChannel,
  from: InboundFrom,
): Promise<{ contactId: string; customerId: string | null } | null> {
  const contact = await identityService(db).resolve(companyId, {
    email: from.email ?? null,
    phone: from.phone ?? null,
    handle: from.handle ?? null,
    channel,
  });
  if (!contact) return null;

  const [primary] = await db
    .select({ customerId: customerContacts.customerId })
    .from(customerContacts)
    .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.contactId, contact.id)))
    .orderBy(desc(customerContacts.isPrimary))
    .limit(1);
  return { contactId: contact.id, customerId: primary?.customerId ?? null };
}

/**
 * Lead for an inbound thread. Idempotent per (company, source, externalThreadId): the
 * intake service returns the existing lead for a repeated thread.
 */
export async function ensureLeadForInbound(
  db: Db,
  companyId: string,
  input: {
    channel: ConversationChannel;
    sourceRef: string;
    payload: Record<string, unknown>;
    from: InboundFrom;
    contactId: string | null;
    language: string | null;
  },
): Promise<string> {
  const source: LeadSource = (LEAD_SOURCES as readonly string[]).includes(input.channel) ? (input.channel as LeadSource) : "api";
  const { lead } = await leadIntakeService(db).ingest(companyId, {
    source,
    sourceRef: input.sourceRef,
    payload: input.payload,
    identity: { ...input.from, channel: input.channel },
    language: input.language,
  });
  // The conversation may already know its contact while this message carries no identity
  // that resolves to it. Keep the link on a lead that has none yet.
  if (!lead.contactId && input.contactId) {
    await db
      .update(leads)
      .set({ contactId: input.contactId, updatedAt: new Date() })
      .where(and(eq(leads.id, lead.id), eq(leads.companyId, companyId)));
  }
  return lead.id;
}
