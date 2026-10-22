import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { activityLog, companies, createDb, customers } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { decodeCursor, encodeCursor, likeContains } from "./common.js";
import { CrmDuplicateError } from "./common.js";
import { customerService } from "./customers.js";
import { identityKeys, normalizeDomain, normalizeOrganizationName } from "./identity.js";

// Pure rules first: they run without a database.
describe("CRM normalization and cursors", () => {
  it("normalizes domains from URLs and bare hosts", () => {
    expect(normalizeDomain("https://www.Acme.com/contacto")).toBe("acme.com");
    expect(normalizeDomain(" acme.es. ")).toBe("acme.es");
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("bad domain.com")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
  });

  it("normalizes organization names, dropping accents, punctuation and legal suffixes", () => {
    expect(normalizeOrganizationName("Acme, S.L.")).toBe("acme");
    expect(normalizeOrganizationName("ACME")).toBe("acme");
    expect(normalizeOrganizationName("Peluquería Óptima SA")).toBe("peluqueria optima");
    expect(normalizeOrganizationName("Ltd")).toBe("ltd");
    expect(normalizeOrganizationName("  ")).toBeNull();
    expect(normalizeOrganizationName(null)).toBeNull();
  });

  it("builds identity lookup keys in priority order, phones as phone and whatsapp", () => {
    expect(identityKeys({ email: " Ana@Acme.com ", phone: "612 34 56 78" })).toEqual([
      { channel: "email", identifier: "ana@acme.com" },
      { channel: "phone", identifier: "+34612345678" },
      { channel: "whatsapp", identifier: "+34612345678" },
    ]);
    expect(identityKeys({ channel: "telegram", handle: "@Bot_User" })).toEqual([
      { channel: "telegram", identifier: "bot_user" },
    ]);
    expect(identityKeys({})).toEqual([]);
  });

  it("escapes LIKE wildcards in search text", () => {
    expect(likeContains("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });

  it("round-trips cursors and rejects malformed ones", () => {
    const position = { updatedAt: new Date("2026-10-01T10:00:00.000Z"), id: randomUUID() };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
    expect(decodeCursor(undefined)).toBeNull();
    expect(() => decodeCursor("%%%not-a-cursor")).toThrow();
    expect(() => decodeCursor(Buffer.from(JSON.stringify({ u: "x", i: "y" })).toString("base64url"))).toThrow();
  });
});

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(`Skipping embedded Postgres customer service tests: ${embeddedPostgresSupport.reason ?? "unsupported"}`);
}

describeEmbeddedPostgres("customerService", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof customerService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const actor = { actorType: "user" as const, actorId: "board-user" };

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-crm-customers-");
    db = createDb(tempDb.connectionString);
    svc = customerService(db);
    await db.execute(sql.raw("CREATE EXTENSION IF NOT EXISTS pg_trgm"));
  }, 240_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(customers);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function createCompany() {
    const id = randomUUID();
    await db.insert(companies).values({
      id,
      name: "Test co",
      issuePrefix: `C${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return id;
  }

  it("scopes lists to the company", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    await svc.create(companyA, { kind: "organization", name: "Solo en A", tags: [] }, { actor });
    await svc.create(companyB, { kind: "organization", name: "Solo en B", tags: [] }, { actor });

    const page = await svc.list(companyA, { limit: 25 });
    expect(page.items.map((row) => row.name)).toEqual(["Solo en A"]);
    expect(page.items.every((row) => row.companyId === companyA)).toBe(true);
  });

  it("paginates by cursor without repeating or skipping rows", async () => {
    const companyId = await createCompany();
    for (let index = 0; index < 5; index += 1) {
      await svc.create(companyId, { kind: "organization", name: `Cliente ${index}`, tags: [] }, { actor });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await svc.list(companyId, { limit: 2, cursor });
      seen.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it("searches by name and domain and filters by status", async () => {
    const companyId = await createCompany();
    const acme = await svc.create(companyId, { kind: "organization", name: "Acme Iberia", domain: "acme.es", tags: [] }, { actor });
    await svc.create(companyId, { kind: "organization", name: "Globex", tags: [] }, { actor });
    await svc.update(companyId, acme.customer.id, { status: "archived" }, { actor });

    expect((await svc.list(companyId, { q: "iberia", limit: 25 })).items).toHaveLength(1);
    expect((await svc.list(companyId, { q: "acme.es", limit: 25 })).items).toHaveLength(1);
    expect((await svc.list(companyId, { status: "archived", limit: 25 })).items).toHaveLength(1);
    expect((await svc.list(companyId, { status: "active", limit: 25 })).items.map((row) => row.name)).toEqual(["Globex"]);
    await expect(svc.list(companyId, { status: "nope", limit: 25 })).rejects.toThrow();
  });

  it("returns possible duplicates and refuses to create them without force", async () => {
    const companyId = await createCompany();
    const first = await svc.create(companyId, { kind: "organization", name: "Acme, S.L.", domain: "acme.com", tags: [] }, { actor });

    const candidates = await svc.findDuplicates(companyId, { name: "ACME", domain: "https://www.acme.com" });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.record.id).toBe(first.customer.id);
    expect(candidates[0]!.reasons.sort()).toEqual(["domain", "name"]);

    await expect(
      svc.create(companyId, { kind: "organization", name: "ACME", domain: "acme.com", tags: [] }, { actor }),
    ).rejects.toBeInstanceOf(CrmDuplicateError);
    expect(await db.select().from(customers).where(eq(customers.companyId, companyId))).toHaveLength(1);

    const forced = await svc.create(
      companyId,
      { kind: "organization", name: "ACME", domain: "acme.com", tags: [] },
      { actor, force: true },
    );
    expect(forced.created).toBe(true);
    expect(await db.select().from(customers).where(eq(customers.companyId, companyId))).toHaveLength(2);
  });

  it("does not report duplicates from another company", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    await svc.create(companyA, { kind: "organization", name: "Acme", domain: "acme.com", tags: [] }, { actor });
    expect(await svc.findDuplicates(companyB, { name: "Acme", domain: "acme.com" })).toEqual([]);
  });

  it("treats a repeated idempotency key as the same customer", async () => {
    const companyId = await createCompany();
    const key = `idem-${randomUUID()}`;
    const first = await svc.create(companyId, { kind: "person", name: "Ana", tags: [], idempotencyKey: key }, { actor });
    const second = await svc.create(companyId, { kind: "person", name: "Ana", tags: [], idempotencyKey: key }, { actor });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.customer.id).toBe(first.customer.id);
    expect(await db.select().from(customers).where(eq(customers.companyId, companyId))).toHaveLength(1);
    const logged = await db.select().from(activityLog).where(eq(activityLog.companyId, companyId));
    expect(logged.map((row) => row.action)).toEqual(["customer.created"]);
    expect(logged[0]!.details).toMatchObject({ idempotencyKey: key });
  });

  it("archives with a timestamp and logs customer.archived", async () => {
    const companyId = await createCompany();
    const created = await svc.create(companyId, { kind: "organization", name: "Viejo", tags: [] }, { actor });
    const archived = await svc.update(companyId, created.customer.id, { status: "archived" }, { actor });

    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).not.toBeNull();
    const actions = (await db.select().from(activityLog).where(eq(activityLog.entityId, created.customer.id))).map(
      (row) => row.action,
    );
    expect(actions).toContain("customer.archived");
  });

  it("does not update a customer from another company", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const created = await svc.create(companyA, { kind: "organization", name: "Propio", tags: [] }, { actor });
    const result = await svc.update(companyB, created.customer.id, { name: "Robado" }, { actor });
    expect(result).toBeNull();
    expect((await svc.getById(created.customer.id))?.name).toBe("Propio");
  });
});
