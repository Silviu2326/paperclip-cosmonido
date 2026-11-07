import { createHash, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  companies,
  customerContacts,
  customers,
  deliverableReviews,
  externalActions,
  issueWorkProducts,
  projects,
  reviewLinkEvents,
  reviewLinks,
} from "@paperclipai/db";
import { conflict, forbidden, notFound, unauthorized, unprocessable } from "../../errors.js";
import { signPublicToken, verifyPublicToken } from "../../routes/public-surface.js";
import { logActivity, publishActivity, type ActivityPublication } from "../activity-log.js";
import { approvalService } from "../approvals.js";
import { gateExternalAction } from "../external-action-gate.js";

// External deliverable review (S2 pista I).
//
// A link pins one work product at one version (its `updatedAt`). The visitor holds a signed token
// (sent in the X-Paperclip-Review-Token header, kept in the URL fragment by the UI, never in a
// path or query). The customer can comment, accept or ask for changes for THAT version. Their
// answer is recorded as external evidence; it never resolves the internal deliverable review,
// which stays a board decision (deliverable-reviews.ts).
//
// Creating a link is a governed external action:
//  - a board user goes through gateExternalAction (executes directly, recorded);
//  - an agent never executes: it stores a pending link plus an external action in approval mode
//    and an approval. `review_link` cannot be granted send_direct, and the gate would answer
//    `draft_only` with no approval to give, so the approval is created here with the same rows
//    the gate writes. The link becomes active when the approval is approved (see reconcile).

export const REVIEW_LINK_PURPOSE = "review_link";
export const REVIEW_TOKEN_HEADER = "x-paperclip-review-token";
export const REVIEW_MAX_TTL_DAYS = 90;
export const REVIEW_MAX_BODY_CHARS = 4000;

const DAY_MS = 86_400_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID_LINK = "Review link is invalid or expired";

export type ReviewLinkRow = typeof reviewLinks.$inferSelect;
export type ReviewLinkStatus = "pending_approval" | "active" | "revoked" | "rejected" | "expired";
export type ReviewResponseKind = "comment" | "accept" | "request_changes";

export interface ReviewActor {
  userId?: string | null;
  agentId?: string | null;
  runId?: string | null;
}

/** Project of the agent's run. An agent can only link deliverables of that client project. */
export interface ReviewRunScope {
  projectId: string;
  issueId: string;
}

export interface CreateReviewLinkInput {
  targetId: string;
  contactId?: string | null;
  expiresAt: Date;
  idempotencyKey: string;
  /** When set, creation fails with 409 unless the deliverable is still at this version. */
  expectedTargetVersion?: string | null;
}

export interface ReviewLinkAdminView {
  id: string;
  customerId: string;
  customerName: string | null;
  contactId: string | null;
  projectId: string | null;
  issueId: string | null;
  targetKind: "work_product";
  targetId: string;
  targetTitle: string;
  targetVersion: string;
  /** True when the deliverable changed after the link was created; the customer can no longer decide. */
  stale: boolean;
  status: ReviewLinkStatus;
  decision: ReviewLinkRow["decision"];
  revision: number;
  expiresAt: string;
  decidedAt: string | null;
  approvalId: string | null;
  createdByAgentId: string | null;
  createdAt: string;
  commentCount: number;
}

export interface ReviewEventView {
  kind: ReviewResponseKind;
  body: string;
  authorLabel: string | null;
  targetVersion: string;
  createdAt: string;
}

export interface PublicReviewView {
  companyName: string;
  customerName: string;
  title: string;
  summary: string | null;
  type: string | null;
  url: string | null;
  version: string;
  stale: boolean;
  decision: ReviewLinkRow["decision"];
  revision: number;
  canDecide: boolean;
  canComment: boolean;
  expiresAt: string;
  events: ReviewEventView[];
}

export interface PublicReviewResponseInput {
  kind: ReviewResponseKind;
  body: string;
  authorName?: string | null;
  targetVersion: string;
  expectedRevision: number;
  idempotencyKey: string;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Work product URLs are shown to the customer only when they are plain public https links:
 * no credentials, query or fragment (those can carry signed secrets) and no local hosts.
 */
export function publicSafeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
  return url.toString();
}

export function effectiveReviewStatus(link: Pick<ReviewLinkRow, "status" | "expiresAt">, now = new Date()): ReviewLinkStatus {
  if ((link.status === "active" || link.status === "pending_approval") && link.expiresAt <= now) return "expired";
  return link.status as ReviewLinkStatus;
}

/** Deterministic token for an active link. It is derived, never stored. */
function tokenFor(link: ReviewLinkRow): string {
  if (link.status !== "active" || !link.tokenIssuedAt) throw conflict("The review link is not active");
  const ttlSeconds = Math.floor(link.expiresAt.getTime() / 1000) - Math.floor(link.tokenIssuedAt.getTime() / 1000);
  if (ttlSeconds <= 0) throw conflict("The review link has expired");
  return signPublicToken(
    { purpose: REVIEW_LINK_PURPOSE, companyId: link.companyId, subject: link.id, ttlSeconds },
    link.tokenIssuedAt,
  );
}

/** Browser path for a link. The secret travels in the fragment, which browsers never send to servers. */
export function reviewLinkPath(link: ReviewLinkRow): string {
  return `/review/${link.companyId}/${link.id}#token=${tokenFor(link)}`;
}

export function reviewLinkService(db: Db) {
  const approvals = approvalService(db);

  async function findByKey(companyId: string, idempotencyKey: string) {
    const [row] = await db
      .select()
      .from(reviewLinks)
      .where(and(eq(reviewLinks.companyId, companyId), eq(reviewLinks.idempotencyKey, idempotencyKey)))
      .limit(1);
    return row ?? null;
  }

  async function loadLink(companyId: string, id: string) {
    const [row] = await db
      .select()
      .from(reviewLinks)
      .where(and(eq(reviewLinks.id, id), eq(reviewLinks.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  async function loadTarget(companyId: string, targetId: string) {
    const [row] = await db
      .select({
        id: issueWorkProducts.id,
        projectId: issueWorkProducts.projectId,
        issueId: issueWorkProducts.issueId,
        title: issueWorkProducts.title,
        summary: issueWorkProducts.summary,
        type: issueWorkProducts.type,
        url: issueWorkProducts.url,
        updatedAt: issueWorkProducts.updatedAt,
        customerId: projects.customerId,
      })
      .from(issueWorkProducts)
      .leftJoin(projects, and(eq(projects.id, issueWorkProducts.projectId), eq(projects.companyId, companyId)))
      .where(and(eq(issueWorkProducts.id, targetId), eq(issueWorkProducts.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  // The approval decides an agent-requested link; no in-process closure is needed, so a restart
  // between "approved" and "executed" cannot strand it.
  async function reconcile(link: ReviewLinkRow): Promise<ReviewLinkRow> {
    if (link.status !== "pending_approval" || !link.approvalId) return link;
    const approval = await approvals.getById(link.approvalId);
    if (!approval) return link;
    if (approval.status === "approved") {
      const now = new Date();
      if (link.expiresAt <= now) return link;
      const [active] = await db
        .update(reviewLinks)
        .set({ status: "active", tokenIssuedAt: now, updatedAt: now })
        .where(and(eq(reviewLinks.id, link.id), eq(reviewLinks.companyId, link.companyId), eq(reviewLinks.status, "pending_approval")))
        .returning();
      if (!active) return (await loadLink(link.companyId, link.id)) ?? link;
      if (active.externalActionId) {
        await db
          .update(externalActions)
          .set({ status: "executed", result: { reviewLinkId: active.id, expiresAt: active.expiresAt.toISOString() }, executedAt: now, updatedAt: now })
          .where(and(eq(externalActions.id, active.externalActionId), eq(externalActions.status, "approved")));
      }
      await logActivity(db, {
        companyId: link.companyId,
        actorType: "system",
        actorId: "review-links",
        action: "review_link.activated",
        entityType: "review_link",
        entityId: link.id,
        details: { approvalId: link.approvalId },
      });
      return active;
    }
    if (approval.status === "rejected" || approval.status === "cancelled") {
      const [rejected] = await db
        .update(reviewLinks)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(and(eq(reviewLinks.id, link.id), eq(reviewLinks.status, "pending_approval")))
        .returning();
      return rejected ?? link;
    }
    return link;
  }

  async function ensureApproval(link: ReviewLinkRow, actor: ReviewActor): Promise<ReviewLinkRow> {
    const publications: ActivityPublication[] = [];
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(reviewLinks).where(and(
        eq(reviewLinks.id, link.id), eq(reviewLinks.companyId, link.companyId),
      )).for("update").limit(1);
      if (!current) throw notFound("Review link not found");
      if (current.status !== "pending_approval") return current;
      return ensureApprovalRows(current, actor, tx as unknown as Db, publications);
    });
    for (const publication of publications) publishActivity(publication);
    return result;
  }

  async function ensureApprovalRows(link: ReviewLinkRow, actor: ReviewActor, db: Db, publications: ActivityPublication[]): Promise<ReviewLinkRow> {
    const approvals = approvalService(db);
    if (link.externalActionId && link.approvalId) return link;
    const actionKey = `review_link:${link.idempotencyKey}`;
    const payload = {
      targetKind: "work_product",
      targetId: link.targetId,
      targetTitle: link.targetTitle,
      targetVersion: link.targetVersion,
      customerId: link.customerId,
      contactId: link.contactId,
      expiresAt: link.expiresAt.toISOString(),
    };
    const payloadHash = sha256(JSON.stringify(payload));
    let [action] = await db
      .select()
      .from(externalActions)
      .where(and(eq(externalActions.companyId, link.companyId), eq(externalActions.idempotencyKey, actionKey)))
      .limit(1);
    if (!action) {
      try {
        [action] = await db
          .insert(externalActions)
          .values({
            companyId: link.companyId,
            actionType: "review_link",
            actorAgentId: actor.agentId ?? link.createdByAgentId,
            subjectKind: "work_product",
            subjectId: link.targetId,
            levelApplied: "send_with_approval",
            mode: "approval",
            payloadHash,
            idempotencyKey: actionKey,
            status: "pending",
          })
          .returning();
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        [action] = await db
          .select()
          .from(externalActions)
          .where(and(eq(externalActions.companyId, link.companyId), eq(externalActions.idempotencyKey, actionKey)))
          .limit(1);
      }
      if (action) {
        await logActivity(db, {
          companyId: link.companyId,
          actorType: "agent",
          actorId: actor.agentId ?? link.createdByAgentId ?? "unknown-agent",
          agentId: actor.agentId ?? link.createdByAgentId ?? null,
          runId: actor.runId ?? link.createdByRunId ?? null,
          action: "external_action.created",
          entityType: "external_action",
          entityId: action.id,
          details: { actionType: "review_link", mode: "approval", levelApplied: "send_with_approval" },
        }, publications);
      }
    }
    if (!action) throw new Error("Review link approval could not be recorded");
    if (action.subjectId !== link.targetId || action.actionType !== "review_link" || action.payloadHash !== payloadHash) {
      throw conflict("Review approval identity does not match this link");
    }

    let approvalId = action.approvalId;
    if (!approvalId) {
      const approval = await approvals.create(link.companyId, {
        type: "external_action",
        requestedByAgentId: action.actorAgentId,
        requestedByUserId: null,
        status: "pending",
        payload: {
          externalActionId: action.id,
          actionType: "review_link",
          subjectKind: "work_product",
          subjectId: link.targetId,
          payloadHash,
          payload,
        },
      });
      approvalId = approval!.id;
      await db.update(externalActions).set({ approvalId, updatedAt: new Date() }).where(and(eq(externalActions.id, action.id), isNull(externalActions.approvalId)));
      await logActivity(db, {
        companyId: link.companyId,
        actorType: "agent",
        actorId: action.actorAgentId ?? "unknown-agent",
        agentId: action.actorAgentId,
        action: "external_action.approval_requested",
        entityType: "external_action",
        entityId: action.id,
        details: { actionType: "review_link", approvalId },
      }, publications);
    }
    const [linked] = await db
      .update(reviewLinks)
      .set({ externalActionId: action.id, approvalId, updatedAt: new Date() })
      .where(and(eq(reviewLinks.id, link.id), eq(reviewLinks.companyId, link.companyId)))
      .returning();
    return linked ?? link;
  }

  async function adminViews(rows: ReviewLinkRow[]): Promise<ReviewLinkAdminView[]> {
    if (rows.length === 0) return [];
    const now = new Date();
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const targetIds = [...new Set(rows.map((row) => row.targetId))];
    const linkIds = rows.map((row) => row.id);
    const [customerRows, productRows, commentRows] = await Promise.all([
      db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, customerIds)),
      db.select({ id: issueWorkProducts.id, updatedAt: issueWorkProducts.updatedAt }).from(issueWorkProducts).where(inArray(issueWorkProducts.id, targetIds)),
      db
        .select({ linkId: reviewLinkEvents.linkId, count: sql<number>`count(*)::int` })
        .from(reviewLinkEvents)
        .where(and(inArray(reviewLinkEvents.linkId, linkIds), eq(reviewLinkEvents.kind, "comment")))
        .groupBy(reviewLinkEvents.linkId),
    ]);
    const customerName = new Map(customerRows.map((row) => [row.id, row.name]));
    const productVersion = new Map(productRows.map((row) => [row.id, row.updatedAt.toISOString()]));
    const commentCount = new Map(commentRows.map((row) => [row.linkId, Number(row.count)]));
    return rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: customerName.get(row.customerId) ?? null,
      contactId: row.contactId,
      projectId: row.projectId,
      issueId: row.issueId,
      targetKind: "work_product",
      targetId: row.targetId,
      targetTitle: row.targetTitle,
      targetVersion: row.targetVersion,
      stale: productVersion.get(row.targetId) !== row.targetVersion,
      status: effectiveReviewStatus(row, now),
      decision: row.decision,
      revision: row.revision,
      expiresAt: row.expiresAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      approvalId: row.approvalId,
      createdByAgentId: row.createdByAgentId,
      createdAt: row.createdAt.toISOString(),
      commentCount: commentCount.get(row.id) ?? 0,
    }));
  }

  async function eventViews(linkId: string, limit = 200): Promise<ReviewEventView[]> {
    const rows = await db
      .select()
      .from(reviewLinkEvents)
      .where(eq(reviewLinkEvents.linkId, linkId))
      .orderBy(asc(reviewLinkEvents.createdAt), asc(reviewLinkEvents.id))
      .limit(limit);
    return rows.map((row) => ({
      kind: row.kind as ReviewResponseKind,
      body: row.body,
      authorLabel: row.authorLabel,
      targetVersion: row.targetVersion,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async function authorize(companyId: string, linkId: string, token: string): Promise<ReviewLinkRow> {
    if (!UUID_PATTERN.test(linkId) || !token || token.length > 512) throw unauthorized(INVALID_LINK);
    const payload = verifyPublicToken(token, { purpose: REVIEW_LINK_PURPOSE, companyId });
    if (!payload || payload.subject !== linkId) throw unauthorized(INVALID_LINK);
    const link = await loadLink(companyId, linkId);
    if (!link || link.status !== "active" || link.revokedAt || link.expiresAt <= new Date() || !link.tokenIssuedAt) {
      throw unauthorized(INVALID_LINK);
    }
    if (!sameString(tokenFor(link), token)) throw unauthorized(INVALID_LINK);
    return link;
  }

  async function publicView(link: ReviewLinkRow): Promise<PublicReviewView> {
    const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, link.companyId)).limit(1);
    const [customer] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, link.customerId), eq(customers.companyId, link.companyId)))
      .limit(1);
    const target = await loadTarget(link.companyId, link.targetId);
    // Only the pinned version is ever shown. If the deliverable moved on, the visitor sees the
    // title recorded when the link was created and nothing else.
    const current = Boolean(target && target.customerId === link.customerId && target.updatedAt.toISOString() === link.targetVersion);
    const open = current && link.decision === "open";
    return {
      companyName: company?.name ?? "",
      customerName: customer?.name ?? "",
      title: link.targetTitle,
      summary: current && target?.summary ? target.summary.slice(0, REVIEW_MAX_BODY_CHARS) : null,
      type: current ? (target?.type ?? null) : null,
      url: current ? publicSafeUrl(target?.url) : null,
      version: link.targetVersion,
      stale: !current,
      decision: link.decision as PublicReviewView["decision"],
      revision: link.revision,
      canDecide: open,
      canComment: current && link.decision !== "accepted",
      expiresAt: link.expiresAt.toISOString(),
      events: await eventViews(link.id),
    };
  }

  return {
    // ---------------------------------------------------------------- board / agent side

    /**
     * Creates (or returns) a review link for one work product. Board users get an active link
     * through the gate; agents get a pending link and an approval. The same idempotencyKey always
     * returns the same link.
     */
    async create(
      companyId: string,
      input: CreateReviewLinkInput,
      actor: ReviewActor,
      scope?: ReviewRunScope,
    ): Promise<{ link: ReviewLinkRow; mode: "direct" | "approval" }> {
      if (!actor.userId && !actor.agentId) throw forbidden("A board user or an agent run is required");
      const existing = await findByKey(companyId, input.idempotencyKey);
      if (existing) {
        if (existing.targetId !== input.targetId) throw conflict("That idempotency key was already used for another deliverable");
        if (scope && existing.projectId !== scope.projectId) throw notFound("Deliverable not found");
        const resumed = existing.status === "pending_approval" && actor.agentId ? await ensureApproval(existing, actor) : existing;
        const link = await reconcile(resumed);
        return { link, mode: actor.agentId ? "approval" : "direct" };
      }

      const target = await loadTarget(companyId, input.targetId);
      if (!target || (scope && target.projectId !== scope.projectId)) throw notFound("Deliverable not found");
      if (!target.projectId || !target.customerId) {
        throw unprocessable("This deliverable is not part of a client project. Link a customer to its project before sharing it.");
      }
      const targetVersion = target.updatedAt.toISOString();
      if (input.expectedTargetVersion && input.expectedTargetVersion !== targetVersion) {
        throw conflict("The deliverable changed; request the link for its latest version", { currentVersion: targetVersion });
      }

      const [customer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, target.customerId), eq(customers.companyId, companyId), isNull(customers.archivedAt)))
        .limit(1);
      if (!customer) throw notFound("Customer not found");
      if (input.contactId) {
        const [linked] = await db
          .select({ id: customerContacts.contactId })
          .from(customerContacts)
          .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.customerId, customer.id), eq(customerContacts.contactId, input.contactId)))
          .limit(1);
        if (!linked) throw notFound("Contact is not linked to this customer");
      }
      const now = Date.now();
      const expiresMs = input.expiresAt.getTime();
      if (!Number.isFinite(expiresMs) || expiresMs <= now + 60_000 || expiresMs > now + REVIEW_MAX_TTL_DAYS * DAY_MS) {
        throw unprocessable(`The link must expire between 1 minute and ${REVIEW_MAX_TTL_DAYS} days from now`);
      }

      const [pendingReview] = await db
        .select({ id: deliverableReviews.id })
        .from(deliverableReviews)
        .where(
          and(
            eq(deliverableReviews.companyId, companyId),
            eq(deliverableReviews.targetKind, "work_product"),
            eq(deliverableReviews.targetId, target.id),
            eq(deliverableReviews.targetVersion, targetVersion),
            eq(deliverableReviews.state, "pending"),
          ),
        )
        .limit(1);

      const base = {
        companyId,
        customerId: customer.id,
        contactId: input.contactId ?? null,
        projectId: target.projectId,
        issueId: target.issueId,
        targetKind: "work_product",
        targetId: target.id,
        targetVersion,
        targetTitle: target.title,
        deliverableReviewId: pendingReview?.id ?? null,
        idempotencyKey: input.idempotencyKey,
        expiresAt: input.expiresAt,
        createdByRunId: actor.runId ?? null,
      };

      if (actor.agentId) {
        let link: ReviewLinkRow | undefined;
        try {
          [link] = await db
            .insert(reviewLinks)
            .values({ ...base, status: "pending_approval", createdByAgentId: actor.agentId })
            .returning();
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
        link ??= (await findByKey(companyId, input.idempotencyKey)) ?? undefined;
        if (!link) throw new Error("Review link could not be created");
        return { link: await ensureApproval(link, actor), mode: "approval" };
      }

      const gated = await gateExternalAction(db, {
        companyId,
        actionType: "review_link",
        actor: { userId: actor.userId },
        subjectKind: "work_product",
        subjectId: target.id,
        payload: {
          targetId: target.id,
          targetVersion,
          customerId: customer.id,
          contactId: input.contactId ?? null,
          expiresAt: input.expiresAt.toISOString(),
        },
        idempotencyKey: `review_link:${input.idempotencyKey}`,
        execute: async () => {
          let link: ReviewLinkRow | undefined;
          try {
            [link] = await db
              .insert(reviewLinks)
              .values({ ...base, status: "active", tokenIssuedAt: new Date(), createdByUserId: actor.userId })
              .returning();
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            link = (await findByKey(companyId, input.idempotencyKey)) ?? undefined;
          }
          if (!link) throw new Error("Review link could not be created");
          // The result is stored on the external action: ids and dates only, never the token.
          return { reviewLinkId: link.id, expiresAt: link.expiresAt.toISOString() };
        },
      });
      const link = await findByKey(companyId, input.idempotencyKey);
      if (!link) {
        throw conflict("The previous attempt with this idempotency key did not create a link; use a new key", {
          actionStatus: gated.action.status,
        });
      }
      if (!link.externalActionId) {
        await db.update(reviewLinks).set({ externalActionId: gated.action.id, updatedAt: new Date() }).where(and(eq(reviewLinks.id, link.id), isNull(reviewLinks.externalActionId)));
      }
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: actor.userId ?? "board",
        action: "review_link.created",
        entityType: "review_link",
        entityId: link.id,
        details: { targetId: link.targetId, targetVersion: link.targetVersion, customerId: link.customerId, expiresAt: link.expiresAt.toISOString() },
      });
      return { link: (await loadLink(companyId, link.id)) ?? link, mode: "direct" };
    },

    async list(companyId: string, filter: { customerId?: string; targetId?: string; limit?: number } = {}): Promise<ReviewLinkAdminView[]> {
      const rows = await db
        .select()
        .from(reviewLinks)
        .where(
          and(
            eq(reviewLinks.companyId, companyId),
            ...(filter.customerId ? [eq(reviewLinks.customerId, filter.customerId)] : []),
            ...(filter.targetId ? [eq(reviewLinks.targetId, filter.targetId)] : []),
          ),
        )
        .orderBy(desc(reviewLinks.createdAt))
        .limit(Math.min(Math.max(filter.limit ?? 50, 1), 100));
      const reconciled = await Promise.all(rows.map((row) => reconcile(row)));
      return adminViews(reconciled);
    },

    /** Raw lookup so routes can check company access before returning anything. */
    async companyOf(id: string): Promise<string | null> {
      if (!UUID_PATTERN.test(id)) return null;
      const [row] = await db.select({ companyId: reviewLinks.companyId }).from(reviewLinks).where(eq(reviewLinks.id, id)).limit(1);
      return row?.companyId ?? null;
    },

    /**
     * Status for the board and for `review_status_get`. With a run scope, only links of the run's
     * client project are visible. Customer text is returned as data, marked untrusted.
     */
    async status(companyId: string, id: string, scope?: ReviewRunScope) {
      const raw = await loadLink(companyId, id);
      if (!raw || (scope && raw.projectId !== scope.projectId)) throw notFound("Review link not found");
      const link = await reconcile(raw);
      const [view] = await adminViews([link]);
      const events = (await eventViews(link.id)).slice(-10);
      return { link: view!, customerFeedback: { untrusted: true as const, events } };
    },

    /** The URL with its fragment token. Board only; active links only. */
    async reveal(companyId: string, id: string, userId: string): Promise<{ url: string }> {
      const raw = await loadLink(companyId, id);
      if (!raw) throw notFound("Review link not found");
      const link = await reconcile(raw);
      if (effectiveReviewStatus(link) !== "active") throw conflict(`The review link is ${effectiveReviewStatus(link)}`);
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: userId,
        action: "review_link.url_revealed",
        entityType: "review_link",
        entityId: link.id,
      });
      return { url: reviewLinkPath(link) };
    },

    async revoke(companyId: string, id: string, userId: string): Promise<ReviewLinkAdminView> {
      const now = new Date();
      const [row] = await db
        .update(reviewLinks)
        .set({ status: "revoked", revokedAt: now, revokedByUserId: userId, updatedAt: now })
        .where(and(eq(reviewLinks.id, id), eq(reviewLinks.companyId, companyId), inArray(reviewLinks.status, ["active", "pending_approval"])))
        .returning();
      if (!row) {
        const current = await loadLink(companyId, id);
        if (!current) throw notFound("Review link not found");
        const [view] = await adminViews([current]);
        return view!;
      }
      if (row.approvalId) await approvals.cancel(row.approvalId, "Review link revoked");
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: userId,
        action: "review_link.revoked",
        entityType: "review_link",
        entityId: id,
      });
      const [view] = await adminViews([row]);
      return view!;
    },

    async events(companyId: string, id: string): Promise<ReviewEventView[]> {
      const link = await loadLink(companyId, id);
      if (!link) throw notFound("Review link not found");
      return eventViews(link.id);
    },

    // ---------------------------------------------------------------- visitor side

    async publicGet(companyId: string, linkId: string, token: string): Promise<PublicReviewView> {
      return publicView(await authorize(companyId, linkId, token));
    },

    /**
     * Records a comment, acceptance or change request for the pinned version.
     * - `targetVersion` must be the link's version and the deliverable must still be at it;
     * - decisions are compare-and-set on `expectedRevision` and only possible while the answer is open;
     * - the same idempotencyKey replays the stored outcome; with different content it is a 409.
     * The internal deliverable review is not touched except for appended evidence.
     */
    async publicRespond(companyId: string, linkId: string, token: string, input: PublicReviewResponseInput): Promise<PublicReviewView & { replayed: boolean }> {
      const link = await authorize(companyId, linkId, token);
      const body = input.body.trim();
      const authorLabel = input.authorName?.trim().slice(0, 120) || null;
      const requestHash = sha256(JSON.stringify([input.kind, body, authorLabel, input.targetVersion, input.expectedRevision]));

      const replay = async () => {
        const [prior] = await db
          .select()
          .from(reviewLinkEvents)
          .where(and(eq(reviewLinkEvents.linkId, link.id), eq(reviewLinkEvents.idempotencyKey, input.idempotencyKey)))
          .limit(1);
        if (!prior) return null;
        if (prior.requestHash !== requestHash) throw conflict("That request key was already used for a different response");
        const fresh = (await loadLink(companyId, link.id)) ?? link;
        return { ...(await publicView(fresh)), replayed: true };
      };
      const replayed = await replay();
      if (replayed) return replayed;

      if (input.targetVersion !== link.targetVersion) {
        throw conflict("This link is for another version of the deliverable", { version: link.targetVersion });
      }
      if (input.kind !== "accept" && !body) throw unprocessable("A comment is required");
      if (body.length > REVIEW_MAX_BODY_CHARS) throw unprocessable("The comment is too long");
      if (link.decision === "accepted") throw conflict("This version was already accepted");
      if (input.kind !== "comment" && link.decision !== "open") throw conflict("A decision was already recorded for this version");

      const insertEvent = (executor: Db, revisionAfter: number) =>
        executor.insert(reviewLinkEvents).values({
          companyId,
          linkId: link.id,
          kind: input.kind,
          body,
          authorLabel,
          targetVersion: link.targetVersion,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          revisionAfter,
        });

      try {
        await db.transaction(async (tx) => {
          const txDb = tx as unknown as Db;
          // Lock the deliverable so it cannot change between this check and the write.
          const [product] = await tx
            .select({ updatedAt: issueWorkProducts.updatedAt })
            .from(issueWorkProducts)
            .where(and(eq(issueWorkProducts.id, link.targetId), eq(issueWorkProducts.companyId, companyId)))
            .for("update");
          if (!product || product.updatedAt.toISOString() !== link.targetVersion) {
            throw conflict("The deliverable changed after this link was created");
          }
          if (input.kind === "comment") {
            const [stillOpen] = await tx
              .select({ id: reviewLinks.id })
              .from(reviewLinks)
              .where(and(eq(reviewLinks.id, link.id), eq(reviewLinks.status, "active"), isNull(reviewLinks.revokedAt), sql`${reviewLinks.decision} <> 'accepted'`, sql`${reviewLinks.expiresAt} > now()`));
            if (!stillOpen) throw unauthorized(INVALID_LINK);
            await insertEvent(txDb, link.revision);
            return;
          }
          const now = new Date();
          const [decided] = await tx
            .update(reviewLinks)
            .set({
              decision: input.kind === "accept" ? "accepted" : "changes_requested",
              revision: sql`${reviewLinks.revision} + 1`,
              decidedAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(reviewLinks.id, link.id),
                eq(reviewLinks.companyId, companyId),
                eq(reviewLinks.status, "active"),
                eq(reviewLinks.decision, "open"),
                eq(reviewLinks.revision, input.expectedRevision),
                isNull(reviewLinks.revokedAt),
                sql`${reviewLinks.expiresAt} > now()`,
              ),
            )
            .returning();
          if (!decided) throw conflict("The review changed since you opened it; reload and try again");
          await insertEvent(txDb, decided.revision);
          // Evidence for the internal reviewer. State, reviewer and reason are untouched.
          const [pending] = await tx
            .select({ id: deliverableReviews.id })
            .from(deliverableReviews)
            .where(
              and(
                eq(deliverableReviews.companyId, companyId),
                eq(deliverableReviews.targetKind, "work_product"),
                eq(deliverableReviews.targetId, link.targetId),
                eq(deliverableReviews.targetVersion, link.targetVersion),
                eq(deliverableReviews.state, "pending"),
              ),
            )
            .limit(1);
          if (pending) {
            const evidence = {
              externalReview: {
                linkId: link.id,
                decision: input.kind === "accept" ? "accepted" : "changes_requested",
                at: now.toISOString(),
                customerId: link.customerId,
                contactId: link.contactId,
                authorLabel,
                authorVerified: false,
                comment: body.slice(0, 500),
                note: "Answer given by the customer through an external link. It is not a board decision.",
              },
            };
            await tx
              .update(deliverableReviews)
              .set({
                evidence: sql`coalesce(${deliverableReviews.evidence}, '{}'::jsonb) || ${JSON.stringify(evidence)}::jsonb`,
                updatedAt: now,
              })
              .where(and(eq(deliverableReviews.id, pending.id), eq(deliverableReviews.companyId, companyId), eq(deliverableReviews.state, "pending")));
          }
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const raced = await replay();
          if (raced) return raced;
        }
        throw error;
      }

      await logActivity(db, {
        companyId,
        actorType: "system",
        actorId: "external-review-link",
        action: `review_link.${input.kind}`,
        entityType: "review_link",
        entityId: link.id,
        details: { targetId: link.targetId, targetVersion: link.targetVersion, customerId: link.customerId, contactId: link.contactId, commentLength: body.length },
      });
      const fresh = (await loadLink(companyId, link.id)) ?? link;
      return { ...(await publicView(fresh)), replayed: false };
    },
  };
}

export type ReviewLinkService = ReturnType<typeof reviewLinkService>;
