import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authUsers,
  accountDeletions,
  companies,
  companyRetention,
  createDb,
  productAccounts,
  type Db,
} from "@paperclipai/db";
import { productizationSecurityService } from "./security.js";
import { createAccountDeletionStripeProvider } from "./account-deletion-stripe.js";
import { createAccountDeletionWorker } from "./account-deletion.js";
import { startEmbeddedPostgresTestDatabase, type EmbeddedPostgresTestDatabase } from "../../__tests__/helpers/embedded-postgres.js";

let tempDb: EmbeddedPostgresTestDatabase | null = null;
let db: Db;
let userId = "";
let otherUserId = "";
let companyId = "";

async function insertUser(id: string) {
  const now = new Date();
  await db.insert(authUsers).values({ id, name: id, email: `${id}@example.test`, emailVerified: true, createdAt: now, updatedAt: now });
}

async function insertAccount(ownerId: string, customerId: string | null = null) {
  return db.insert(productAccounts).values({ ownerUserId: ownerId, name: "Test commercial account", planId: "test", access: "active", stripeCustomerId: customerId })
    .returning().then((rows) => rows[0]!);
}

function pauseAfterFirstSelect(base: Db, selected: () => void, resume: Promise<void>): Db {
  let paused = false;
  const wrap = (builder: object): object => new Proxy(builder, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "then" && typeof value === "function") {
        return (resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) => value.call(target, async (result: unknown) => {
          if (!paused) {
            paused = true;
            selected();
            await resume;
          }
          return resolve ? resolve(result) : result;
        }, reject);
      }
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const next = value.apply(target, args);
          return next && typeof next === "object" ? wrap(next) : next;
        };
      }
      return value;
    },
  });
  return new Proxy(base as object, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "select" && typeof value === "function") return (...args: unknown[]) => wrap(value.apply(target, args));
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Db;
}

describe("privacy and deletion lifecycle fences", () => {
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-productization-security-");
    db = createDb(tempDb.connectionString);
  }, 90_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    await tempDb?.cleanup();
  });

  beforeEach(async () => {
    userId = `owner-${randomUUID()}`;
    otherUserId = `other-${randomUUID()}`;
    await insertUser(userId);
    await insertUser(otherUserId);
    const [company] = await db.insert(companies).values({ name: `Security ${randomUUID()}`, issuePrefix: `SEC${randomUUID().slice(0, 5).toUpperCase()}` }).returning();
    companyId = company!.id;
    vi.unstubAllGlobals();
  });

  it("rejects a retention preview after the policy revision changes", async () => {
    const service = productizationSecurityService(db);
    const previewInput = { conversations: { enabled: true, days: 90 }, files: { enabled: false, days: 30 } };
    const preview = await service.previewRetention(companyId, userId, previewInput);
    await db.insert(companyRetention).values({ companyId, revision: 1, conversationsEnabled: false, conversationsDays: 365, filesEnabled: false, filesDays: 30 });

    await expect(service.setRetention(companyId, userId, { ...previewInput, revision: 0, previewId: preview.id }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("allows only the commercial account owner to request or cancel during cooling", async () => {
    const account = await insertAccount(userId);
    const service = productizationSecurityService(db);
    await expect(service.requestAccountDeletion(otherUserId, account.id, "DELETE COMMERCIAL ACCOUNT"))
      .rejects.toMatchObject({ status: 404 });
    const deletion = await service.requestAccountDeletion(userId, account.id, "DELETE COMMERCIAL ACCOUNT");
    expect(deletion.status).toBe("cooling");
    expect(deletion.coolingEndsAt.getTime()).toBeGreaterThan(Date.now());
    await expect(service.cancelAccountDeletion(otherUserId, deletion.id)).rejects.toMatchObject({ status: 409 });
    expect((await service.cancelAccountDeletion(userId, deletion.id)).status).toBe("cancelled");
  });

  it("does not revive a terminal deletion changed after candidate read but before claim", async () => {
    const account = await insertAccount(userId);
    const deletion = await productizationSecurityService(db).requestAccountDeletion(userId, account.id, "DELETE COMMERCIAL ACCOUNT");
    await db.update(accountDeletions).set({ coolingEndsAt: new Date(0), nextAttemptAt: new Date(0) }).where(eq(accountDeletions.id, deletion.id));

    let release!: () => void;
    let reached!: () => void;
    const resume = new Promise<void>((resolve) => { release = resolve; });
    const selected = new Promise<void>((resolve) => { reached = resolve; });
    const worker = createAccountDeletionWorker(pauseAfterFirstSelect(db, reached, resume));
    const ticking = worker.tick();
    await selected;
    await db.update(accountDeletions).set({ status: "completed", step: "done", completedAt: new Date(), nextAttemptAt: null, leaseOwner: null, leaseExpiresAt: null }).where(eq(accountDeletions.id, deletion.id));
    release();

    await expect(ticking).resolves.toEqual({ status: "idle" });
    const [persisted] = await db.select().from(accountDeletions).where(eq(accountDeletions.id, deletion.id)).limit(1);
    expect(persisted).toMatchObject({ status: "completed", step: "done", attempts: 0, leaseOwner: null, leaseExpiresAt: null });
  });

  it.each(["GET", "DELETE"] as const)("keeps deletion unconfirmed when Stripe returns 404 to customer %s", async (missingMethod) => {
    const customerId = `cus_${randomUUID().replaceAll("-", "")}`;
    const account = await insertAccount(userId, customerId);
    const provider = createAccountDeletionStripeProvider(db, { STRIPE_SECRET_KEY: "sk_test_stub" })!;
    const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (String(input).includes("/v1/subscriptions?")) return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });
      if (method === missingMethod) return new Response(JSON.stringify({ error: { code: "resource_missing" } }), { status: 404 });
      return new Response(JSON.stringify({ id: customerId, metadata: { productAccountId: account.id } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchStub);
    await expect(provider.deleteCustomer(customerId, account.id)).rejects.toThrow("did not confirm");
    if (missingMethod === "GET") expect(fetchStub.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    const [persisted] = await db.select().from(productAccounts).where(eq(productAccounts.id, account.id));
    expect(persisted?.stripeCustomerId).toBe(customerId);
  });

  it("blocks deletion when Stripe returns an active subscription and never sends customer DELETE", async () => {
    const customerId = `cus_${randomUUID().replaceAll("-", "")}`;
    const account = await insertAccount(userId, customerId);
    const provider = createAccountDeletionStripeProvider(db, { STRIPE_SECRET_KEY: "sk_test_stub" });
    expect(provider).toBeDefined();
    const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      void init;
      if (url.includes("/v1/customers/")) return new Response(JSON.stringify({ id: customerId, metadata: { productAccountId: account.id } }), { status: 200 });
      return new Response(JSON.stringify({ data: [{ id: "sub_stub", customer: customerId, status: "active" }], has_more: false }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchStub);

    await expect(provider!.deleteCustomer(customerId, account.id)).resolves.toEqual({ activeSubscription: true });
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    const [persisted] = await db.select().from(productAccounts).where(eq(productAccounts.id, account.id)).limit(1);
    expect(persisted?.stripeCustomerId).toBe(customerId);
  });
});
