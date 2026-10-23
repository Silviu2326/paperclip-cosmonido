import { and, asc, desc, eq, gte, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import webPush from "web-push";
import type { Db } from "@paperclipai/db";
import { activityLog, companies, companyMemberships, decisions, deliverableReviews, issues, productNotificationOutbox, productNotificationPreferences, productNotificationSignals, productNotificationSubscriptions } from "@paperclipai/db";
import { localEncryptedProvider } from "../../secrets/local-encrypted-provider.js";
import type {
  ProductNotificationCategory, ProductNotificationItem, ProductNotificationPreferences, ProductPushPublicConfig, ProductPushSubscriptionInput,
  ProductNotificationsSnapshot, UpdateProductNotificationPreferencesInput,
} from "@paperclipai/shared/productization/notifications";
import { forbidden, unprocessable } from "../../errors.js";

const ALL_CATEGORIES: ProductNotificationCategory[] = ["decisions", "reviews", "tasks"];
const activeStatuses = ["backlog", "todo", "in_progress", "blocked"];
const MAX_PUSH_PAYLOAD_BYTES = 1024;
const PUSH_TIMEOUT_MS = 8_000;
const PUSH_TTL_SECONDS = 300;
const MAX_DELIVERY_ATTEMPTS = 5;
const retryDelaysMs = [30_000, 120_000, 600_000, 3_600_000];
const pushHosts = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const summary = (value: string | null | undefined, max = 180) => {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}â€¦` : normalized;
};
const toPreferences = (companyId: string, row?: typeof productNotificationPreferences.$inferSelect): ProductNotificationPreferences => ({
  companyId,
  categories: row ? row.categories.filter((item): item is ProductNotificationCategory => ALL_CATEGORIES.includes(item as ProductNotificationCategory)) : [...ALL_CATEGORIES],
  browserEnabled: row?.browserEnabled ?? false,
  remotePushEnabled: row?.remotePushEnabled ?? false,
  remotePushStatus: !getVapidConfig() ? "blocked_configuration" : row?.remotePushEnabled ? "enabled" : "disabled",
  whatsappStatus: "blocked_authorized_channel_required",
  updatedAt: row?.updatedAt.toISOString() ?? new Date(0).toISOString(),
});

type VapidConfig = { subject: string; publicKey: string; privateKey: string };
type StoredSubscription = { endpoint: string; expirationTime: number | null; keys: { p256dh: string; auth: string } };
function getVapidConfig(): VapidConfig | null {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey || !/^(https:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/.test(subject)) return null;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(publicKey) || !/^[A-Za-z0-9_-]{40,60}$/.test(privateKey)) return null;
  return { subject, publicKey, privateKey };
}

function validatePushEndpoint(value: string): URL {
  let endpoint: URL;
  try { endpoint = new URL(value); } catch { throw unprocessable("Unsupported push endpoint"); }
  const host = endpoint.hostname.toLowerCase();
  const supportedHost = pushHosts.includes(host) || host.endsWith(".notify.windows.com");
  if (endpoint.protocol !== "https:" || endpoint.port && endpoint.port !== "443" || endpoint.username || endpoint.password || !supportedHost || endpoint.href.length > 4096) {
    throw unprocessable("Unsupported push endpoint");
  }
  return endpoint;
}

function hashEndpoint(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

function relevantSignal(activity: typeof activityLog.$inferSelect): { category: ProductNotificationCategory; sourceType: ProductNotificationItem["sourceType"] } | null {
  if (activity.entityType === "decision" && /^decision\.(created|commercial_created|updated)$/.test(activity.action)) return { category: "decisions", sourceType: "decision" };
  if (activity.entityType === "deliverable_review" && activity.action === "deliverable.submitted") return { category: "reviews", sourceType: "deliverable_review" };
  if (activity.entityType === "issue" && /^issue\.(created|updated|status_changed|assigned)$/.test(activity.action)) return { category: "tasks", sourceType: "issue" };
  return null;
}

export function productNotificationsService(db: Db) {
  async function deactivateSubscription(subscriptionId: string, companyId: string, userId: string, status: "revoked" | "expired") {
    const now = new Date();
    await db.update(productNotificationSubscriptions).set({ status, revokedAt: now, encryptedMaterial: "", updatedAt: now }).where(and(
      eq(productNotificationSubscriptions.id, subscriptionId), eq(productNotificationSubscriptions.companyId, companyId),
      eq(productNotificationSubscriptions.userId, userId), eq(productNotificationSubscriptions.status, "active"),
    ));
    const [remaining] = await db.select({ id: productNotificationSubscriptions.id }).from(productNotificationSubscriptions).where(and(
      eq(productNotificationSubscriptions.companyId, companyId), eq(productNotificationSubscriptions.userId, userId), eq(productNotificationSubscriptions.status, "active"),
    )).limit(1);
    if (!remaining) await db.update(productNotificationPreferences).set({ remotePushEnabled: false, updatedAt: now }).where(and(
      eq(productNotificationPreferences.companyId, companyId), eq(productNotificationPreferences.userId, userId),
    ));
  }
  async function getPreferences(companyId: string, userId: string) {
    const [row] = await db.select().from(productNotificationPreferences).where(and(
      eq(productNotificationPreferences.companyId, companyId), eq(productNotificationPreferences.userId, userId),
    )).limit(1);
    return toPreferences(companyId, row);
  }
  async function loadSnapshot(companyId: string, userId: string): Promise<ProductNotificationsSnapshot> {
    const preferences = await getPreferences(companyId, userId);
    const [company] = await db.select({ issuePrefix: companies.issuePrefix }).from(companies).where(eq(companies.id, companyId)).limit(1);
    const companyPath = company?.issuePrefix ? `/${encodeURIComponent(company.issuePrefix)}` : "";
    const enabled = new Set(preferences.categories);
    const items: ProductNotificationItem[] = [];
    if (enabled.has("decisions")) {
      const rows = await db.select({ id: decisions.id, title: decisions.title, body: decisions.body, createdAt: decisions.createdAt, updatedAt: decisions.updatedAt })
        .from(decisions).where(and(eq(decisions.companyId, companyId), eq(decisions.status, "open"), gte(decisions.expiresAt, new Date())))
        .orderBy(asc(decisions.expiresAt), desc(decisions.createdAt)).limit(50);
      for (const row of rows) items.push({ key: `decision:${row.id}:${row.updatedAt.toISOString()}`, category: "decisions", sourceType: "decision", sourceId: row.id, title: row.title, summary: summary(row.body), href: `${companyPath}/notifications/decision/${row.id}`, createdAt: row.createdAt.toISOString(), revision: row.updatedAt.toISOString() });
    }
    if (enabled.has("reviews")) {
      const rows = await db.select({ id: deliverableReviews.id, issueId: deliverableReviews.issueId, goalId: deliverableReviews.goalId, targetKind: deliverableReviews.targetKind, createdAt: deliverableReviews.createdAt, updatedAt: deliverableReviews.updatedAt })
        .from(deliverableReviews).where(and(eq(deliverableReviews.companyId, companyId), eq(deliverableReviews.state, "pending"), or(isNull(deliverableReviews.reviewerUserId), eq(deliverableReviews.reviewerUserId, userId))))
        .orderBy(desc(deliverableReviews.createdAt)).limit(50);
      for (const row of rows) items.push({ key: `review:${row.id}:${row.updatedAt.toISOString()}`, category: "reviews", sourceType: "deliverable_review", sourceId: row.id, title: "Deliverable review", summary: `A ${row.targetKind.replaceAll("_", " ")} is waiting for review.`, href: `${companyPath}/notifications/deliverable_review/${row.id}`, createdAt: row.createdAt.toISOString(), revision: row.updatedAt.toISOString() });
    }
    if (enabled.has("tasks")) {
      const rows = await db.select({ id: issues.id, identifier: issues.identifier, title: issues.title, status: issues.status, updatedAt: issues.updatedAt })
        .from(issues).where(and(eq(issues.companyId, companyId), eq(issues.assigneeUserId, userId), inArray(issues.status, activeStatuses), isNull(issues.hiddenAt), eq(issues.visibility, "open")))
        .orderBy(desc(issues.updatedAt)).limit(50);
      for (const row of rows) items.push({ key: `task:${row.id}:${row.updatedAt.toISOString()}`, category: "tasks", sourceType: "issue", sourceId: row.id, title: row.identifier ? `${row.identifier}: ${row.title}` : row.title, summary: `Assigned task Â· ${row.status.replaceAll("_", " ")}`, href: `${companyPath}/issues/${row.id}`, createdAt: row.updatedAt.toISOString(), revision: row.updatedAt.toISOString() });
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const visibleItems = items.slice(0, 150);
    const counts: ProductNotificationsSnapshot["counts"] = { decisions: 0, reviews: 0, tasks: 0 };
    for (const item of visibleItems) counts[item.category] += 1;
    return { preferences, items: visibleItems, counts };
  }
  return {
    getPreferences,
    getPushPublicConfig(): ProductPushPublicConfig {
      const vapid = getVapidConfig();
      return { enabled: Boolean(vapid), publicKey: vapid?.publicKey ?? null };
    },
    async subscribe(companyId: string, userId: string, input: ProductPushSubscriptionInput) {
      if (!getVapidConfig()) throw unprocessable("Web Push is unavailable until VAPID public key, private key and subject are configured");
      if (!input.keys || !/^[A-Za-z0-9_-]{60,120}$/.test(input.keys.p256dh) || !/^[A-Za-z0-9_-]{20,100}$/.test(input.keys.auth)) throw unprocessable("Invalid push subscription keys");
      const endpoint = validatePushEndpoint(input.endpoint);
      if (input.expirationTime !== null && (!Number.isFinite(input.expirationTime) || input.expirationTime <= Date.now())) throw unprocessable("Push subscription is expired");
      const safeInput: ProductPushSubscriptionInput = { ...input, endpoint: endpoint.href };
      const endpointHash = hashEndpoint(endpoint.href);
      const encryptedMaterial = JSON.stringify((await localEncryptedProvider.createSecret({ value: JSON.stringify(safeInput) })).material);
      const expiresAt = input.expirationTime === null ? null : new Date(input.expirationTime);
      const subscription = await db.transaction(async (tx) => {
        await tx.insert(productNotificationPreferences).values({ companyId, userId }).onConflictDoNothing({ target: [productNotificationPreferences.companyId, productNotificationPreferences.userId] });
        const [scope] = await tx.select({ id: productNotificationPreferences.id }).from(productNotificationPreferences).where(and(
          eq(productNotificationPreferences.companyId, companyId), eq(productNotificationPreferences.userId, userId),
        )).for("update");
        const activeRows = await tx.select({ endpointHash: productNotificationSubscriptions.endpointHash }).from(productNotificationSubscriptions).where(and(
          eq(productNotificationSubscriptions.companyId, companyId), eq(productNotificationSubscriptions.userId, userId),
          eq(productNotificationSubscriptions.status, "active"),
        )).limit(10);
        if (activeRows.length >= 10 && !activeRows.some((row) => row.endpointHash === endpointHash)) throw unprocessable("This account already has the maximum number of push devices for this company");
        const [saved] = await tx.insert(productNotificationSubscriptions).values({
          companyId, userId, endpointHash, endpointHost: endpoint.hostname, encryptedMaterial, status: "active", expiresAt, revokedAt: null, updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [productNotificationSubscriptions.companyId, productNotificationSubscriptions.userId, productNotificationSubscriptions.endpointHash],
          set: { endpointHost: endpoint.hostname, encryptedMaterial, status: "active", expiresAt, revokedAt: null, updatedAt: new Date() },
        }).returning({ id: productNotificationSubscriptions.id });
        await tx.update(productNotificationPreferences).set({ remotePushEnabled: true, updatedAt: new Date() }).where(eq(productNotificationPreferences.id, scope.id));
        return saved;
      });
      return { id: subscription.id, enabled: true };
    },
    async listSubscriptions(companyId: string, userId: string) {
      return db.select({ id: productNotificationSubscriptions.id, createdAt: productNotificationSubscriptions.createdAt, lastUsedAt: productNotificationSubscriptions.lastUsedAt })
        .from(productNotificationSubscriptions).where(and(eq(productNotificationSubscriptions.companyId, companyId), eq(productNotificationSubscriptions.userId, userId), eq(productNotificationSubscriptions.status, "active"))).orderBy(desc(productNotificationSubscriptions.createdAt));
    },
    async revokeSubscription(companyId: string, userId: string, subscriptionId: string) {
      await db.update(productNotificationSubscriptions).set({ status: "revoked", revokedAt: new Date(), encryptedMaterial: "", updatedAt: new Date() }).where(and(
        eq(productNotificationSubscriptions.id, subscriptionId), eq(productNotificationSubscriptions.companyId, companyId), eq(productNotificationSubscriptions.userId, userId),
      ));
      const [remaining] = await db.select({ id: productNotificationSubscriptions.id }).from(productNotificationSubscriptions).where(and(
        eq(productNotificationSubscriptions.companyId, companyId), eq(productNotificationSubscriptions.userId, userId), eq(productNotificationSubscriptions.status, "active"),
      )).limit(1);
      if (!remaining) await db.update(productNotificationPreferences).set({ remotePushEnabled: false, updatedAt: new Date() }).where(and(
        eq(productNotificationPreferences.companyId, companyId), eq(productNotificationPreferences.userId, userId),
      ));
      return { revoked: true };
    },
    async revokeAllSubscriptions(companyId: string, userId: string) {
      await db.update(productNotificationSubscriptions).set({ status: "revoked", revokedAt: new Date(), encryptedMaterial: "", updatedAt: new Date() }).where(and(
        eq(productNotificationSubscriptions.companyId, companyId), eq(productNotificationSubscriptions.userId, userId), eq(productNotificationSubscriptions.status, "active"),
      ));
      await db.update(productNotificationPreferences).set({ remotePushEnabled: false, updatedAt: new Date() }).where(and(
        eq(productNotificationPreferences.companyId, companyId), eq(productNotificationPreferences.userId, userId),
      ));
      return { revoked: true };
    },
    async drainSignals(limit = 20) {
      const now = new Date();
      const signals = await db.select().from(productNotificationSignals).where(or(
        and(eq(productNotificationSignals.status, "pending"), lte(productNotificationSignals.nextAttemptAt, now)),
        and(eq(productNotificationSignals.status, "processing"), lt(productNotificationSignals.lockedUntil, now)),
      )).orderBy(asc(productNotificationSignals.createdAt)).limit(Math.min(Math.max(limit, 1), 50));
      let processed = 0;
      const snapshots = new Map<string, Promise<ProductNotificationsSnapshot>>();
      for (const signal of signals) {
        const condition = signal.status === "pending"
          ? and(eq(productNotificationSignals.id, signal.id), eq(productNotificationSignals.status, "pending"), lte(productNotificationSignals.nextAttemptAt, now))
          : and(eq(productNotificationSignals.id, signal.id), eq(productNotificationSignals.status, "processing"), lt(productNotificationSignals.lockedUntil, now));
        const claimAttempt = signal.attempts + 1;
        const claimUntil = new Date(Date.now() + 60_000);
        const [claimed] = await db.update(productNotificationSignals).set({ status: "processing", lockedUntil: claimUntil, attempts: claimAttempt }).where(condition).returning({ id: productNotificationSignals.id });
        if (!claimed) continue;
        try {
          const [activity] = await db.select().from(activityLog).where(and(eq(activityLog.companyId, signal.companyId), eq(activityLog.id, signal.activityId))).limit(1);
          const target = activity && relevantSignal(activity);
          if (activity && target) {
            const subscribers = await db.select({ id: productNotificationSubscriptions.id, userId: productNotificationSubscriptions.userId, categories: productNotificationPreferences.categories })
              .from(productNotificationSubscriptions)
              .innerJoin(productNotificationPreferences, and(eq(productNotificationPreferences.companyId, productNotificationSubscriptions.companyId), eq(productNotificationPreferences.userId, productNotificationSubscriptions.userId)))
              .innerJoin(companyMemberships, and(eq(companyMemberships.companyId, productNotificationSubscriptions.companyId), eq(companyMemberships.principalId, productNotificationSubscriptions.userId), eq(companyMemberships.principalType, "user"), eq(companyMemberships.status, "active")))
              .where(and(eq(productNotificationSubscriptions.companyId, signal.companyId), eq(productNotificationSubscriptions.status, "active"), or(isNull(productNotificationSubscriptions.expiresAt), gt(productNotificationSubscriptions.expiresAt, now)), eq(productNotificationPreferences.remotePushEnabled, true)));
            const eligible = subscribers.filter((sub) => sub.categories.includes(target.category));
            for (const userId of new Set(eligible.map((sub) => sub.userId))) {
              const cacheKey = `${signal.companyId}:${userId}`;
              let snapshotPromise = snapshots.get(cacheKey);
              if (!snapshotPromise) { snapshotPromise = loadSnapshot(signal.companyId, userId); snapshots.set(cacheKey, snapshotPromise); }
              const snapshot = await snapshotPromise;
              const items = snapshot.items.filter((item) => item.category === target.category && item.sourceType === target.sourceType && item.sourceId === activity.entityId);
              for (const sub of eligible.filter((candidate) => candidate.userId === userId)) {
                for (const item of items) {
                  await db.insert(productNotificationOutbox).values({
                    companyId: signal.companyId, userId, subscriptionId: sub.id, category: item.category,
                    sourceType: item.sourceType, sourceId: item.sourceId, revision: item.revision, href: item.href,
                    expiresAt: new Date(Date.now() + 60 * 60_000),
                  }).onConflictDoNothing({ target: [productNotificationOutbox.subscriptionId, productNotificationOutbox.sourceType, productNotificationOutbox.sourceId, productNotificationOutbox.revision] });
                }
              }
            }
          }
          await db.update(productNotificationSignals).set({ status: "processed", processedAt: new Date(), lockedUntil: null }).where(and(eq(productNotificationSignals.id, signal.id), eq(productNotificationSignals.status, "processing"), eq(productNotificationSignals.attempts, claimAttempt), eq(productNotificationSignals.lockedUntil, claimUntil)));
          processed += 1;
        } catch {
          const delay = retryDelaysMs[Math.min(claimAttempt - 1, retryDelaysMs.length - 1)] ?? retryDelaysMs[retryDelaysMs.length - 1];
          await db.update(productNotificationSignals).set({ status: claimAttempt >= 3 ? "dead" : "pending", nextAttemptAt: new Date(Date.now() + delay), lockedUntil: null }).where(and(eq(productNotificationSignals.id, signal.id), eq(productNotificationSignals.status, "processing"), eq(productNotificationSignals.attempts, claimAttempt), eq(productNotificationSignals.lockedUntil, claimUntil)));
        }
      }
      return { processed };
    },
    async deliverOutbox(limit = 12) {
      const vapid = getVapidConfig();
      if (!vapid) return { delivered: 0, blocked: true };
      const now = new Date();
      const expiredSubscriptions = await db.select({ id: productNotificationSubscriptions.id, companyId: productNotificationSubscriptions.companyId, userId: productNotificationSubscriptions.userId }).from(productNotificationSubscriptions).where(and(
        eq(productNotificationSubscriptions.status, "active"), lt(productNotificationSubscriptions.expiresAt, now),
      )).limit(100);
      for (const subscription of expiredSubscriptions) await deactivateSubscription(subscription.id, subscription.companyId, subscription.userId, "expired");
      await db.update(productNotificationOutbox).set({ status: "expired", lockedUntil: null }).where(and(inArray(productNotificationOutbox.status, ["pending", "sending"]), lt(productNotificationOutbox.expiresAt, now)));
      const rows = await db.select().from(productNotificationOutbox).where(or(
        and(eq(productNotificationOutbox.status, "pending"), lte(productNotificationOutbox.nextAttemptAt, now)),
        and(eq(productNotificationOutbox.status, "sending"), lt(productNotificationOutbox.lockedUntil, now)),
      )).orderBy(asc(productNotificationOutbox.createdAt)).limit(Math.min(Math.max(limit, 1), 20));
      let delivered = 0;
      for (const row of rows) {
        const wasSending = row.status === "sending";
        const condition = wasSending
          ? and(eq(productNotificationOutbox.id, row.id), eq(productNotificationOutbox.status, "sending"), lt(productNotificationOutbox.lockedUntil, now))
          : and(eq(productNotificationOutbox.id, row.id), eq(productNotificationOutbox.status, "pending"), lte(productNotificationOutbox.nextAttemptAt, now));
        const attempts = row.attempts + 1;
        const claimUntil = new Date(Date.now() + 120_000);
        const [claimed] = await db.update(productNotificationOutbox).set({ status: "sending", attempts, lockedUntil: claimUntil }).where(condition).returning({ id: productNotificationOutbox.id });
        if (!claimed) continue;
        const finishCondition = and(eq(productNotificationOutbox.id, row.id), eq(productNotificationOutbox.status, "sending"), eq(productNotificationOutbox.attempts, attempts), eq(productNotificationOutbox.lockedUntil, claimUntil));
        try {
          const [subscription] = await db.select().from(productNotificationSubscriptions).where(and(
            eq(productNotificationSubscriptions.id, row.subscriptionId), eq(productNotificationSubscriptions.companyId, row.companyId),
            eq(productNotificationSubscriptions.userId, row.userId), eq(productNotificationSubscriptions.status, "active"),
            or(isNull(productNotificationSubscriptions.expiresAt), gt(productNotificationSubscriptions.expiresAt, now)),
          )).limit(1);
          const [preferences] = await db.select().from(productNotificationPreferences).where(and(
            eq(productNotificationPreferences.companyId, row.companyId), eq(productNotificationPreferences.userId, row.userId), eq(productNotificationPreferences.remotePushEnabled, true),
          )).limit(1);
          const [membership] = await db.select({ id: companyMemberships.id }).from(companyMemberships).where(and(
            eq(companyMemberships.companyId, row.companyId), eq(companyMemberships.principalType, "user"), eq(companyMemberships.principalId, row.userId), eq(companyMemberships.status, "active"),
          )).limit(1);
          if (!subscription || !preferences || !membership || !preferences.categories.includes(row.category as ProductNotificationCategory)) {
            await db.update(productNotificationOutbox).set({ status: "dead", lockedUntil: null }).where(finishCondition);
            if (subscription && !membership) await deactivateSubscription(subscription.id, row.companyId, row.userId, "revoked");
            continue;
          }
          if (attempts >= MAX_DELIVERY_ATTEMPTS) {
            await db.update(productNotificationOutbox).set({ status: "dead", lockedUntil: null }).where(finishCondition);
            continue;
          }
          const encryptedMaterial = JSON.parse(subscription.encryptedMaterial) as Awaited<ReturnType<typeof localEncryptedProvider.createSecret>>["material"];
          const stored = JSON.parse(await localEncryptedProvider.resolveVersion({ material: encryptedMaterial, externalRef: null, providerVersionRef: null })) as StoredSubscription;
          const endpoint = validatePushEndpoint(stored.endpoint);
          if (endpoint.hostname !== subscription.endpointHost) throw new Error("Push endpoint identity changed");
          const href = new URL(row.href, "https://local.invalid");
          if (!/^\/[A-Za-z0-9_-]+\/(?:issues\/[^/?#]+|goals\/[^/?#]+|decisions|notifications\/(?:decision|deliverable_review)\/[0-9a-f-]{36})$/i.test(href.pathname)) throw new Error("Invalid notification destination");
          const tag = createHash("sha256").update(`${row.sourceType}:${row.sourceId}:${row.revision}`).digest("base64url").slice(0, 32);
          const payload = JSON.stringify({ category: row.category, href: href.pathname, tag });
          if (Buffer.byteLength(payload, "utf8") > MAX_PUSH_PAYLOAD_BYTES) throw new Error("Push payload exceeds size limit");
          const response = await webPush.sendNotification(stored, payload, {
            vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
            TTL: PUSH_TTL_SECONDS, timeout: PUSH_TIMEOUT_MS, urgency: "normal", topic: tag,
          });
          await db.update(productNotificationOutbox).set({ status: "sent", sentAt: new Date(), lockedUntil: null, lastStatusCode: response.statusCode }).where(finishCondition);
          await db.update(productNotificationSubscriptions).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(productNotificationSubscriptions.id, subscription.id));
          delivered += 1;
        } catch (error) {
          const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : null;
          if (statusCode === 404 || statusCode === 410) {
            await deactivateSubscription(row.subscriptionId, row.companyId, row.userId, "revoked");
            await db.update(productNotificationOutbox).set({ status: "dead", lockedUntil: null, lastStatusCode: statusCode }).where(finishCondition);
            continue;
          }
          const retryable = statusCode === null || statusCode === 408 || statusCode === 429 || statusCode >= 500;
          const retry = retryable && attempts < MAX_DELIVERY_ATTEMPTS && row.expiresAt > now;
          const delay = retryDelaysMs[Math.min(attempts - 1, retryDelaysMs.length - 1)] ?? retryDelaysMs[retryDelaysMs.length - 1];
          await db.update(productNotificationOutbox).set({ status: retry ? "pending" : "dead", lockedUntil: null, lastStatusCode: statusCode, ...(retry ? { nextAttemptAt: new Date(Date.now() + delay) } : {}) }).where(finishCondition);
        }
      }
      return { delivered, blocked: false };
    },
    async updatePreferences(companyId: string, userId: string, input: UpdateProductNotificationPreferencesInput) {
      const categories = [...new Set(input.categories)];
      if (categories.some((category) => !ALL_CATEGORIES.includes(category))) throw forbidden("Invalid notification category scope");
      const now = new Date();
      const [row] = await db.insert(productNotificationPreferences).values({ companyId, userId, categories, browserEnabled: input.browserEnabled, updatedAt: now })
        .onConflictDoUpdate({ target: [productNotificationPreferences.companyId, productNotificationPreferences.userId], set: { categories, browserEnabled: input.browserEnabled, updatedAt: now } })
        .returning();
      return toPreferences(companyId, row);
    },
    snapshot: loadSnapshot,
  };
}

