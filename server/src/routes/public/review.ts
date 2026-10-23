import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { issueWorkProducts, projects } from "@paperclipai/db";
import { HttpError, badRequest, forbidden, notFound } from "../../errors.js";
import {
  REVIEW_MAX_BODY_CHARS,
  REVIEW_MAX_TTL_DAYS,
  REVIEW_TOKEN_HEADER,
  reviewLinkPath,
  reviewLinkService,
  type ReviewRunScope,
} from "../../services/public-surface/review-links.js";
import { projectToolContext } from "../../services/project-tool-context.js";
import { assertCompanyAccess, getActorInfo } from "../authz.js";
import { PUBLIC_COMPANY_LOCALS_KEY, publicRateLimit } from "../public-surface.js";

// External deliverable review (pista I).
//
// Public, mounted under /api/p by public-surface.ts. The token is accepted ONLY in the
// X-Paperclip-Review-Token header (the UI keeps it in the URL fragment), never in a path or query:
//   GET  /:companySlug/review/:linkId              sanitized view of the pinned deliverable version
//   POST /:companySlug/review/:linkId/responses    { kind, body, authorName?, targetVersion, expectedRevision, idempotencyKey }
//
// Authenticated, mounted under /api by reviewLinkRoutes(db):
//   POST /companies/:companyId/review-links         board creates (201 + url) or agent requests (202, approval)
//   GET  /companies/:companyId/review-links         board list, ?customerId&targetId
//   GET  /review-links/:id                          board, or agent of the same client project
//   GET  /review-links/:id/events                   board
//   POST /review-links/:id/url                      board: URL with fragment token (no-store)
//   POST /review-links/:id/revoke                   board

const MAX_PUBLIC_BODY_BYTES = 4 * 1024;
const DELIVERABLES_PAGE_SIZE = 100;
const RESPONSE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

const respondSchema = z
  .object({
    kind: z.enum(["comment", "accept", "request_changes"]),
    body: z.string().max(REVIEW_MAX_BODY_CHARS).default(""),
    authorName: z.string().trim().max(120).nullable().optional(),
    targetVersion: z.string().min(1).max(40),
    expectedRevision: z.number().int().min(1).max(1_000_000),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

const createSchema = z
  .object({
    targetId: z.string().uuid(),
    contactId: z.string().uuid().nullable().optional(),
    expiresAt: z.string().datetime().optional(),
    expiresInDays: z.number().int().min(1).max(REVIEW_MAX_TTL_DAYS).optional(),
    idempotencyKey: z.string().min(8).max(200).optional(),
    expectedTargetVersion: z.string().max(40).nullable().optional(),
  })
  .strict();

function parse<T extends z.ZodType>(schema: T, value: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw badRequest(message, parsed.error.issues);
  return parsed.data;
}

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function guard(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function companyIdOf(res: Response): string {
  const companyId = res.locals[PUBLIC_COMPANY_LOCALS_KEY];
  if (typeof companyId !== "string") throw notFound("Company not found");
  return companyId;
}

function tokenOf(req: Request): string {
  const token = req.get(REVIEW_TOKEN_HEADER);
  return typeof token === "string" ? token.trim() : "";
}

function capBody(req: Request, _res: Response, next: NextFunction) {
  const bytes = Buffer.byteLength(JSON.stringify(req.body ?? {}) ?? "", "utf8");
  if (bytes > MAX_PUBLIC_BODY_BYTES) {
    next(new HttpError(413, "Request body is too large"));
    return;
  }
  next();
}

export function registerPublicReviewRoutes(router: Router, db: Db): void {
  const service = reviewLinkService(db);
  const respondLimit = publicRateLimit(RESPONSE_RATE_LIMIT);

  router.get(
    "/:companySlug/review/:linkId",
    guard(async (req, res) => {
      noStore(res);
      res.json(await service.publicGet(companyIdOf(res), String(req.params.linkId ?? ""), tokenOf(req)));
    }),
  );

  router.post(
    "/:companySlug/review/:linkId/responses",
    respondLimit,
    capBody,
    guard(async (req, res) => {
      noStore(res);
      const input = parse(respondSchema, req.body, "Invalid review response");
      const result = await service.publicRespond(companyIdOf(res), String(req.params.linkId ?? ""), tokenOf(req), input);
      res.status(result.replayed ? 200 : 201).json(result);
    }),
  );
}

async function runScope(db: Db, req: Request, companyId: string, write: boolean): Promise<{ scope: ReviewRunScope; runId: string; agentId: string }> {
  const context = await projectToolContext(db, req.actor, write, "Review link");
  if (context.run.companyId !== companyId) throw notFound("Review link not found");
  if (!context.issue.projectId) throw forbidden("Review links need a task that belongs to a client project");
  return { scope: { projectId: context.issue.projectId, issueId: context.issue.id }, runId: context.run.id, agentId: context.run.agentId };
}

/** Authenticated management routes. Mount under /api. */
export function reviewLinkRoutes(db: Db) {
  const router = Router();
  const service = reviewLinkService(db);

  router.get("/companies/:companyId/review-deliverables", guard(async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (getActorInfo(req).actorType !== "user") throw forbidden("Only board users can select client deliverables for review");
    const query = parse(z.object({ customerId: z.string().uuid(), cursor: z.string().max(512).optional() }).strict(), req.query, "Invalid filter");
    let cursor: { updatedAt: Date; id: string } | null = null;
    if (query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as { updatedAt?: unknown; id?: unknown };
        const updatedAt = typeof decoded.updatedAt === "string" ? new Date(decoded.updatedAt) : null;
        const id = z.string().uuid().safeParse(decoded.id);
        if (!updatedAt || !Number.isFinite(updatedAt.getTime()) || !id.success) throw new Error("bad cursor");
        cursor = { updatedAt, id: id.data };
      } catch {
        throw badRequest("Invalid deliverable cursor");
      }
    }
    const rows = await db.select({
      id: issueWorkProducts.id,
      title: issueWorkProducts.title,
      projectId: projects.id,
      projectName: projects.name,
      updatedAt: issueWorkProducts.updatedAt,
    }).from(issueWorkProducts).innerJoin(projects, and(
      eq(projects.id, issueWorkProducts.projectId),
      eq(projects.companyId, companyId),
      eq(projects.customerId, query.customerId),
    )).where(and(
      eq(issueWorkProducts.companyId, companyId),
      ...(cursor ? [or(lt(issueWorkProducts.updatedAt, cursor.updatedAt), and(eq(issueWorkProducts.updatedAt, cursor.updatedAt), lt(issueWorkProducts.id, cursor.id)))] : []),
    )).orderBy(desc(issueWorkProducts.updatedAt), desc(issueWorkProducts.id)).limit(DELIVERABLES_PAGE_SIZE + 1);
    const hasMore = rows.length > DELIVERABLES_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, DELIVERABLES_PAGE_SIZE) : rows;
    const last = page.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ updatedAt: last.updatedAt.toISOString(), id: last.id })).toString("base64url")
      : null;
    noStore(res);
    res.json({ items: page.map(({ updatedAt: _updatedAt, ...item }) => item), nextCursor });
  }));

  router.post(
    "/companies/:companyId/review-links",
    guard(async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      noStore(res);
      const input = parse(createSchema, req.body, "Invalid review link");
      const actor = getActorInfo(req);
      const expiresAt = input.expiresAt
        ? new Date(input.expiresAt)
        : new Date(Date.now() + (input.expiresInDays ?? 14) * 86_400_000);

      if (actor.actorType === "agent") {
        const { scope, runId, agentId } = await runScope(db, req, companyId, true);
        const { link } = await service.create(
          companyId,
          {
            targetId: input.targetId,
            contactId: input.contactId ?? null,
            expiresAt,
            // One request per run and deliverable: a retried tool call returns the same pending link.
            idempotencyKey: input.idempotencyKey ?? `run:${runId}:${input.targetId}`,
            expectedTargetVersion: input.expectedTargetVersion ?? null,
          },
          { agentId, runId },
          scope,
        );
        const view = (await service.status(companyId, link.id, scope)).link;
        // Agents never receive the URL: the customer-facing link is released by a board user.
        res.status(link.status === "pending_approval" ? 202 : 200).json({
          link: view,
          approval: link.approvalId ? { id: link.approvalId, required: link.status === "pending_approval" } : null,
        });
        return;
      }

      if (actor.actorType !== "user") throw forbidden("Only a board user or an agent run can create review links");
      const { link } = await service.create(
        companyId,
        {
          targetId: input.targetId,
          contactId: input.contactId ?? null,
          expiresAt,
          idempotencyKey: input.idempotencyKey ?? randomUUID(),
          expectedTargetVersion: input.expectedTargetVersion ?? null,
        },
        { userId: actor.actorId },
      );
      const view = (await service.status(companyId, link.id)).link;
      res.status(201).json({ link: view, url: link.status === "active" ? reviewLinkPath(link) : null });
    }),
  );

  router.get(
    "/companies/:companyId/review-links",
    guard(async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      if (getActorInfo(req).actorType !== "user") throw forbidden("Only board users can list review links");
      const query = parse(
        z.object({ customerId: z.string().uuid().optional(), targetId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).optional() }),
        req.query,
        "Invalid filter",
      );
      res.json(await service.list(companyId, query));
    }),
  );

  async function linkCompany(req: Request): Promise<string> {
    const companyId = await service.companyOf(req.params.id as string);
    if (!companyId) throw notFound("Review link not found");
    assertCompanyAccess(req, companyId);
    return companyId;
  }

  router.get(
    "/review-links/:id",
    guard(async (req, res) => {
      const companyId = await linkCompany(req);
      noStore(res);
      const actor = getActorInfo(req);
      const scope = actor.actorType === "agent" ? (await runScope(db, req, companyId, false)).scope : undefined;
      res.json(await service.status(companyId, req.params.id as string, scope));
    }),
  );

  router.get(
    "/review-links/:id/events",
    guard(async (req, res) => {
      const companyId = await linkCompany(req);
      if (getActorInfo(req).actorType !== "user") throw forbidden("Only board users can read customer feedback");
      noStore(res);
      res.json(await service.events(companyId, req.params.id as string));
    }),
  );

  router.post(
    "/review-links/:id/url",
    guard(async (req, res) => {
      const companyId = await linkCompany(req);
      const actor = getActorInfo(req);
      if (actor.actorType !== "user") throw forbidden("Only board users can open the customer link");
      noStore(res);
      res.json(await service.reveal(companyId, req.params.id as string, actor.actorId));
    }),
  );

  router.post(
    "/review-links/:id/revoke",
    guard(async (req, res) => {
      const companyId = await linkCompany(req);
      const actor = getActorInfo(req);
      if (actor.actorType !== "user") throw forbidden("Only board users can revoke review links");
      res.json(await service.revoke(companyId, req.params.id as string, actor.actorId));
    }),
  );

  return router;
}
