import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  calendarEvents, commitments, companies, contacts, conversationMessages, conversations, customerContacts,
  customerPortalFeedback, customerPortals, customers, issueWorkProducts, projects, proposals,
} from "@paperclipai/db";
import { CUSTOMER_PORTAL_DEFAULT_RESOURCE_KINDS } from "@paperclipai/shared/productization/customer-portal";
import type {
  CustomerPortalCreateInput, CustomerPortalCreated, CustomerPortalGrant, CustomerPortalResourceKind,
  CustomerPortalFeedbackInput, CustomerPortalFeedbackRecord, PublicCustomerPortalData,
} from "@paperclipai/shared/productization/customer-portal";
import { forbidden, notFound, unauthorized } from "../../errors.js";
import type { StorageService } from "../../storage/types.js";
import { logActivity } from "../activity-log.js";
import { proposalService } from "../proposals.js";
import { customerPortalFileService, type PortalUploadInput } from "./portal-files.js";
import { productizationAgencyService } from "./agency.js";

const KINDS: CustomerPortalResourceKind[] = [...CUSTOMER_PORTAL_DEFAULT_RESOURCE_KINDS, "files"];
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const resourceRef = (token: string, kind: "conversation" | "proposal", id: string) => createHmac("sha256", token).update(`${kind}:${id}`).digest("base64url");
const deliverableRef = (token: string, id: string, version: string) => createHmac("sha256", token).update(`work_product:${id}:${version}`).digest("base64url");
const asGrant = (row: typeof customerPortals.$inferSelect): CustomerPortalGrant => ({
  id: row.id, companyId: row.companyId, customerId: row.customerId, contactId: row.contactId,
  expiresAt: row.expiresAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null,
  resourceKinds: row.resourceKinds as CustomerPortalResourceKind[],
  allowDeliverableFeedback: row.allowDeliverableFeedback,
  allowFileUploads: row.allowFileUploads,
});

/**
 * `deps.storage` is the root-injected StorageService (the same instance given to assetRoutes/companyFileRoutes).
 * Without it, portals still work; file transfer endpoints answer 503.
 */
export function customerPortalService(db: Db, deps: { storage?: StorageService | null } = {}) {
  const fileService = customerPortalFileService(db, deps.storage ?? null);
  async function authorize(id: string, token: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !token || token.length > 256) throw unauthorized("Portal link is invalid or expired");
    const [grant] = await db.select().from(customerPortals).where(and(
      eq(customerPortals.id, id), eq(customerPortals.tokenHash, hashToken(token)),
      isNull(customerPortals.revokedAt), gt(customerPortals.expiresAt, new Date()),
    )).limit(1);
    if (!grant) throw unauthorized("Portal link is invalid or expired");
    const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, grant.customerId), eq(customers.companyId, grant.companyId), isNull(customers.archivedAt))).limit(1);
    if (!customer) throw unauthorized("Portal link is invalid or expired");
    if (grant.contactId) {
      const [link] = await db.select({ contactId: customerContacts.contactId }).from(customerContacts).where(and(eq(customerContacts.companyId, grant.companyId), eq(customerContacts.customerId, grant.customerId), eq(customerContacts.contactId, grant.contactId))).limit(1);
      if (!link) throw unauthorized("Portal link is invalid or expired");
    }
    return grant;
  }
  const requireKind = (grant: typeof customerPortals.$inferSelect, kind: CustomerPortalResourceKind) => {
    if (!grant.resourceKinds.includes(kind)) throw forbidden("This portal link does not include that resource");
  };

  return {
    async create(companyId: string, input: CustomerPortalCreateInput, userId: string): Promise<CustomerPortalCreated> {
      const [customer] = await db.select({ id: customers.id, name: customers.name }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.companyId, companyId), isNull(customers.archivedAt))).limit(1);
      if (!customer) throw notFound("Customer not found");
      const contactId = input.contactId ?? null;
      if (contactId) {
        const [link] = await db.select({ id: customerContacts.contactId }).from(customerContacts).where(and(
          eq(customerContacts.companyId, companyId), eq(customerContacts.customerId, customer.id), eq(customerContacts.contactId, contactId),
        )).limit(1);
        if (!link) throw notFound("Contact is not linked to this customer");
      }
      const expiresAt = new Date(input.expiresAt);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
        throw forbidden("Portal expiration must be within the next 366 days");
      }
      const resourceKinds = [...new Set(input.resourceKinds ?? CUSTOMER_PORTAL_DEFAULT_RESOURCE_KINDS)];
      if (!resourceKinds.length || resourceKinds.some((kind) => !KINDS.includes(kind))) throw forbidden("Invalid portal resource scope");
      const allowFileUploads = input.allowFileUploads === true;
      if (allowFileUploads && !resourceKinds.includes("files")) throw forbidden("File uploads require files in the portal scope");
      const allowDeliverableFeedback = input.allowDeliverableFeedback === true;
      if (allowDeliverableFeedback && !resourceKinds.includes("deliverables")) throw forbidden("Deliverable feedback requires deliverables in the portal scope");
      if (allowDeliverableFeedback && contactId) throw forbidden("Deliverable feedback requires a customer-wide link");
      const token = randomBytes(32).toString("base64url");
      const [row] = await db.insert(customerPortals).values({ companyId, customerId: customer.id, contactId, tokenHash: hashToken(token), resourceKinds, allowDeliverableFeedback, allowFileUploads, expiresAt, createdByUserId: userId }).returning();
      if (!row) throw new Error("Customer portal could not be created");
      await logActivity(db, { companyId, actorType: "user", actorId: userId, action: "customer_portal.created", entityType: "customer_portal", entityId: row.id, details: { customerId: customer.id, contactId, expiresAt: expiresAt.toISOString(), resourceKinds, allowFileUploads } });
      return { ...asGrant(row), token, url: `/portal/${row.id}#token=${token}` };
    },
    async list(companyId: string, customerId: string) {
      const rows = await db.select().from(customerPortals).where(and(eq(customerPortals.companyId, companyId), eq(customerPortals.customerId, customerId))).orderBy(desc(customerPortals.createdAt));
      return rows.map(asGrant);
    },
    async revoke(companyId: string, id: string, userId: string) {
      const [row] = await db.update(customerPortals).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(customerPortals.id, id), eq(customerPortals.companyId, companyId), isNull(customerPortals.revokedAt))).returning();
      if (!row) throw notFound("Portal link not found");
      await logActivity(db, { companyId, actorType: "user", actorId: userId, action: "customer_portal.revoked", entityType: "customer_portal", entityId: id });
      return asGrant(row);
    },
    async get(id: string, token: string): Promise<PublicCustomerPortalData> {
      const grant = await authorize(id, token);
      const [customer] = await db.select({ name: customers.name }).from(customers).where(and(eq(customers.id, grant.customerId), eq(customers.companyId, grant.companyId))).limit(1);
      const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, grant.companyId)).limit(1);
      const [contact] = grant.contactId ? await db.select({ displayName: contacts.displayName }).from(contacts).where(and(eq(contacts.id, grant.contactId), eq(contacts.companyId, grant.companyId))).limit(1) : [];
      const result: PublicCustomerPortalData = { brand: await productizationAgencyService(db).getBrand(grant.companyId), companyName: company?.name ?? "", customerName: customer?.name ?? "Customer", contactName: contact?.displayName ?? null, deliverables: [], allowDeliverableFeedback: grant.allowDeliverableFeedback, proposals: [], meetings: [], conversations: [], commitments: [], files: null };
      if (grant.resourceKinds.includes("deliverables") && !grant.contactId) {
        const rows = await db.select({ id: issueWorkProducts.id, title: issueWorkProducts.title, summary: issueWorkProducts.summary, status: issueWorkProducts.status, updatedAt: issueWorkProducts.updatedAt })
          .from(issueWorkProducts).innerJoin(projects, and(eq(projects.id, issueWorkProducts.projectId), eq(projects.companyId, grant.companyId)))
          .where(and(eq(issueWorkProducts.companyId, grant.companyId), eq(projects.customerId, grant.customerId))).orderBy(desc(issueWorkProducts.updatedAt)).limit(100);
        result.deliverables = rows.map((r) => ({ reference: deliverableRef(token, r.id, r.updatedAt.toISOString()), title: r.title, summary: r.summary, status: r.status, updatedAt: r.updatedAt.toISOString() }));
      }
      if (grant.resourceKinds.includes("proposals") && !grant.contactId) {
        const rows = await db.select().from(proposals).where(and(eq(proposals.companyId, grant.companyId), eq(proposals.customerId, grant.customerId), inArray(proposals.status, ["sent", "viewed", "accepted"]))).orderBy(desc(proposals.updatedAt)).limit(50);
        result.proposals = rows.map((r) => ({ reference: resourceRef(token, "proposal", r.id), title: r.title, revision: r.revision, scope: r.scope, terms: r.terms, priceCents: r.priceCents, depositCents: r.depositCents, currency: r.currency, validUntil: r.validUntil?.toISOString() ?? null, status: r.status, paymentStatus: r.paymentStatus, paymentUrl: r.paymentStatus === "link_created" ? r.stripePaymentLinkUrl : null }));
      }
      if (grant.resourceKinds.includes("meetings")) {
        const rows = await db.select({ title: calendarEvents.title, startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt, status: calendarEvents.status, meetingLink: calendarEvents.meetingLink }).from(calendarEvents).where(and(eq(calendarEvents.companyId, grant.companyId), eq(calendarEvents.customerId, grant.customerId), ...(grant.contactId ? [eq(calendarEvents.contactId, grant.contactId)] : []))).orderBy(desc(calendarEvents.startsAt)).limit(100);
        result.meetings = rows.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString() }));
      }
      if (grant.resourceKinds.includes("conversations")) {
        const rows = await db.select({ id: conversations.id, subject: conversations.subject, status: conversations.status, updatedAt: conversations.updatedAt }).from(conversations).where(and(eq(conversations.companyId, grant.companyId), eq(conversations.customerId, grant.customerId), ...(grant.contactId ? [eq(conversations.contactId, grant.contactId)] : []))).orderBy(desc(conversations.updatedAt)).limit(30);
        const messageRows = rows.length ? await db.select({ conversationId: conversationMessages.conversationId, direction: conversationMessages.direction, actorKind: conversationMessages.actorKind, body: conversationMessages.body, createdAt: conversationMessages.createdAt }).from(conversationMessages).where(and(eq(conversationMessages.companyId, grant.companyId), inArray(conversationMessages.conversationId, rows.map((row) => row.id)))).orderBy(asc(conversationMessages.createdAt), asc(conversationMessages.id)).limit(3000) : [];
        const messagesByConversation = new Map<string, typeof messageRows>();
        for (const message of messageRows) {
          const items = messagesByConversation.get(message.conversationId) ?? [];
          if (items.length < 100) messagesByConversation.set(message.conversationId, [...items, message]);
        }
        result.conversations = rows.map((row) => {
          const messages = messagesByConversation.get(row.id) ?? [];
          const reference = resourceRef(token, "conversation", row.id);
          return { reference, subject: row.subject, status: row.status, updatedAt: row.updatedAt.toISOString(), messages: messages.map((m) => ({ direction: m.direction, actorKind: m.actorKind, body: m.body, createdAt: m.createdAt.toISOString() })) };
        });
      }
      if (grant.resourceKinds.includes("commitments")) {
        const rows = await db.select({ who: commitments.who, what: commitments.what, dueAt: commitments.dueAt, status: commitments.status }).from(commitments).where(and(eq(commitments.companyId, grant.companyId), eq(commitments.customerId, grant.customerId), ...(grant.contactId ? [eq(commitments.contactId, grant.contactId)] : []))).orderBy(desc(commitments.updatedAt)).limit(100);
        result.commitments = rows.map((r) => ({ ...r, dueAt: r.dueAt?.toISOString() ?? null }));
      }
      if (grant.resourceKinds.includes("files")) {
        result.files = { canUpload: grant.allowFileUploads, limits: fileService.limits(), items: await fileService.listForPortal(grant, token) };
      }
      return result;
    },
    /** Cheap grant check the route runs before it buffers an upload body. */
    async authorizeUpload(id: string, token: string) {
      const grant = await authorize(id, token); requireKind(grant, "files");
      if (!grant.allowFileUploads) throw forbidden("This portal link does not allow file uploads");
    },
    async uploadFile(id: string, token: string, input: PortalUploadInput) {
      const grant = await authorize(id, token); requireKind(grant, "files");
      if (!grant.allowFileUploads) throw forbidden("This portal link does not allow file uploads");
      return fileService.upload(grant, token, input);
    },
    async downloadFile(id: string, token: string, reference: string) {
      const grant = await authorize(id, token); requireKind(grant, "files");
      return fileService.downloadForPortal(grant, token, reference);
    },
    // Board-side scoped file management (company-scoped; routes enforce board actors).
    listFiles: (companyId: string, customerId: string) => fileService.listForBoard(companyId, customerId),
    shareFile: (companyId: string, customerId: string, contactId: string | null, userId: string, input: Omit<PortalUploadInput, "idempotencyKey">) =>
      fileService.uploadOutbound(companyId, customerId, contactId, userId, input),
    setFileVisibility: (companyId: string, fileId: string, visible: boolean, userId: string) => fileService.setVisibility(companyId, fileId, visible, userId),
    downloadFileForBoard: (companyId: string, fileId: string) => fileService.downloadForBoard(companyId, fileId),
    async comment(id: string, token: string, conversationRef: string, body: string) {
      const grant = await authorize(id, token); requireKind(grant, "conversations");
      const conversationRows = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.companyId, grant.companyId), eq(conversations.customerId, grant.customerId), ...(grant.contactId ? [eq(conversations.contactId, grant.contactId)] : []))).orderBy(desc(conversations.updatedAt)).limit(30);
      const conversation = conversationRows.find((row) => {
        const expected = Buffer.from(resourceRef(token, "conversation", row.id));
        const supplied = Buffer.from(conversationRef);
        return expected.length === supplied.length && timingSafeEqual(expected, supplied);
      });
      if (!conversation) throw notFound("Conversation not found");
      const [row] = await db.insert(conversationMessages).values({ companyId: grant.companyId, conversationId: conversation.id, direction: "inbound", actorKind: "contact", body, deliveryStatus: "sent" }).returning({ id: conversationMessages.id });
      await db.update(conversations).set({ lastMessageAt: new Date(), lastInboundAt: new Date(), updatedAt: new Date() }).where(and(eq(conversations.id, conversation.id), eq(conversations.companyId, grant.companyId)));
      await logActivity(db, { companyId: grant.companyId, actorType: "system", actorId: "customer-portal-contact", action: "conversation.message.created", entityType: "conversation_message", entityId: row.id, details: { conversationId: conversation.id, portalId: grant.id, contactId: grant.contactId } });
      return { accepted: true };
    },
    async submitDeliverableFeedback(id: string, token: string, input: CustomerPortalFeedbackInput): Promise<{ accepted: true; feedback: CustomerPortalFeedbackRecord }> {
      const grant = await authorize(id, token);
      requireKind(grant, "deliverables");
      if (!grant.allowDeliverableFeedback) throw forbidden("This portal link does not allow deliverable feedback");
      const [prior] = await db.select().from(customerPortalFeedback).where(and(
        eq(customerPortalFeedback.portalId, grant.id), eq(customerPortalFeedback.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (prior) {
        const priorReference = deliverableRef(token, prior.targetId, prior.targetVersion);
        const supplied = Buffer.from(input.reference);
        const expected = Buffer.from(priorReference);
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied) || prior.decision !== input.decision || prior.comment !== input.comment) {
          throw forbidden("That feedback key was already used for another response");
        }
        return { accepted: true, feedback: { targetKind: "work_product", targetTitle: "Deliverable", targetVersion: prior.targetVersion, decision: prior.decision as CustomerPortalFeedbackRecord["decision"], comment: prior.comment, actorKind: "portal_token_holder", createdAt: prior.createdAt.toISOString() } };
      }
      if (grant.contactId) throw forbidden("Deliverable feedback is only available on customer-wide links");
      const rows = await db.select({ id: issueWorkProducts.id, title: issueWorkProducts.title, updatedAt: issueWorkProducts.updatedAt })
        .from(issueWorkProducts).innerJoin(projects, and(eq(projects.id, issueWorkProducts.projectId), eq(projects.companyId, grant.companyId)))
        .where(and(eq(issueWorkProducts.companyId, grant.companyId), eq(projects.customerId, grant.customerId))).orderBy(desc(issueWorkProducts.updatedAt)).limit(100);
      const workProduct = rows.find((row) => {
        const expected = Buffer.from(deliverableRef(token, row.id, row.updatedAt.toISOString()));
        const supplied = Buffer.from(input.reference);
        return expected.length === supplied.length && timingSafeEqual(expected, supplied);
      });
      if (!workProduct) throw notFound("Deliverable not found or changed since it was shared");
      const [saved] = await db.insert(customerPortalFeedback).values({
        companyId: grant.companyId, customerId: grant.customerId, portalId: grant.id, targetKind: "work_product",
        targetId: workProduct.id, targetVersion: workProduct.updatedAt.toISOString(), decision: input.decision,
        comment: input.comment, actorKind: "portal_token_holder", contactId: grant.contactId, idempotencyKey: input.idempotencyKey,
      }).returning();
      if (!saved) throw new Error("Customer feedback could not be saved");
      await logActivity(db, { companyId: grant.companyId, actorType: "system", actorId: "customer-portal-contact", action: "customer_portal.feedback.received", entityType: "customer_portal_feedback", entityId: saved.id, details: { customerId: grant.customerId, portalId: grant.id, targetKind: "work_product", decision: input.decision, contactId: grant.contactId } });
      return { accepted: true, feedback: { targetKind: "work_product", targetTitle: workProduct.title, targetVersion: saved.targetVersion, decision: saved.decision as CustomerPortalFeedbackRecord["decision"], comment: saved.comment, actorKind: "portal_token_holder", createdAt: saved.createdAt.toISOString() } };
    },
    async listFeedback(companyId: string, portalId: string): Promise<CustomerPortalFeedbackRecord[]> {
      const [grant] = await db.select({ id: customerPortals.id }).from(customerPortals).where(and(eq(customerPortals.id, portalId), eq(customerPortals.companyId, companyId))).limit(1);
      if (!grant) throw notFound("Customer portal not found");
      const rows = await db.select({ targetTitle: issueWorkProducts.title, targetVersion: customerPortalFeedback.targetVersion, decision: customerPortalFeedback.decision, comment: customerPortalFeedback.comment, actorKind: customerPortalFeedback.actorKind, createdAt: customerPortalFeedback.createdAt })
        .from(customerPortalFeedback).leftJoin(issueWorkProducts, and(eq(issueWorkProducts.id, customerPortalFeedback.targetId), eq(issueWorkProducts.companyId, companyId)))
        .where(and(eq(customerPortalFeedback.companyId, companyId), eq(customerPortalFeedback.portalId, portalId), eq(customerPortalFeedback.targetKind, "work_product")))
        .orderBy(desc(customerPortalFeedback.createdAt)).limit(100);
      return rows.map((row) => ({ targetKind: "work_product", targetTitle: row.targetTitle ?? "Removed deliverable", targetVersion: row.targetVersion, decision: row.decision as CustomerPortalFeedbackRecord["decision"], comment: row.comment, actorKind: "portal_token_holder", createdAt: row.createdAt.toISOString() }));
    },
    async acceptProposal(id: string, token: string, input: { proposalReference: string; revision: number; name: string; email: string }, meta: { ip: string | null; userAgent: string | null }) {
      const grant = await authorize(id, token); requireKind(grant, "proposals");
      const scoped = await db.select({ id: proposals.id, publicToken: proposals.publicToken, revision: proposals.revision }).from(proposals).where(and(eq(proposals.companyId, grant.companyId), eq(proposals.customerId, grant.customerId), inArray(proposals.status, ["sent", "viewed", "accepted"]))).orderBy(desc(proposals.updatedAt)).limit(50);
      const proposal = scoped.find((row) => {
        if (row.revision !== input.revision) return false;
        const expected = Buffer.from(resourceRef(token, "proposal", row.id));
        const supplied = Buffer.from(input.proposalReference);
        return expected.length === supplied.length && timingSafeEqual(expected, supplied);
      });
      if (!proposal?.publicToken) throw notFound("Proposal not found");
      const svc = proposalService(db);
      const accepted = await svc.accept(proposal.publicToken, input, meta);
      await logActivity(db, { companyId: grant.companyId, actorType: "system", actorId: "customer-portal-contact", action: "proposal.accepted", entityType: "proposal", entityId: accepted.id, details: { revision: accepted.revision, portalId: grant.id, contactId: grant.contactId } });
      return { accepted: true, title: accepted.title, revision: accepted.revision, status: accepted.status };
    },
  };
}
