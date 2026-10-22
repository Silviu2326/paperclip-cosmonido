import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { type Db, assets, companies, companyLogos } from "@paperclipai/db";
import { HttpError, badRequest, notFound, tooManyRequests, unauthorized } from "../../errors.js";
import { getStorageService } from "../../storage/index.js";
import { verifySessionToken, webchatService } from "../../services/conversations/transports/webchat.js";
import { WEBCHAT_MAX_MESSAGE_CHARS, WEBCHAT_PAGE_SIZE } from "../../services/conversations/webchat-constants.js";
import { webchatSettingsService } from "../../services/conversations/webchat-settings.js";
import { PUBLIC_COMPANY_LOCALS_KEY, publicRateLimit } from "../public-surface.js";

// Public web chat (pista F), mounted under /p by public-surface.ts. The company comes from
// :companySlug (res.locals.publicCompanyId). Every route that touches a session needs
// `Authorization: Bearer <session token>` and the token must belong to that company and session.
//
//   GET  /:companySlug/chat/config                     widget settings (enabled, name, greeting, color, logo)
//   GET  /:companySlug/chat/logo                       company logo for the widget (raster types only)
//   POST /:companySlug/chat/session                    anonymous session and its 24 h token
//   POST /:companySlug/chat/:sessionId/identify        optional email or phone (lead and contact, once)
//   POST /:companySlug/chat/:sessionId/messages        visitor message { body, seq }
//   GET  /:companySlug/chat/:sessionId/messages?after  poll: visible messages from offset `after`
//   GET  /:companySlug/widget.js                       embeddable script

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HONEYPOT_FIELD = "website";
const MAX_BODY_BYTES = 4096;
const MESSAGE_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;
const SESSION_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;
const MAX_AFTER = 1_000_000;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const WIDGET_PATH = fileURLToPath(new URL("../../public/widget.js", import.meta.url));

const messageSchema = z.object({
  body: z.string().trim().min(1).max(WEBCHAT_MAX_MESSAGE_CHARS),
  seq: z.number().int().min(1).max(1_000_000_000),
});

const identifySchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().max(320).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** Fixed-window limiter keyed by session id (30 messages per minute by default). */
function keyedRateLimit(options: { limit: number; windowMs: number }) {
  const buckets = new Map<string, { count: number; windowStart: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    if (buckets.size > 10_000) {
      for (const [bucketKey, bucket] of buckets) {
        if (now - bucket.windowStart >= options.windowMs) buckets.delete(bucketKey);
      }
    }
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= options.windowMs) {
      bucket = { count: 0, windowStart: now };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= options.limit;
  };
}

function companyIdOf(res: Response): string {
  const companyId = res.locals[PUBLIC_COMPANY_LOCALS_KEY];
  if (typeof companyId !== "string") throw notFound("Company not found");
  return companyId;
}

function sessionIdOf(req: Request): string {
  const sessionId = String(req.params.sessionId ?? "");
  if (!UUID_PATTERN.test(sessionId)) throw unauthorized("Invalid or expired chat session");
  return sessionId;
}

/** Honeypot: a filled hidden field means a bot. The caller answers as if it had worked and stores nothing. */
function honeypotFilled(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const value = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof value === "string" && value.trim() !== "";
}

function enforceBodySize(req: Request, _res: Response, next: NextFunction) {
  // The app-wide JSON parser has already read the body (10 MB limit); this caps what chat accepts.
  const bytes = Buffer.byteLength(JSON.stringify(req.body ?? {}) ?? "", "utf8");
  if (bytes > MAX_BODY_BYTES) {
    next(new HttpError(413, "Request body is too large"));
    return;
  }
  next();
}

async function companyLogoAsset(db: Db, companyId: string) {
  const [row] = await db
    .select({ objectKey: assets.objectKey, contentType: assets.contentType, byteSize: assets.byteSize })
    .from(companyLogos)
    .innerJoin(assets, eq(assets.id, companyLogos.assetId))
    .where(eq(companyLogos.companyId, companyId))
    .limit(1);
  return row ?? null;
}

export function registerPublicChatRoutes(router: Router, db: Db): void {
  const settings = webchatSettingsService(db);
  const chat = webchatService(db);
  const messageRate = keyedRateLimit(MESSAGE_RATE_LIMIT);
  const sessionRate = publicRateLimit(SESSION_RATE_LIMIT);

  /** Only a session token of this company for this session gets past this point. */
  function requireSession(req: Request, res: Response, next: NextFunction) {
    try {
      const companyId = companyIdOf(res);
      const sessionId = sessionIdOf(req);
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
      if (!token || !verifySessionToken(token, companyId, sessionId)) {
        throw unauthorized("Invalid or expired chat session");
      }
      next();
    } catch (error) {
      next(error);
    }
  }

  async function requireEnabled(companyId: string) {
    const current = await settings.get(companyId);
    if (!current.active) throw notFound("Chat is not enabled");
  }

  router.get("/:companySlug/chat/config", async (req, res, next) => {
    try {
      const companyId = companyIdOf(res);
      const current = await settings.get(companyId);
      res.setHeader("Cache-Control", "no-cache");
      if (!current.active) {
        res.json({ enabled: false });
        return;
      }
      const [company] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      const logo = await companyLogoAsset(db, companyId);
      res.json({
        enabled: true,
        name: company?.name ?? "",
        greeting: current.greeting,
        brandColor: current.brandColor,
        logoUrl: logo && LOGO_TYPES.has(logo.contentType) ? `/api/p/${String(req.params.companySlug)}/chat/logo` : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:companySlug/chat/logo", async (req, res, next) => {
    try {
      const companyId = companyIdOf(res);
      await requireEnabled(companyId);
      const logo = await companyLogoAsset(db, companyId);
      if (!logo || !LOGO_TYPES.has(logo.contentType)) throw notFound("Logo not found");

      const storage = getStorageService();
      const head = await storage.headObject(companyId, logo.objectKey);
      if (!head.exists) throw notFound("Logo not found");
      const object = await storage.getObject(companyId, logo.objectKey);

      res.setHeader("Content-Type", logo.contentType);
      res.setHeader("Content-Length", String(logo.byteSize || head.contentLength || object.contentLength || 0));
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("X-Content-Type-Options", "nosniff");
      object.stream.on("error", (error) => next(error));
      object.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:companySlug/chat/session", sessionRate, enforceBodySize, async (req, res, next) => {
    try {
      const companyId = companyIdOf(res);
      if (honeypotFilled(req.body)) {
        res.status(201).json({ ok: true });
        return;
      }
      await requireEnabled(companyId);
      const session = chat.createSession(companyId);
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:companySlug/chat/:sessionId/identify",
    requireSession,
    enforceBodySize,
    async (req, res, next) => {
      try {
        const companyId = companyIdOf(res);
        const sessionId = sessionIdOf(req);
        if (honeypotFilled(req.body)) {
          res.status(201).json({ ok: true });
          return;
        }
        await requireEnabled(companyId);
        const parsed = identifySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          throw badRequest("Invalid identification", parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })));
        }
        await chat.identify(companyId, sessionId, parsed.data);
        res.setHeader("Cache-Control", "no-store");
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:companySlug/chat/:sessionId/messages",
    requireSession,
    enforceBodySize,
    async (req, res, next) => {
      try {
        const companyId = companyIdOf(res);
        const sessionId = sessionIdOf(req);
        if (!messageRate(sessionId)) {
          throw tooManyRequests("Too many messages. Wait a minute and try again.");
        }
        if (honeypotFilled(req.body)) {
          res.status(201).json({ ok: true });
          return;
        }
        await requireEnabled(companyId);
        const parsed = messageSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          throw badRequest("Invalid message", parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })));
        }
        const { message, created } = await chat.recordMessage(companyId, sessionId, parsed.data);
        res.setHeader("Cache-Control", "no-store");
        res.status(created ? 201 : 200).json({
          message: {
            id: message.id,
            direction: message.direction,
            body: message.body,
            createdAt: message.createdAt,
            deliveryStatus: message.deliveryStatus,
          },
          created,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/:companySlug/chat/:sessionId/messages", requireSession, async (req, res, next) => {
    try {
      const companyId = companyIdOf(res);
      const sessionId = sessionIdOf(req);
      const raw = typeof req.query.after === "string" ? req.query.after : "0";
      const after = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(after) || after > MAX_AFTER) {
        throw badRequest("after must be a non-negative integer");
      }
      const page = await chat.listMessages(companyId, sessionId, after, WEBCHAT_PAGE_SIZE);
      res.setHeader("Cache-Control", "no-store");
      res.json(page);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:companySlug/widget.js", async (_req, res, next) => {
    try {
      companyIdOf(res);
      const source = await readFile(WIDGET_PATH, "utf8");
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(source);
    } catch (error) {
      next(error);
    }
  });
}
