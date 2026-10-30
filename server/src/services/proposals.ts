import { randomBytes } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNotNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, customers, opportunities, documentRevisions, documents, proposals } from "@paperclipai/db";
import type {
  AcceptProposalPublicInput,
  CreateProposalInput,
  Proposal,
  ProposalAcceptanceEvidence,
  ProposalStatus,
  ProposalPage,
  PublicProposalView,
  ReviseProposalInput,
} from "@paperclipai/shared";
import { conflict, HttpError, notFound, unauthorized, unprocessable } from "../errors.js";
import { createPaymentLink, verifyStripeSignature, type StripePaymentLink } from "./stripe-payment-links.js";
import { renderProposalMarkdown } from "./proposal-render.js";
import { secretService } from "./secrets.js";
import { decodeCrmCursor, encodeCrmCursor } from "./crm/activities.js";
import { badRequest } from "../errors.js";

/** Sprint 3 WP8: commercial proposals with revisions, light acceptance and deposit payment links. */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Pick<Db, "select" | "insert" | "update">;
type ProposalRow = typeof proposals.$inferSelect;
export type ProposalActor = { agentId?: string | null; userId?: string | null };

export interface ProposalServiceDeps {
  /** Resolves a company secret by key (for example STRIPE_SECRET_KEY). Defaults to the company secrets store. */
  resolveSecret?: (companyId: string, key: string) => Promise<string | null>;
  fetch?: typeof fetch;
  /** Origin used to build public links, for example https://paperclip.example.com. Empty means relative links. */
  publicBaseUrl?: string;
  sendMessage?: (input: { companyId: string; recipient: string | null; text: string; proposalId: string }) => Promise<{ messageId: string } | null>;
  now?: () => Date;
}

export interface SendProposalResult {
  proposal: Proposal;
  publicUrl: string;
  paymentUnavailableReason: string | null;
  messageId: string | null;
  /** Older revisions of the same proposal that this send moved to `expired`. */
  expiredProposalIds: string[];
}

export interface StripeEventLike {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}

export type PaymentRecordResult = { status: "paid" | "unchanged" | "ignored"; proposalId: string | null; companyId: string | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_EVENT_TYPES = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

function toProposal(row: ProposalRow): Proposal {
  return row as unknown as Proposal;
}

function newPublicToken() {
  return randomBytes(32).toString("base64url");
}

function isPastValidity(row: ProposalRow, at: Date) {
  return Boolean(row.validUntil && row.validUntil.getTime() < at.getTime());
}

async function lockProposalKey(tx: Tx, companyId: string, proposalKey: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`proposal:${companyId}:${proposalKey}`}, 0))`);
}

async function getCompanyName(executor: Executor, companyId: string) {
  const [row] = await executor.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId));
  return row?.name ?? "Empresa";
}

async function latestRevision(executor: Executor, companyId: string, proposalKey: string) {
  const [row] = await executor
    .select()
    .from(proposals)
    .where(and(eq(proposals.companyId, companyId), eq(proposals.proposalKey, proposalKey)))
    .orderBy(desc(proposals.revision))
    .limit(1);
  return row ?? null;
}

/** Creates a markdown document plus its first revision row, and returns the document id. */
async function createProposalDocument(tx: Tx, input: { companyId: string; title: string; body: string; actor: ProposalActor }) {
  const [doc] = await tx.insert(documents).values({
    companyId: input.companyId,
    title: input.title,
    format: "markdown",
    latestBody: input.body,
    latestRevisionNumber: 1,
    createdByAgentId: input.actor.agentId ?? null,
    createdByUserId: input.actor.userId ?? null,
    updatedByAgentId: input.actor.agentId ?? null,
    updatedByUserId: input.actor.userId ?? null,
  }).returning();
  const [revision] = await tx.insert(documentRevisions).values({
    companyId: input.companyId,
    documentId: doc!.id,
    revisionNumber: 1,
    title: input.title,
    format: "markdown",
    body: input.body,
    changeSummary: "Propuesta",
    createdByAgentId: input.actor.agentId ?? null,
    createdByUserId: input.actor.userId ?? null,
  }).returning();
  await tx.update(documents).set({ latestRevisionId: revision!.id }).where(eq(documents.id, doc!.id));
  return doc!.id;
}

/** Appends a revision to an existing proposal document (used for in-place edits of draft revisions). */
async function rewriteProposalDocument(tx: Tx, input: { companyId: string; documentId: string | null; title: string; body: string; actor: ProposalActor }) {
  const [doc] = input.documentId
    ? await tx.select().from(documents).where(and(eq(documents.id, input.documentId), eq(documents.companyId, input.companyId)))
    : [];
  if (!doc) return createProposalDocument(tx, input);
  const nextRevision = doc.latestRevisionNumber + 1;
  const [revision] = await tx.insert(documentRevisions).values({
    companyId: input.companyId,
    documentId: doc.id,
    revisionNumber: nextRevision,
    title: input.title,
    format: "markdown",
    body: input.body,
    changeSummary: "Propuesta revisada",
    createdByAgentId: input.actor.agentId ?? null,
    createdByUserId: input.actor.userId ?? null,
  }).returning();
  await tx.update(documents).set({
    title: input.title,
    latestBody: input.body,
    latestRevisionId: revision!.id,
    latestRevisionNumber: nextRevision,
    updatedByAgentId: input.actor.agentId ?? null,
    updatedByUserId: input.actor.userId ?? null,
    updatedAt: new Date(),
  }).where(eq(documents.id, doc.id));
  return doc.id;
}

function mergeRevisionFields(current: ProposalRow, patch: ReviseProposalInput) {
  return {
    title: patch.title ?? current.title,
    scope: patch.scope ?? current.scope,
    terms: patch.terms !== undefined ? patch.terms : current.terms,
    priceCents: patch.priceCents ?? current.priceCents,
    depositCents: patch.depositCents !== undefined ? patch.depositCents : current.depositCents,
    currency: patch.currency ?? current.currency,
    validUntil: patch.validUntil !== undefined ? patch.validUntil : current.validUntil,
  };
}

async function findByStripeReference(executor: Executor, ref: { proposalId?: unknown; paymentLinkId?: unknown }) {
  if (typeof ref.proposalId === "string" && UUID_PATTERN.test(ref.proposalId)) {
    const [row] = await executor.select().from(proposals).where(eq(proposals.id, ref.proposalId));
    if (row) return row;
  }
  if (typeof ref.paymentLinkId === "string" && ref.paymentLinkId) {
    const [row] = await executor.select().from(proposals).where(eq(proposals.stripePaymentLinkId, ref.paymentLinkId));
    if (row) return row;
  }
  return null;
}

function stripeRefsFromEvent(event: StripeEventLike) {
  const object = event.data?.object ?? {};
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  return { object, metadata, proposalId: metadata.proposalId, paymentLinkId: object.payment_link };
}

export function proposalService(db: Db, deps: ProposalServiceDeps = {}) {
  const now = () => deps.now?.() ?? new Date();
  const publicBase = (deps.publicBaseUrl ?? "").replace(/\/+$/, "");
  const publicUrlFor = (token: string) => `${publicBase}/api/public/proposals/${token}/view`;
  let secrets: ReturnType<typeof secretService> | null = null;
  const resolveSecret = deps.resolveSecret ?? (async (companyId: string, key: string) => {
    secrets ??= secretService(db);
    const secret = await secrets.getByKey(companyId, key);
    if (!secret) return null;
    return secrets.resolveSecretValue(companyId, secret.id, "latest");
  });

  async function loadRow(executor: Executor, id: string) {
    const [row] = await executor.select().from(proposals).where(eq(proposals.id, id));
    return row ?? null;
  }

  /** Drafts are internal until sent, so their tokens never resolve publicly. */
  async function loadByToken(token: string) {
    const [row] = await db.select().from(proposals).where(eq(proposals.publicToken, token));
    if (!row || row.status === "draft") return null;
    return row;
  }

  async function requireRow(token: string) {
    const row = await loadByToken(token);
    if (!row) throw notFound("Proposal not found");
    return row;
  }

  async function createFromOpportunity(companyId: string, input: CreateProposalInput, actor: ProposalActor): Promise<Proposal> {
    return db.transaction(async (tx) => {
      await lockProposalKey(tx, companyId, input.idempotencyKey);
      const [existing] = await tx.select().from(proposals).where(and(
        eq(proposals.companyId, companyId),
        eq(proposals.proposalKey, input.idempotencyKey),
        eq(proposals.revision, 1),
      ));
      if (existing) return toProposal(existing);

      let customerId = input.customerId ?? null;
      if (input.opportunityId) {
        const [opportunity] = await tx.select({ customerId: opportunities.customerId }).from(opportunities)
          .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.companyId, companyId))).limit(1);
        if (!opportunity) throw notFound("Opportunity not found");
        if (customerId && customerId !== opportunity.customerId) throw unprocessable("Customer does not match the opportunity");
        customerId = opportunity.customerId;
      }
      if (customerId) {
        const [customer] = await tx.select({ id: customers.id }).from(customers)
          .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId))).limit(1);
        if (!customer) throw notFound("Customer not found");
      }

      const [row] = await tx.insert(proposals).values({
        companyId,
        proposalKey: input.idempotencyKey,
        revision: 1,
        opportunityId: input.opportunityId ?? null,
        customerId,
        title: input.title,
        scope: input.scope,
        terms: input.terms ?? null,
        priceCents: input.priceCents,
        depositCents: input.depositCents ?? null,
        currency: input.currency,
        validUntil: input.validUntil ?? null,
        status: "draft",
        publicToken: newPublicToken(),
        paymentStatus: "none",
        createdByAgentId: actor.agentId ?? null,
        createdByUserId: actor.userId ?? null,
      }).returning();
      const documentId = await createProposalDocument(tx, {
        companyId,
        title: row!.title,
        body: renderProposalMarkdown(row!, await getCompanyName(tx, companyId)),
        actor,
      });
      const [updated] = await tx.update(proposals).set({ documentId, updatedAt: new Date() }).where(eq(proposals.id, row!.id)).returning();
      return toProposal(updated!);
    });
  }

  async function revise(proposalId: string, patch: ReviseProposalInput, actor: ProposalActor): Promise<Proposal> {
    return db.transaction(async (tx) => {
      const requested = await loadRow(tx, proposalId);
      if (!requested) throw notFound("Proposal not found");
      await lockProposalKey(tx, requested.companyId, requested.proposalKey);
      const current = await latestRevision(tx, requested.companyId, requested.proposalKey);
      if (!current || current.id !== requested.id) {
        throw conflict("A newer revision exists; revise the latest revision", { latestRevisionId: current?.id ?? null });
      }
      if (current.status === "accepted" || current.status === "rejected") {
        throw conflict(`A ${current.status} proposal cannot be revised`);
      }
      const merged = mergeRevisionFields(current, patch);
      const companyName = await getCompanyName(tx, current.companyId);

      if (current.status === "draft") {
        const [row] = await tx.update(proposals).set({ ...merged, updatedAt: new Date() }).where(eq(proposals.id, current.id)).returning();
        const documentId = await rewriteProposalDocument(tx, {
          companyId: row!.companyId,
          documentId: row!.documentId,
          title: row!.title,
          body: renderProposalMarkdown(row!, companyName),
          actor,
        });
        const [withDocument] = await tx.update(proposals).set({ documentId }).where(eq(proposals.id, row!.id)).returning();
        return toProposal(withDocument!);
      }

      // sent, viewed or expired: the sent revision stays as it is; the change is a new revision.
      const [row] = await tx.insert(proposals).values({
        companyId: current.companyId,
        proposalKey: current.proposalKey,
        revision: current.revision + 1,
        opportunityId: current.opportunityId,
        customerId: current.customerId,
        ...merged,
        status: "draft",
        publicToken: newPublicToken(),
        paymentStatus: "none",
        createdByAgentId: actor.agentId ?? null,
        createdByUserId: actor.userId ?? null,
      }).returning();
      const documentId = await createProposalDocument(tx, {
        companyId: row!.companyId,
        title: row!.title,
        body: renderProposalMarkdown(row!, companyName),
        actor,
      });
      const [withDocument] = await tx.update(proposals).set({ documentId }).where(eq(proposals.id, row!.id)).returning();
      return toProposal(withDocument!);
    });
  }

  async function send(proposalId: string, input: { via?: "link" | "message"; recipient?: string | null }, _actor: ProposalActor): Promise<SendProposalResult> {
    const requested = await loadRow(db, proposalId);
    if (!requested) throw notFound("Proposal not found");
    if (requested.status !== "draft") {
      throw conflict("Only a draft revision can be sent; a sent revision is immutable, so create a new revision to change it", { status: requested.status });
    }
    const at = now();
    if (isPastValidity(requested, at)) throw unprocessable("validUntil has already passed; revise the proposal before sending");
    const via = input.via ?? "link";
    if (via === "message" && !deps.sendMessage) throw unprocessable("Message sending is not available yet; use via=link");

    let paymentLink: StripePaymentLink | null = null;
    let paymentUnavailableReason: string | null = null;
    if (requested.depositCents && requested.depositCents > 0) {
      const secretKey = await resolveSecret(requested.companyId, "STRIPE_SECRET_KEY");
      if (!secretKey) {
        paymentUnavailableReason = "La empresa no tiene STRIPE_SECRET_KEY configurada; no se creó enlace de pago";
      } else {
        try {
          paymentLink = await createPaymentLink({
            secretKey,
            amountCents: requested.depositCents,
            currency: requested.currency,
            name: `Señal: ${requested.title}`,
            metadata: { proposalId: requested.id, companyId: requested.companyId },
            fetch: deps.fetch,
          });
        } catch (error) {
          paymentUnavailableReason = `No se pudo crear el enlace de pago: ${error instanceof Error ? error.message : "error desconocido"}`;
        }
      }
    }

    const publicUrl = publicUrlFor(requested.publicToken ?? "");
    let messageId: string | null = null;
    if (via === "message") {
      const text = [
        `Te envío la propuesta "${requested.title}": ${publicUrl}`,
        paymentLink ? `Señal para reservar: ${paymentLink.url}` : null,
      ].filter(Boolean).join("\n");
      const result = await deps.sendMessage!({ companyId: requested.companyId, recipient: input.recipient ?? null, text, proposalId: requested.id });
      if (!result) throw unprocessable("The message could not be sent; the proposal was not marked as sent");
      messageId = result.messageId;
    }

    return db.transaction(async (tx) => {
      await lockProposalKey(tx, requested.companyId, requested.proposalKey);
      const [updated] = await tx.update(proposals).set({
        status: "sent",
        sentAt: at,
        paymentStatus: paymentLink ? "link_created" : "none",
        stripePaymentLinkId: paymentLink?.id ?? null,
        stripePaymentLinkUrl: paymentLink?.url ?? null,
        updatedAt: at,
      }).where(and(eq(proposals.id, requested.id), eq(proposals.status, "draft"))).returning();
      if (!updated) throw conflict("Proposal was already sent by another request");
      const expired = await tx.update(proposals).set({ status: "expired", expiredAt: at, updatedAt: at }).where(and(
        eq(proposals.companyId, requested.companyId),
        eq(proposals.proposalKey, requested.proposalKey),
        inArray(proposals.status, ["sent", "viewed"]),
        lt(proposals.revision, updated.revision),
      )).returning({ id: proposals.id });
      return {
        proposal: toProposal(updated),
        publicUrl,
        paymentUnavailableReason,
        messageId,
        expiredProposalIds: expired.map((row) => row.id),
      };
    });
  }

  async function markViewed(token: string): Promise<Proposal> {
    const row = await requireRow(token);
    if (row.status !== "sent") return toProposal(row);
    const at = now();
    const [updated] = await db.update(proposals).set({ status: "viewed", viewedAt: at, updatedAt: at })
      .where(and(eq(proposals.id, row.id), eq(proposals.status, "sent"))).returning();
    return toProposal(updated ?? row);
  }

  function assertOpenForSigner(row: ProposalRow, revision: number, at: Date) {
    if (row.status === "accepted") throw conflict("Proposal already accepted");
    if (row.status === "rejected") throw conflict("Proposal already rejected");
    if (row.status === "expired" || isPastValidity(row, at)) throw new HttpError(410, "Proposal expired");
    if (row.status !== "sent" && row.status !== "viewed") throw conflict(`Proposal is ${row.status} and cannot be signed`);
    if (revision !== row.revision) throw conflict("The revision shown does not match the current proposal revision", { currentRevision: row.revision });
  }

  async function accept(token: string, input: AcceptProposalPublicInput, meta: { ip?: string | null; userAgent?: string | null }): Promise<Proposal> {
    const row = await requireRow(token);
    const at = now();
    assertOpenForSigner(row, input.revision, at);
    const evidence: ProposalAcceptanceEvidence = {
      name: input.name,
      email: input.email,
      acceptedAt: at.toISOString(),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      revision: row.revision,
    };
    const [updated] = await db.update(proposals).set({
      status: "accepted",
      acceptedAt: at,
      acceptanceEvidence: evidence,
      updatedAt: at,
    }).where(and(eq(proposals.id, row.id), inArray(proposals.status, ["sent", "viewed"]))).returning();
    if (!updated) throw conflict("Proposal state changed; reload it and try again");
    return toProposal(updated);
  }

  /** The reason is accepted from the signer but has no column yet, so it is not stored. */
  async function reject(token: string, input: { revision: number; reason?: string | null }): Promise<Proposal> {
    const row = await requireRow(token);
    const at = now();
    assertOpenForSigner(row, input.revision, at);
    const [updated] = await db.update(proposals).set({ status: "rejected", rejectedAt: at, updatedAt: at })
      .where(and(eq(proposals.id, row.id), inArray(proposals.status, ["sent", "viewed"]))).returning();
    if (!updated) throw conflict("Proposal state changed; reload it and try again");
    return toProposal(updated);
  }

  /** Marks the deposit as paid. Payment is a separate fact from acceptance, so the status does not change. */
  async function recordPayment(event: StripeEventLike): Promise<PaymentRecordResult> {
    if (!event.type || !PAYMENT_EVENT_TYPES.has(event.type)) return { status: "ignored", proposalId: null, companyId: null };
    const { object, metadata, proposalId, paymentLinkId } = stripeRefsFromEvent(event);
    if (object.payment_status !== undefined && object.payment_status !== "paid") return { status: "ignored", proposalId: null, companyId: null };
    const row = await findByStripeReference(db, { proposalId, paymentLinkId });
    if (!row) return { status: "ignored", proposalId: null, companyId: null };
    if (typeof metadata.companyId === "string" && metadata.companyId !== row.companyId) return { status: "ignored", proposalId: null, companyId: null };
    if (row.paymentStatus === "paid") return { status: "unchanged", proposalId: row.id, companyId: row.companyId };
    const at = now();
    const [updated] = await db.update(proposals).set({ paymentStatus: "paid", paidAt: at, updatedAt: at })
      .where(and(eq(proposals.id, row.id), ne(proposals.paymentStatus, "paid"))).returning({ id: proposals.id });
    return { status: updated ? "paid" : "unchanged", proposalId: row.id, companyId: row.companyId };
  }

  /** Verifies the Stripe signature with the owning company's STRIPE_WEBHOOK_SECRET, then records the payment. */
  async function handleStripeWebhook(input: { rawBody: Buffer; signature: string | undefined }): Promise<PaymentRecordResult> {
    if (!input.signature) throw unauthorized("Missing Stripe signature");
    let event: StripeEventLike;
    try {
      event = JSON.parse(input.rawBody.toString("utf8")) as StripeEventLike;
    } catch {
      throw unauthorized("Invalid webhook payload");
    }
    const { proposalId, paymentLinkId } = stripeRefsFromEvent(event);
    const row = await findByStripeReference(db, { proposalId, paymentLinkId });
    if (!row) throw unauthorized("Webhook company could not be resolved");
    const secret = await resolveSecret(row.companyId, "STRIPE_WEBHOOK_SECRET");
    if (!secret) throw unauthorized("Webhook secret is not configured for this company");
    if (!verifyStripeSignature({ rawBody: input.rawBody, header: input.signature, secret })) {
      throw unauthorized("Invalid Stripe signature");
    }
    return recordPayment(event);
  }

  /** Moves sent or viewed revisions whose validity has ended to `expired`. */
  async function expireDue(at: Date = now()) {
    return db.update(proposals).set({ status: "expired", expiredAt: at, updatedAt: at }).where(and(
      inArray(proposals.status, ["sent", "viewed"]),
      isNotNull(proposals.validUntil),
      lt(proposals.validUntil, at),
    )).returning({ id: proposals.id, companyId: proposals.companyId, proposalKey: proposals.proposalKey, revision: proposals.revision });
  }

  /** Lists the latest revision of each proposal; use listRevisions for the full history. */
  async function listPage(companyId: string, query: { status?: ProposalStatus; opportunityId?: string; customerId?: string; q?: string; cursor?: string; limit?: number } = {}): Promise<ProposalPage> {
    const conditions = [eq(proposals.companyId, companyId)];
    if (query.opportunityId) conditions.push(eq(proposals.opportunityId, query.opportunityId));
    if (query.customerId) conditions.push(eq(proposals.customerId, query.customerId));
    const latest = db.selectDistinctOn([proposals.proposalKey]).from(proposals).where(and(...conditions))
      .orderBy(proposals.proposalKey, desc(proposals.revision)).as("latest_proposals");
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(latest.status, query.status));
    if (query.q) filters.push(ilike(latest.title, `%${query.q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`));
    const timestamp = sql`date_trunc('milliseconds', ${latest.updatedAt})`;
    if (query.cursor) {
      const cursor = decodeCrmCursor(query.cursor);
      if (!UUID_PATTERN.test(cursor.i)) throw badRequest("Invalid cursor");
      filters.push(or(sql`${timestamp} < ${cursor.t.toISOString()}::timestamptz`, and(sql`${timestamp} = ${cursor.t.toISOString()}::timestamptz`, lt(latest.id, cursor.i)))!);
    }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const rows = await db.select().from(latest).where(and(...filters)).orderBy(desc(timestamp), desc(latest.id)).limit(limit + 1);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items: items.map(toProposal), nextCursor: rows.length > limit && last ? encodeCrmCursor(last.updatedAt, last.id) : null };
  }

  /** Retain the original array API for existing agents and integrations. */
  async function list(companyId: string, query: Parameters<typeof listPage>[1] = {}): Promise<Proposal[]> {
    return (await listPage(companyId, query)).items;
  }

  async function getById(id: string): Promise<Proposal | null> {
    const row = await loadRow(db, id);
    return row ? toProposal(row) : null;
  }

  async function listRevisions(companyId: string, proposalKey: string): Promise<Proposal[]> {
    const rows = await db.select().from(proposals)
      .where(and(eq(proposals.companyId, companyId), eq(proposals.proposalKey, proposalKey)))
      .orderBy(proposals.revision);
    return rows.map(toProposal);
  }

  /** Public view: no ids, no other revisions, no internal notes. */
  async function publicView(token: string): Promise<PublicProposalView> {
    const row = await requireRow(token);
    const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, row.companyId));
    let bodyMarkdown: string | null = null;
    if (row.documentId) {
      const [doc] = await db.select({ body: documents.latestBody }).from(documents).where(eq(documents.id, row.documentId));
      bodyMarkdown = doc?.body ?? null;
    }
    return {
      title: row.title,
      companyName: company?.name ?? "Empresa",
      revision: row.revision,
      scope: row.scope,
      terms: row.terms,
      priceCents: row.priceCents,
      depositCents: row.depositCents,
      currency: row.currency,
      validUntil: row.validUntil ? row.validUntil.toISOString() : null,
      status: row.status as ProposalStatus,
      paymentStatus: row.paymentStatus as PublicProposalView["paymentStatus"],
      paymentUrl: row.paymentStatus === "link_created" ? row.stripePaymentLinkUrl : null,
      bodyMarkdown,
    };
  }

  return {
    createFromOpportunity,
    listPage,
    revise,
    send,
    markViewed,
    accept,
    reject,
    recordPayment,
    handleStripeWebhook,
    expireDue,
    list,
    getById,
    listRevisions,
    publicView,
    /** Company that owns a public token, or null; used by the public routes for activity logging. */
    findCompanyIdByToken: async (token: string) => (await loadByToken(token))?.companyId ?? null,
  };
}
