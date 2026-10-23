import { createHash } from "node:crypto";
import { and, count, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  accountDeletions, companyRetention, companies, conversations, conversationMessages,
  productAccounts, productAccountMembers, productAccountCompanyGrants, productAccountAuditEvents, retentionEvents,
  retentionPreviews, retentionSweeps,
} from "@paperclipai/db";
import type { CompanyRetentionInput, RetentionPreviewInput } from "@paperclipai/shared/productization/security";
import { conflict, notFound, unprocessable } from "../../errors.js";

const PREVIEW_TTL_MS = 10 * 60_000;
const DELETION_COOLING_DAYS = 30;

function inputHash(input: RetentionPreviewInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export type RetentionFileAdapter = {
  /** Counts only objects that can safely be purged without deleting a live reference. */
  preview: (companyId: string, cutoff: Date) => Promise<{ files: number; versions: number; bytes: number }>;
  /** Performs a bounded, idempotent batch; must use the existing scoped storage service. */
  purgeBatch: (companyId: string, cutoff: Date, afterId: string | null, limit: number, fence?: { sweepId: string; leaseOwner: string; policyRevision: number }) => Promise<{ afterId: string | null; processed: number; deleted: number; versions: number; bytes: number; protectedSkipped?: number; done: boolean }>;
};

export function productizationSecurityService(db: Db, options: { fileAdapter?: RetentionFileAdapter } = {}) {
  const fileAdapter = options.fileAdapter ?? null;
  async function ensureCompany(companyId: string) {
    const [row] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!row) throw notFound("Company not found");
  }

  const defaultPolicy = (companyId: string) => ({
    companyId, revision: 0, conversations: { enabled: false, days: 365 }, files: { enabled: false, days: 30 },
    updatedAt: null, updatedByUserId: null, enforcement: "not_configured" as const, blocker: null,
  });

  async function getRetention(companyId: string) {
    await ensureCompany(companyId);
    const [row] = await db.select().from(companyRetention).where(eq(companyRetention.companyId, companyId)).limit(1);
    if (!row) return defaultPolicy(companyId);
    return {
      companyId, revision: row.revision,
      conversations: { enabled: row.conversationsEnabled, days: row.conversationsDays },
      files: { enabled: row.filesEnabled, days: row.filesDays },
      updatedAt: row.updatedAt.toISOString(), updatedByUserId: row.updatedByUserId,
      enforcement: row.conversationsEnabled || row.filesEnabled ? fileAdapter || !row.filesEnabled ? "active" as const : "blocked" as const : "not_configured" as const,
      blocker: row.filesEnabled && !fileAdapter ? "retention_file_storage_adapter_missing" : null,
    };
  }

  async function previewRetention(companyId: string, userId: string, input: RetentionPreviewInput) {
    await ensureCompany(companyId);
    const now = new Date();
    const conversationCutoff = new Date(now.getTime() - input.conversations.days * 86_400_000);
    const fileCutoff = new Date(now.getTime() - input.files.days * 86_400_000);
    const [conversationCount] = input.conversations.enabled ? await db.select({ value: count() }).from(conversations)
      .where(and(eq(conversations.companyId, companyId), eq(conversations.status, "closed"), lt(conversations.updatedAt, conversationCutoff))) : [{ value: 0 }];
    const files = input.files.enabled && fileAdapter ? await fileAdapter.preview(companyId, fileCutoff) : { files: 0, versions: 0, bytes: 0 };
    const hash = inputHash(input);
    const [preview] = await db.insert(retentionPreviews).values({
      companyId, createdByUserId: userId, inputHash: hash,
      counts: { closedConversations: conversationCount?.value ?? 0, files: files.files, versions: files.versions, bytes: files.bytes,
        filesAvailable: Boolean(fileAdapter), filesBlocker: input.files.enabled && !fileAdapter ? "retention_file_storage_adapter_missing" : null },
      expiresAt: new Date(now.getTime() + PREVIEW_TTL_MS),
    }).returning({ id: retentionPreviews.id, counts: retentionPreviews.counts, expiresAt: retentionPreviews.expiresAt });
    return { ...preview!, expiresAt: preview!.expiresAt.toISOString() };
  }

  async function setRetention(companyId: string, userId: string, input: CompanyRetentionInput) {
    await ensureCompany(companyId);
    if (input.files.enabled && !fileAdapter) throw unprocessable("Safe file deletion is unavailable because no company-scoped storage purge adapter is wired.", { code: "retention_file_storage_adapter_missing" });
    const now = new Date();
    const previewHash = inputHash({ conversations: input.conversations, files: input.files });
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(companyRetention).where(eq(companyRetention.companyId, companyId)).for("update").limit(1);
      const revision = current?.revision ?? 0;
      if (input.revision !== revision) throw conflict("Retention policy changed. Reload it and create a new preview.", { code: "retention_revision_conflict", currentRevision: revision });
      const [preview] = await tx.select().from(retentionPreviews).where(and(
        eq(retentionPreviews.id, input.previewId), eq(retentionPreviews.companyId, companyId),
        eq(retentionPreviews.createdByUserId, userId), eq(retentionPreviews.inputHash, previewHash),
        sql`${retentionPreviews.consumedAt} is null`, sql`${retentionPreviews.expiresAt} > ${now}`,
      )).for("update").limit(1);
      if (!preview) throw conflict("The retention preview expired or no longer matches these settings. Preview again.", { code: "retention_preview_stale" });
      const nextRevision = revision + 1;
      const values = {
        companyId, revision: nextRevision,
        conversationsEnabled: input.conversations.enabled, conversationsDays: input.conversations.days,
        filesEnabled: input.files.enabled, filesDays: input.files.days, updatedByUserId: userId, updatedAt: now,
      };
      await tx.insert(companyRetention).values(values).onConflictDoUpdate({ target: companyRetention.companyId, set: values });
      await tx.update(retentionPreviews).set({ consumedAt: now }).where(eq(retentionPreviews.id, preview.id));
      await tx.insert(retentionEvents).values({ companyId, kind: "policy_updated", actorType: "user", actorId: userId,
        details: { revision: nextRevision, conversations: input.conversations, files: input.files, previewCounts: preview.counts } });
      const [active] = await tx.select({ id: retentionSweeps.id }).from(retentionSweeps).where(and(
        eq(retentionSweeps.companyId, companyId), sql`${retentionSweeps.status} in ('pending','running')`,
      )).limit(1);
      if (active) {
        await tx.update(retentionSweeps).set({ status: "superseded", phase: "done", leaseOwner: null, leaseExpiresAt: null, finishedAt: now, updatedAt: now })
          .where(eq(retentionSweeps.id, active.id));
        await tx.insert(retentionEvents).values({ companyId, sweepId: active.id, kind: "sweep_superseded", actorType: "system", actorId: "productization-retention-worker", details: { reason: "policy_revision_changed", nextRevision } });
      }
      if (input.conversations.enabled || input.files.enabled) {
        {
          const [sweep] = await tx.insert(retentionSweeps).values({
            companyId, policyRevision: nextRevision, status: "pending", phase: "conversations",
            conversationsCutoff: input.conversations.enabled ? new Date(now.getTime() - input.conversations.days * 86_400_000) : null,
            filesCutoff: input.files.enabled ? new Date(now.getTime() - input.files.days * 86_400_000) : null,
            createdAt: now, updatedAt: now,
          }).returning({ id: retentionSweeps.id });
          await tx.insert(retentionEvents).values({ companyId, sweepId: sweep!.id, kind: "sweep_started", actorType: "system", actorId: "productization-retention-worker", details: { policyRevision: nextRevision } });
        }
      }
      return { companyId, revision: nextRevision, conversations: { enabled: values.conversationsEnabled, days: values.conversationsDays }, files: { enabled: values.filesEnabled, days: values.filesDays }, updatedByUserId: userId, updatedAt: now.toISOString(), enforcement: input.conversations.enabled || input.files.enabled ? "active" as const : "not_configured" as const, blocker: null };
    });
  }

  async function requestAccountDeletion(userId: string, accountId: string, confirmation: string) {
    if (confirmation !== "DELETE COMMERCIAL ACCOUNT") throw unprocessable("Type the exact confirmation phrase to request deletion.", { code: "account_deletion_confirmation_required" });
    const coolingEndsAt = new Date(Date.now() + DELETION_COOLING_DAYS * 86_400_000);
    return db.transaction(async (tx) => {
      const [account] = await tx.select().from(productAccounts).where(and(eq(productAccounts.id, accountId), eq(productAccounts.ownerUserId, userId))).for("update").limit(1);
      if (!account) throw notFound("Commercial account not found for this owner.");
      const [existing] = await tx.select().from(accountDeletions).where(and(eq(accountDeletions.accountId, accountId), sql`${accountDeletions.status} in ('cooling','running','blocked')`)).limit(1);
      if (existing) return existing;
      const [deletion] = await tx.insert(accountDeletions).values({
        accountId, requestedByUserId: userId, status: "cooling", step: "verify", coolingEndsAt,
        scope: { kind: "commercial_account_only", preserves: ["company_records", "global_user", "company_memberships", "company_content"], removes: ["commercial_access_grants", "account_memberships", "usage_records"] },
        nextAttemptAt: coolingEndsAt,
      }).returning();
      await tx.insert(productAccountAuditEvents).values({ accountId, actorId: userId, actorType: "user", action: "account.deletion_requested", entityType: "product_account_deletion", entityId: deletion!.id, details: { coolingEndsAt: coolingEndsAt.toISOString(), scope: "commercial_account_only" } });
      return deletion!;
    });
  }

  async function cancelAccountDeletion(userId: string, deletionId: string) {
    return db.transaction(async (tx) => {
      const [row] = await tx.update(accountDeletions).set({ status: "cancelled", cancelledAt: new Date(), cancelledByUserId: userId, leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
        .where(and(eq(accountDeletions.id, deletionId), eq(accountDeletions.requestedByUserId, userId), eq(accountDeletions.status, "cooling"), sql`${accountDeletions.coolingEndsAt} > now()`)).returning();
      if (!row) throw conflict("Only the requester can cancel during the cooling period; this request may already be processing.", { code: "account_deletion_not_cancellable" });
      await tx.insert(productAccountAuditEvents).values({ accountId: row.accountId, actorId: userId, actorType: "user", action: "account.deletion_cancelled", entityType: "product_account_deletion", entityId: row.id, details: {} });
      return row;
    });
  }

  async function accountDeletionStatus(userId: string, accountId: string) {
    const [row] = await db.select().from(accountDeletions).where(and(eq(accountDeletions.accountId, accountId), eq(accountDeletions.requestedByUserId, userId))).orderBy(sql`${accountDeletions.createdAt} desc`).limit(1);
    return row ?? null;
  }

  return { getRetention, previewRetention, setRetention, requestAccountDeletion, cancelAccountDeletion, accountDeletionStatus };
}
