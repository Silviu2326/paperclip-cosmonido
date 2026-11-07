import type { Db } from "@paperclipai/db";
import type { CrmActor } from "../crm/common.js";
import { contactService } from "../crm/contacts.js";
import { identityService, normalizeEmail, normalizePhoneE164 } from "../crm/identity.js";

export interface BookingAttendee {
  name: string;
  email: string;
  phone?: string | null;
}

/**
 * Contact for a booking attendee: the existing contact that owns the normalized email or
 * phone in this company, or a new one. The booking has already passed its slot checks, so
 * the new contact is created with force (no duplicate prompt). `actor` is the same actor the
 * booking logs in the activity log (the host, or the public-booking system actor).
 */
export async function resolveBookingContact(
  db: Db,
  companyId: string,
  attendee: BookingAttendee,
  actor: CrmActor,
): Promise<string> {
  const email = normalizeEmail(attendee.email);
  const phone = normalizePhoneE164(attendee.phone ?? null);

  const existing = await identityService(db).resolve(companyId, { email, phone });
  if (existing) return existing.id;

  const { contact } = await contactService(db).create(
    companyId,
    {
      displayName: attendee.name.trim() || email || phone || "Contacto",
      primaryEmail: email,
      primaryPhone: phone,
      consents: {},
    },
    { actor, force: true },
  );
  return contact.id;
}
