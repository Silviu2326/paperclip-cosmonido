import type { Db } from "@paperclipai/db";

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

export function identityService(db: Db) {
  void db;
  return {
    // TODO pista A: resolución de identidades (buscar contacto por identificador normalizado) y deduplicación.
  };
}
