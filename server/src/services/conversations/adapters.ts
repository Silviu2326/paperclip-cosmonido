import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type Db, contactIdentities, customerContacts, leads } from "@paperclipai/db";
import { LEAD_SOURCES, type ConversationChannel, type LeadSource } from "@paperclipai/shared";
import { normalizeEmail, normalizeIdentifier, normalizePhoneE164 } from "../crm/identity.js";

// Local stand-ins for identityService.resolve (pista A1) and intakeService.ingest (pista B).
// They keep the inbound path working until those services exist; integration replaces both
// call sites in inbound.ts and removes this file. TODO(A1/B): delete when the real services land.

export interface InboundFrom {
  email?: string | null;
  phone?: string | null;
  handle?: string | null;
}

/** TODO(A1): replace with identityService.resolve(companyId, { email, phone, handle, channel }). */
export async function resolveContactForInbound(
  db: Db,
  companyId: string,
  channel: ConversationChannel,
  from: InboundFrom,
): Promise<{ contactId: string; customerId: string | null } | null> {
  const candidates: { channel: string; identifier: string }[] = [];
  const email = normalizeEmail(from.email);
  if (email) candidates.push({ channel: "email", identifier: email });
  const phone = normalizePhoneE164(from.phone);
  if (phone) {
    candidates.push({ channel: "phone", identifier: phone });
    if (channel === "whatsapp" || channel === "sms") candidates.push({ channel, identifier: phone });
  }
  const handle = normalizeIdentifier(channel, from.handle);
  if (handle && channel !== "email" && channel !== "sms") candidates.push({ channel, identifier: handle });
  if (candidates.length === 0) return null;

  const rows = await db
    .select({ contactId: contactIdentities.contactId, channel: contactIdentities.channel, identifier: contactIdentities.identifier })
    .from(contactIdentities)
    .where(and(
      eq(contactIdentities.companyId, companyId),
      inArray(contactIdentities.identifier, candidates.map((c) => c.identifier)),
    ));
  const match = rows.find((row) => candidates.some((c) => c.channel === row.channel && c.identifier === row.identifier));
  if (!match) return null;

  const [primary] = await db
    .select({ customerId: customerContacts.customerId })
    .from(customerContacts)
    .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.contactId, match.contactId)))
    .orderBy(desc(customerContacts.isPrimary))
    .limit(1);
  return { contactId: match.contactId, customerId: primary?.customerId ?? null };
}

/** TODO(B): replace with intakeService.ingest(companyId, { source, sourceRef, payload, identity, language }). */
export async function ensureLeadForInbound(
  db: Db,
  companyId: string,
  input: { channel: ConversationChannel; sourceRef: string; payload: Record<string, unknown>; contactId: string | null; language: string | null },
): Promise<string> {
  const source: LeadSource = (LEAD_SOURCES as readonly string[]).includes(input.channel) ? (input.channel as LeadSource) : "api";
  const [created] = await db
    .insert(leads)
    .values({
      companyId,
      source,
      sourceRef: input.sourceRef,
      payload: input.payload,
      status: "new",
      contactId: input.contactId,
      language: input.language,
    })
    .onConflictDoNothing({
      target: [leads.companyId, leads.source, leads.sourceRef],
      where: sqlNotNull(leads.sourceRef),
    })
    .returning({ id: leads.id });
  if (created) return created.id;
  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.companyId, companyId), eq(leads.source, source), eq(leads.sourceRef, input.sourceRef)))
    .limit(1);
  if (!existing) throw new Error("Lead for inbound message could not be created");
  return existing.id;
}

function sqlNotNull(column: unknown) {
  return sql`${column} is not null`;
}
