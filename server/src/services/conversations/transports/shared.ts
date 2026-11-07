import { timingSafeEqual } from "node:crypto";

// Helpers shared by the Sprint 2 channel transports (Meta, Telegram, Twilio).

/** Constant-time string comparison. Different lengths compare unequal without throwing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Parses a provider response body. Returns null for empty or non-JSON bodies. */
export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value.trim() : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Provider error text, shortened. Never includes credentials because callers pass only provider bodies. */
export function shortProviderError(body: unknown, fallback: string): string {
  if (isRecord(body)) {
    const error = body.error;
    if (isRecord(error) && typeof error.message === "string") return error.message.slice(0, 300);
    if (typeof error === "string") return error.slice(0, 300);
    if (typeof body.description === "string") return body.description.slice(0, 300);
    if (typeof body.message === "string") return body.message.slice(0, 300);
  }
  return fallback;
}
