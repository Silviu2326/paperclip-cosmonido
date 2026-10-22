import { and, eq, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { contactIdentities, contacts } from "@paperclipai/db";

// Normalization of contact identifiers. Every identifier stored in
// contact_identities goes through one of these functions so that lookups
// and the unique (company_id, channel, identifier) index agree.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercases and trims an email address. Returns null when it is not a plausible address. */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > 320) return null;
  return EMAIL_PATTERN.test(value) ? value : null;
}

const SPANISH_COUNTRY_CODE = "34";

/**
 * Normalizes a phone number to E.164.
 *
 * - Strips spaces, dashes, dots and parentheses.
 * - "00" prefix becomes "+".
 * - A leading "+" is kept; the remaining digits must be 8 to 15.
 * - Nine digits starting with 6, 7, 8 or 9 are read as a Spanish national
 *   number (+34). Eleven digits starting with 34 are read as +34 international.
 * - Any other bare digit string of 8 to 15 digits is taken as already
 *   international and gets a "+".
 *
 * Returns null when the input cannot be read as a phone number.
 */
export function normalizePhoneE164(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  let value = input.trim().replace(/[\s\-.()]/g, "");
  if (value.length === 0) return null;

  if (value.startsWith("00")) value = `+${value.slice(2)}`;

  if (value.startsWith("+")) {
    const digits = value.slice(1);
    if (!/^\d{8,15}$/.test(digits)) return null;
    return `+${digits}`;
  }

  if (!/^\d+$/.test(value)) return null;

  if (value.length === 9 && /^[6789]/.test(value)) return `+${SPANISH_COUNTRY_CODE}${value}`;
  if (value.length === 11 && value.startsWith(SPANISH_COUNTRY_CODE)) return `+${value}`;
  if (value.length >= 8 && value.length <= 15) return `+${value}`;
  return null;
}

/**
 * Normalizes a channel handle (Telegram, Instagram, Messenger, etc.): trims,
 * removes a leading "@" and lowercases. Returns null when empty.
 */
export function normalizeHandle(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().replace(/^@+/, "").toLowerCase();
  if (value.length === 0 || value.length > 120) return null;
  return value;
}

/** Normalizes an identifier for a given channel, dispatching to the right rule. */
export function normalizeIdentifier(channel: string, input: string | null | undefined): string | null {
  switch (channel) {
    case "email":
      return normalizeEmail(input);
    case "phone":
    case "whatsapp":
    case "sms":
      return normalizePhoneE164(input);
    default:
      return normalizeHandle(input);
  }
}

/**
 * Normalizes a web domain: strips protocol, "www.", path and trailing dot,
 * then lowercases. Returns null when the result is not a host name.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/)[0]!
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (host.length === 0 || host.length > 253) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  const valid = labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  return valid ? host : null;
}

const LEGAL_SUFFIX_TOKENS = new Set(["sl", "slu", "sa", "srl", "sas", "ltd", "llc", "inc", "gmbh", "bv", "co"]);

/**
 * Normalizes an organization name for duplicate detection: strips accents,
 * punctuation and case, and drops trailing legal-form suffixes such as
 * "S.L.", "SA" or "Ltd". Returns null when nothing is left.
 */
export function normalizeOrganizationName(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const value = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  let tokens = value.split(" ").filter((token) => token.length > 0);
  const last = tokens[tokens.length - 1];
  if (tokens.length > 2 && tokens[tokens.length - 2] === "s" && (last === "l" || last === "a")) {
    tokens = tokens.slice(0, -2);
  }
  while (tokens.length > 1 && LEGAL_SUFFIX_TOKENS.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.length > 0 ? tokens.join(" ") : null;
}

export interface IdentityInput {
  email?: string | null;
  phone?: string | null;
  handle?: string | null;
  channel?: string | null;
}

export interface IdentityKey {
  channel: string;
  identifier: string;
}

/**
 * Lookup keys for an inbound or form identity, in priority order.
 * A phone number is looked up as "phone" and "whatsapp" because the same
 * number may be stored under either channel.
 */
export function identityKeys(input: IdentityInput): IdentityKey[] {
  const keys: IdentityKey[] = [];
  const push = (channel: string, identifier: string | null) => {
    if (!identifier) return;
    if (keys.some((key) => key.channel === channel && key.identifier === identifier)) return;
    keys.push({ channel, identifier });
  };
  push("email", normalizeEmail(input.email));
  const phone = normalizePhoneE164(input.phone);
  push("phone", phone);
  push("whatsapp", phone);
  if (input.channel && input.channel !== "email" && input.channel !== "phone" && input.channel !== "whatsapp") {
    push(input.channel, normalizeHandle(input.handle));
  } else if (input.channel === "whatsapp" || input.channel === "phone") {
    push(input.channel, normalizePhoneE164(input.handle));
  }
  return keys;
}

export interface IdentityMatch<T> {
  contact: T;
  channel: string;
  identifier: string;
}

type ContactRow = typeof contacts.$inferSelect;

export function identityService(db: Db) {
  return {
    /**
     * Active contacts of the company whose normalized identity matches the input,
     * best match first. Read-only: never creates a contact or an identity.
     */
    findMatches: async (companyId: string, input: IdentityInput): Promise<IdentityMatch<ContactRow>[]> => {
      const keys = identityKeys(input);
      if (keys.length === 0) return [];

      const rows = await db
        .select({
          contact: contacts,
          channel: contactIdentities.channel,
          identifier: contactIdentities.identifier,
        })
        .from(contactIdentities)
        .innerJoin(contacts, eq(contacts.id, contactIdentities.contactId))
        .where(
          and(
            eq(contactIdentities.companyId, companyId),
            eq(contacts.companyId, companyId),
            eq(contacts.status, "active"),
            or(
              ...keys.map((key) =>
                and(eq(contactIdentities.channel, key.channel), eq(contactIdentities.identifier, key.identifier)),
              ),
            ),
          ),
        );

      const matches: IdentityMatch<ContactRow>[] = [];
      for (const key of keys) {
        for (const row of rows) {
          if (row.channel !== key.channel || row.identifier !== key.identifier) continue;
          if (matches.some((match) => match.contact.id === row.contact.id)) continue;
          matches.push({ contact: row.contact, channel: key.channel, identifier: key.identifier });
        }
      }

      // Fallback for contacts whose primary columns hold the value without an identity row.
      const email = normalizeEmail(input.email);
      const phone = normalizePhoneE164(input.phone);
      const primaryLookups: Array<{ column: typeof contacts.primaryEmail | typeof contacts.primaryPhone; value: string; channel: string }> = [];
      if (email) primaryLookups.push({ column: contacts.primaryEmail, value: email, channel: "email" });
      if (phone) primaryLookups.push({ column: contacts.primaryPhone, value: phone, channel: "phone" });
      for (const lookup of primaryLookups) {
        const hits = await db
          .select()
          .from(contacts)
          .where(
            and(eq(contacts.companyId, companyId), eq(contacts.status, "active"), eq(lookup.column, lookup.value)),
          );
        for (const hit of hits) {
          if (matches.some((match) => match.contact.id === hit.id)) continue;
          matches.push({ contact: hit, channel: lookup.channel, identifier: lookup.value });
        }
      }
      return matches;
    },

    /** The existing contact for this identity, or null. Never creates anything. */
    resolve: async (companyId: string, input: IdentityInput): Promise<ContactRow | null> => {
      const matches = await identityService(db).findMatches(companyId, input);
      return matches[0]?.contact ?? null;
    },
  };
}
