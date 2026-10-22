import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { notFound, tooManyRequests } from "../errors.js";
import { registerPublicLeadRoutes } from "./public/leads.js";
import { registerPublicChatRoutes } from "./public/chat.js";
import { registerPublicBookingRoutes } from "./public/booking.js";
import { registerPublicReviewRoutes } from "./public/review.js";

// Public surface mounted at /api/p. No company session: every route here is
// reached by anonymous visitors, so each one must scope itself to the company
// resolved from :companySlug and, when it acts on a record, verify a signed
// token.

export const PUBLIC_COMPANY_LOCALS_KEY = "publicCompanyId";

// ---------------------------------------------------------------- company slug

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves :companySlug to a company id. The companies table has no `slug`
 * column yet, so the segment must be the company id (UUID). When a slug column
 * is added, match it here before falling back to the id.
 */
export async function resolvePublicCompanyId(db: Db, companySlug: string): Promise<string | null> {
  if (!UUID_PATTERN.test(companySlug)) return null;
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companySlug))
    .limit(1);
  return row?.id ?? null;
}

// ---------------------------------------------------------------- signed tokens

export interface PublicTokenPayload {
  purpose: string;
  companyId: string;
  subject?: string;
  exp: number; // unix seconds
}

const DEV_SECRET_SEED = "paperclip-dev-public-token";

function publicTokenSecret(): Buffer {
  const configured = process.env.PAPERCLIP_PUBLIC_TOKEN_SECRET;
  if (configured && configured.length >= 16) return Buffer.from(configured, "utf8");
  if (process.env.NODE_ENV === "production") {
    throw new Error("PAPERCLIP_PUBLIC_TOKEN_SECRET must be set (>= 16 chars) in production");
  }
  // Dev fallback: derived from a stable seed so tokens survive a restart on one machine.
  const seed = process.env.BETTER_AUTH_SECRET ?? DEV_SECRET_SEED;
  return createHash("sha256").update(`${DEV_SECRET_SEED}:${seed}`).digest();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", publicTokenSecret()).update(encodedPayload).digest("base64url");
}

export function signPublicToken(
  input: { purpose: string; companyId: string; subject?: string; ttlSeconds: number },
  now: Date = new Date(),
): string {
  const payload: PublicTokenPayload = {
    purpose: input.purpose,
    companyId: input.companyId,
    ...(input.subject ? { subject: input.subject } : {}),
    exp: Math.floor(now.getTime() / 1000) + input.ttlSeconds,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

/** Returns the payload when the signature matches, the purpose matches and the token has not expired. */
export function verifyPublicToken(
  token: string,
  expected: { purpose: string; companyId?: string },
  now: Date = new Date(),
): PublicTokenPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;

  const expectedSignature = Buffer.from(sign(encoded));
  const actualSignature = Buffer.from(signature);
  if (expectedSignature.length !== actualSignature.length) return null;
  if (!timingSafeEqual(expectedSignature, actualSignature)) return null;

  let payload: PublicTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PublicTokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(now.getTime() / 1000)) return null;
  if (payload.purpose !== expected.purpose) return null;
  if (expected.companyId && payload.companyId !== expected.companyId) return null;
  return payload;
}

// ---------------------------------------------------------------- rate limit

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

/**
 * Fixed-window, per-IP, in-memory limiter. Good enough for a single instance;
 * multi-instance deployments need a shared store.
 */
export function publicRateLimit(options: { limit: number; windowMs: number }) {
  const buckets = new Map<string, RateLimitBucket>();
  let lastSweep = Date.now();

  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    if (now - lastSweep > options.windowMs) {
      for (const [key, bucket] of buckets) {
        if (now - bucket.windowStart >= options.windowMs) buckets.delete(key);
      }
      lastSweep = now;
    }

    const key = req.ip ?? "unknown";
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= options.windowMs) {
      bucket = { count: 0, windowStart: now };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.limit) {
      next(tooManyRequests("Too many requests"));
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------- router

export function publicSurfaceRoutes(db: Db) {
  const router = Router();

  router.use(publicRateLimit({ limit: 120, windowMs: 60_000 }));

  router.use("/:companySlug", async (req, res, next) => {
    try {
      const companyId = await resolvePublicCompanyId(db, req.params.companySlug as string);
      if (!companyId) throw notFound("Company not found");
      res.locals[PUBLIC_COMPANY_LOCALS_KEY] = companyId;
      next();
    } catch (error) {
      next(error);
    }
  });

  registerPublicLeadRoutes(router, db);
  registerPublicChatRoutes(router, db);
  registerPublicBookingRoutes(router, db);
  registerPublicReviewRoutes(router, db);

  return router;
}
