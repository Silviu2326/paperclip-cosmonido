import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { contactIdentities, contacts, customerContacts, customers, opportunities } from "@paperclipai/db";
import { normalizeEmail, normalizeHandle, normalizePhoneE164 } from "../crm/identity.js";

// Minimal local adapters used by the leads track (pista B) until the CRM tracks
// land their services. Each one has a TODO naming the owner service that
// replaces it at integration:
//   - identity lookup/creation  -> services/crm/identity.ts (A1 identityService)
//   - contact creation          -> services/crm/contacts.ts (A1 contactService)
//   - customer creation         -> services/crm/customers.ts (A1 customerService)
//   - opportunity creation      -> services/crm/opportunities.ts (A2 opportunityService.create,
//                                  which also ensures the 'sales' pipeline and stage)

type Tx = Pick<Db, "select" | "insert" | "update">;

export interface IdentityKey {
  channel: string;
  identifier: string;
}

export interface IdentityInput {
  email?: string | null;
  phone?: string | null;
  handle?: string | null;
  channel?: string | null;
}

/** Normalized (channel, identifier) keys for an inbound identity. Unreadable values are dropped. */
export function identityKeys(input: IdentityInput): IdentityKey[] {
  const keys: IdentityKey[] = [];
  const email = normalizeEmail(input.email ?? null);
  if (email) keys.push({ channel: "email", identifier: email });
  const phone = normalizePhoneE164(input.phone ?? null);
  if (phone) {
    const channel = input.channel === "whatsapp" || input.channel === "sms" ? input.channel : "phone";
    keys.push({ channel, identifier: phone });
  }
  const handle = normalizeHandle(input.handle ?? null);
  if (handle && input.channel && !["email", "phone", "whatsapp", "sms"].includes(input.channel)) {
    keys.push({ channel: input.channel, identifier: handle });
  }
  return keys;
}

/** TODO(A1): replace with identityService.resolve. Returns the contact that already owns one of the keys. */
export async function findContactByIdentity(tx: Tx, companyId: string, keys: IdentityKey[]): Promise<string | null> {
  for (const key of keys) {
    const [row] = await tx
      .select({ contactId: contactIdentities.contactId })
      .from(contactIdentities)
      .where(and(
        eq(contactIdentities.companyId, companyId),
        eq(contactIdentities.channel, key.channel),
        eq(contactIdentities.identifier, key.identifier),
      ))
      .limit(1);
    if (row) return row.contactId;
  }
  return null;
}

/** TODO(A1): replace with contactService.create. */
export async function createContactWithIdentities(
  tx: Tx,
  companyId: string,
  input: { displayName: string; language?: string | null; keys: IdentityKey[]; source: string },
): Promise<string> {
  const [contact] = await tx
    .insert(contacts)
    .values({
      companyId,
      displayName: input.displayName,
      language: input.language ?? null,
      primaryEmail: input.keys.find((key) => key.channel === "email")?.identifier ?? null,
      primaryPhone: input.keys.find((key) => key.channel === "phone")?.identifier ?? null,
    })
    .returning({ id: contacts.id });
  if (input.keys.length > 0) {
    await tx
      .insert(contactIdentities)
      .values(input.keys.map((key) => ({
        companyId,
        contactId: contact.id,
        channel: key.channel,
        identifier: key.identifier,
        source: input.source,
      })))
      .onConflictDoNothing();
  }
  return contact.id;
}

/** TODO(A1): replace with customerService.create. */
export async function createCustomer(
  tx: Tx,
  companyId: string,
  input: { name: string; kind: "person" | "organization" },
): Promise<string> {
  const [row] = await tx
    .insert(customers)
    .values({ companyId, name: input.name, kind: input.kind })
    .returning({ id: customers.id });
  return row.id;
}

/** Links a contact to a customer. Idempotent: the (customer_id, contact_id) pair is unique. */
export async function linkCustomerContact(
  tx: Tx,
  companyId: string,
  input: { customerId: string; contactId: string; isPrimary: boolean },
): Promise<void> {
  await tx
    .insert(customerContacts)
    .values({ companyId, customerId: input.customerId, contactId: input.contactId, isPrimary: input.isPrimary })
    .onConflictDoNothing();
}

/** TODO(A2): replace with opportunityService.create (sales pipeline, stage and version handling). */
export async function createOpportunity(
  tx: Tx,
  companyId: string,
  input: { customerId: string; primaryContactId: string | null; title: string; source: string },
): Promise<string> {
  const [row] = await tx
    .insert(opportunities)
    .values({
      companyId,
      customerId: input.customerId,
      primaryContactId: input.primaryContactId,
      title: input.title,
      source: input.source,
      status: "open",
    })
    .returning({ id: opportunities.id });
  return row.id;
}
