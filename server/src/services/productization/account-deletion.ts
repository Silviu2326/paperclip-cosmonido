import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import {
  accountDeletions, productAccounts, productAccountCompanyGrants, productAccountMembers,
  productAccountUsageNotifications, productUsageEvents, productUsageMeters, productUsageReservations,
} from "@paperclipai/db";

const LEASE_MS = 60_000;
const PROVIDER_LEASE_MS = 90_000;
const BATCH = 100;

export type AccountDeletionProvider = {
  /** Must only delete the exact customer after confirming no active subscription; idempotent. */
  deleteCustomer: (customerId: string, accountId: string) => Promise<{ activeSubscription: boolean }>;
};

/** Resumable, one-account tick. The worker never deletes companies or global auth users. */
export function createAccountDeletionWorker(db: Db, options: { provider?: AccountDeletionProvider; workerId?: string } = {}) {
  const workerId = options.workerId ?? `account-deletion-${randomUUID()}`;

  async function claim() {
    const [candidate] = await db.select({ id: accountDeletions.id }).from(accountDeletions).where(and(
      or(eq(accountDeletions.status, "cooling"), eq(accountDeletions.status, "running"), eq(accountDeletions.status, "blocked")),
      sql`${accountDeletions.coolingEndsAt} < now()`,
      or(isNull(accountDeletions.nextAttemptAt), sql`${accountDeletions.nextAttemptAt} < now()`),
      or(isNull(accountDeletions.leaseExpiresAt), sql`${accountDeletions.leaseExpiresAt} < now()`),
    )).orderBy(asc(accountDeletions.coolingEndsAt), asc(accountDeletions.createdAt)).limit(1);
    if (!candidate) return null;
    const token = `${workerId}:${randomUUID()}`;
    const [row] = await db.update(accountDeletions).set({ status: "running", leaseOwner: token, leaseExpiresAt: sql`now() + (${LEASE_MS} * interval '1 millisecond')`, attempts: sql`${accountDeletions.attempts} + 1`, updatedAt: sql`now()` })
      .where(and(
        eq(accountDeletions.id, candidate.id),
        or(eq(accountDeletions.status, "cooling"), eq(accountDeletions.status, "running"), eq(accountDeletions.status, "blocked")),
        sql`${accountDeletions.coolingEndsAt} < now()`,
        or(isNull(accountDeletions.nextAttemptAt), sql`${accountDeletions.nextAttemptAt} < now()`),
        or(isNull(accountDeletions.leaseExpiresAt), sql`${accountDeletions.leaseExpiresAt} < now()`),
      )).returning();
    return row ? { row, token } : null;
  }

  async function block(id: string, token: string, code: string) {
    await db.update(accountDeletions).set({ status: "blocked", blockerCode: code, blockerDetail: { code }, nextAttemptAt: new Date(Date.now() + 60 * 60_000), leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(accountDeletions.id, id), eq(accountDeletions.leaseOwner, token)));
    return { status: "blocked" as const, code };
  }

  async function tick() {
    const claimed = await claim();
    if (!claimed) return { status: "idle" as const };
    const { row, token } = claimed;
    const [account] = await db.select().from(productAccounts).where(eq(productAccounts.id, row.accountId)).limit(1);
    if (!account) return block(row.id, token, "commercial_account_record_missing");
    if (account.stripeCustomerId) {
      if (!options.provider) return block(row.id, token, "stripe_customer_cleanup_not_configured");
      try {
        const fresh = await db.transaction(async (tx) => {
          const [owned] = await tx.select({ id: accountDeletions.id }).from(accountDeletions).where(and(
            eq(accountDeletions.id, row.id), eq(accountDeletions.leaseOwner, token), eq(accountDeletions.status, "running"),
            sql`${accountDeletions.leaseExpiresAt} > now()`,
          )).for("update").limit(1);
          if (!owned) return null;
          const [latestAccount] = await tx.select().from(productAccounts).where(eq(productAccounts.id, row.accountId)).for("update").limit(1);
          if (!latestAccount || latestAccount.stripeCustomerId !== account.stripeCustomerId) return null;
          await tx.update(accountDeletions).set({ leaseExpiresAt: new Date(Date.now() + PROVIDER_LEASE_MS), updatedAt: new Date() }).where(eq(accountDeletions.id, row.id));
          return latestAccount;
        });
        if (!fresh) return { status: "lease_lost" as const };
        const result = await options.provider.deleteCustomer(fresh.stripeCustomerId!, fresh.id);
        if (result.activeSubscription) return block(row.id, token, "stripe_subscription_must_be_cancelled_before_deletion");
      } catch {
        return block(row.id, token, "stripe_customer_cleanup_failed");
      }
    } else if (account.stripeSubscriptionId) {
      return block(row.id, token, "stripe_subscription_customer_missing");
    }

    if (row.step === "verify") {
      await db.transaction(async (tx) => {
        const [owned] = await tx.select({ id: accountDeletions.id }).from(accountDeletions).where(and(eq(accountDeletions.id, row.id), eq(accountDeletions.leaseOwner, token), eq(accountDeletions.status, "running"))).for("update").limit(1);
        if (!owned) return;
        await tx.update(productAccounts).set({ access: "inactive", updatedAt: new Date() }).where(eq(productAccounts.id, account.id));
        await tx.update(accountDeletions).set({ step: "usage", irreversibleAt: new Date(), blockerCode: null, blockerDetail: null, leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: new Date(), updatedAt: new Date() }).where(eq(accountDeletions.id, row.id));
      });
      return { status: "processed" as const, step: "usage" as const };
    }

    if (row.step === "usage") {
      const [events, notifications, reservations, meters] = await Promise.all([
        db.select({ id: productUsageEvents.id }).from(productUsageEvents).where(eq(productUsageEvents.accountId, account.id)).orderBy(asc(productUsageEvents.id)).limit(BATCH),
        db.select({ id: productAccountUsageNotifications.id }).from(productAccountUsageNotifications).where(eq(productAccountUsageNotifications.accountId, account.id)).orderBy(asc(productAccountUsageNotifications.id)).limit(BATCH),
        db.select({ id: productUsageReservations.id }).from(productUsageReservations).where(eq(productUsageReservations.accountId, account.id)).orderBy(asc(productUsageReservations.id)).limit(BATCH),
        db.select({ metric: productUsageMeters.metric, periodKey: productUsageMeters.periodKey }).from(productUsageMeters).where(eq(productUsageMeters.accountId, account.id)).orderBy(asc(productUsageMeters.metric), asc(productUsageMeters.periodKey)).limit(BATCH),
      ]);
      await db.transaction(async (tx) => {
        const [owned] = await tx.select({ id: accountDeletions.id }).from(accountDeletions).where(and(eq(accountDeletions.id, row.id), eq(accountDeletions.leaseOwner, token), eq(accountDeletions.step, "usage"))).for("update").limit(1);
        if (!owned) return;
        if (events.length) await tx.delete(productUsageEvents).where(inArray(productUsageEvents.id, events.map((item) => item.id)));
        if (notifications.length) await tx.delete(productAccountUsageNotifications).where(inArray(productAccountUsageNotifications.id, notifications.map((item) => item.id)));
        if (reservations.length) await tx.delete(productUsageReservations).where(inArray(productUsageReservations.id, reservations.map((item) => item.id)));
        if (meters.length) await tx.delete(productUsageMeters).where(and(
          eq(productUsageMeters.accountId, account.id),
          or(...meters.map((item) => and(eq(productUsageMeters.metric, item.metric), eq(productUsageMeters.periodKey, item.periodKey)))),
        ));
        const [remaining] = await tx.select({ id: productUsageEvents.id }).from(productUsageEvents).where(eq(productUsageEvents.accountId, account.id)).limit(1);
        const [remainingNotifications] = await tx.select({ id: productAccountUsageNotifications.id }).from(productAccountUsageNotifications).where(eq(productAccountUsageNotifications.accountId, account.id)).limit(1);
        const [remainingReservations] = await tx.select({ id: productUsageReservations.id }).from(productUsageReservations).where(eq(productUsageReservations.accountId, account.id)).limit(1);
        const [remainingMeters] = await tx.select({ metric: productUsageMeters.metric }).from(productUsageMeters).where(eq(productUsageMeters.accountId, account.id)).limit(1);
        if (!remaining && !remainingNotifications && !remainingReservations && !remainingMeters) await tx.update(accountDeletions).set({ step: "anonymize", updatedAt: new Date() }).where(eq(accountDeletions.id, row.id));
        await tx.update(accountDeletions).set({ leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: new Date(), updatedAt: new Date() }).where(eq(accountDeletions.id, row.id));
      });
      return { status: "processed" as const, step: "usage" as const, deleted: events.length + notifications.length + reservations.length + meters.length };
    }

    if (row.step === "anonymize") {
      const grants = await db.select({ companyId: productAccountCompanyGrants.companyId }).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.accountId, account.id)).orderBy(asc(productAccountCompanyGrants.companyId)).limit(BATCH);
      const members = await db.select({ id: productAccountMembers.id }).from(productAccountMembers).where(eq(productAccountMembers.accountId, account.id)).orderBy(asc(productAccountMembers.id)).limit(BATCH);
      await db.transaction(async (tx) => {
        const [owned] = await tx.select({ id: accountDeletions.id }).from(accountDeletions).where(and(eq(accountDeletions.id, row.id), eq(accountDeletions.leaseOwner, token), eq(accountDeletions.step, "anonymize"))).for("update").limit(1);
        if (!owned) return;
        if (grants.length) await tx.delete(productAccountCompanyGrants).where(and(eq(productAccountCompanyGrants.accountId, account.id), inArray(productAccountCompanyGrants.companyId, grants.map((item) => item.companyId))));
        if (members.length) await tx.delete(productAccountMembers).where(inArray(productAccountMembers.id, members.map((item) => item.id)));
        const [remainingGrants] = await tx.select({ companyId: productAccountCompanyGrants.companyId }).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.accountId, account.id)).limit(1);
        const [remainingMembers] = await tx.select({ id: productAccountMembers.id }).from(productAccountMembers).where(eq(productAccountMembers.accountId, account.id)).limit(1);
        if (!remainingGrants && !remainingMembers) {
          await tx.update(productAccounts).set({ name: `Deleted account ${account.id.slice(0, 8)}`, access: "inactive", stripeCustomerId: null, updatedAt: new Date() }).where(eq(productAccounts.id, account.id));
          await tx.update(accountDeletions).set({ step: "done", status: "completed", completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date(), counters: { commercialUsageRowsRemoved: row.counters?.commercialUsageRowsRemoved ?? 0 } }).where(eq(accountDeletions.id, row.id));
        } else await tx.update(accountDeletions).set({ leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: new Date(), updatedAt: new Date() }).where(eq(accountDeletions.id, row.id));
      });
      return { status: "processed" as const, step: "anonymize" as const, grantsRevoked: grants.length, membersRemoved: members.length };
    }
    return { status: row.status === "completed" ? "completed" as const : "idle" as const };
  }

  return { tick };
}
