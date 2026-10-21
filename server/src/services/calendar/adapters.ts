import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { contactIdentities, contacts } from "@paperclipai/db";
import { normalizeEmail, normalizePhoneE164 } from "../crm/identity.js";

// Local contact resolution for bookings. TODO(integración S2): once pista A1
// ships identityService.resolve and contactService.create, replace this
// function with those calls and delete the direct table access below.

export interface BookingAttendee {
  name: string;
  email: string;
  phone?: string | null;
}

/**
 * Finds the contact that owns the attendee's normalized email or phone in this
 * company, or creates one with both identities. Returns the contact id.
 */
export async function resolveBookingContact(db: Db, companyId: string, attendee: BookingAttendee): Promise<string> {
  const email = normalizeEmail(attendee.email);
  const phone = normalizePhoneE164(attendee.phone ?? null);
  const identities: Array<{ channel: "email" | "phone"; identifier: string }> = [];
  if (email) identities.push({ channel: "email", identifier: email });
  if (phone) identities.push({ channel: "phone", identifier: phone });

  for (const identity of identities) {
    const [existing] = await db
      .select({ contactId: contactIdentities.contactId })
      .from(contactIdentities)
      .where(and(
        eq(contactIdentities.companyId, companyId),
        eq(contactIdentities.channel, identity.channel),
        eq(contactIdentities.identifier, identity.identifier),
      ))
      .limit(1);
    if (existing) return existing.contactId;
  }

  const [created] = await db
    .insert(contacts)
    .values({
      companyId,
      displayName: attendee.name.trim() || email || phone || "Contacto",
      primaryEmail: email,
      primaryPhone: phone,
    })
    .returning({ id: contacts.id });

  if (identities.length > 0) {
    await db
      .insert(contactIdentities)
      .values(identities.map((identity) => ({
        companyId,
        contactId: created.id,
        channel: identity.channel,
        identifier: identity.identifier,
        source: "booking",
      })))
      .onConflictDoNothing();
  }
  return created.id;
}
