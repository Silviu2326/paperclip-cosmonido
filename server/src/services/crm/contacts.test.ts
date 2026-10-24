import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { activityLog, companies, contactIdentities, contacts, createDb, customerContacts, customers } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { CrmDuplicateError } from "./common.js";
import { contactService } from "./contacts.js";
import { customerService } from "./customers.js";
import { identityService } from "./identity.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(`Skipping embedded Postgres contact service tests: ${embeddedPostgresSupport.reason ?? "unsupported"}`);
}

describeEmbeddedPostgres("contactService and identityService", () => {
  let db!: ReturnType<typeof createDb>;
  let contactSvc!: ReturnType<typeof contactService>;
  let customerSvc!: ReturnType<typeof customerService>;
  let identity!: ReturnType<typeof identityService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const actor = { actorType: "user" as const, actorId: "board-user" };

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-crm-contacts-");
    db = createDb(tempDb.connectionString);
    contactSvc = contactService(db);
    customerSvc = customerService(db);
    identity = identityService(db);
    await db.execute(sql.raw("CREATE EXTENSION IF NOT EXISTS pg_trgm"));
  }, 240_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(customerContacts);
    await db.delete(contactIdentities);
    await db.delete(contacts);
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
      issuePrefix: `K${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return id;
  }

  it("normalizes email and phone and writes one identity per channel", async () => {
    const companyId = await createCompany();
    const { contact, created } = await contactSvc.create(
      companyId,
      { displayName: "Ana", primaryEmail: " Ana@Acme.COM ", primaryPhone: "612 34 56 78", consents: {} },
      { actor },
    );

    expect(created).toBe(true);
    expect(contact.primaryEmail).toBe("ana@acme.com");
    expect(contact.primaryPhone).toBe("+34612345678");
    const ids = await db.select().from(contactIdentities).where(eq(contactIdentities.contactId, contact.id));
    expect(ids.map((row) => `${row.channel}:${row.identifier}`).sort()).toEqual([
      "email:ana@acme.com",
      "phone:+34612345678",
    ]);
  });

  it("rejects an invalid phone with 422 instead of storing it", async () => {
    const companyId = await createCompany();
    await expect(
      contactSvc.create(companyId, { displayName: "X", primaryPhone: "abc", consents: {} }, { actor }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("reports identity duplicates and refuses them without force", async () => {
    const companyId = await createCompany();
    const first = await contactSvc.create(
      companyId,
      { displayName: "Ana", primaryEmail: "ana@acme.com", consents: {} },
      { actor },
    );

    const candidates = await contactSvc.findDuplicates(companyId, { email: "ANA@acme.com" });
    expect(candidates.map((c) => c.record.id)).toEqual([first.contact.id]);
    expect(candidates[0]!.reasons).toEqual(["email:ana@acme.com"]);

    await expect(
      contactSvc.create(companyId, { displayName: "Ana 2", primaryEmail: "ana@acme.com", consents: {} }, { actor }),
    ).rejects.toBeInstanceOf(CrmDuplicateError);

    const forced = await contactSvc.create(
      companyId,
      { displayName: "Ana 2", primaryEmail: "ana@acme.com", consents: {} },
      { actor, force: true },
    );
    expect(forced.created).toBe(true);
    const owners = await db
      .select()
      .from(contactIdentities)
      .where(eq(contactIdentities.identifier, "ana@acme.com"));
    expect(owners).toHaveLength(1);
    expect(owners[0]!.contactId).toBe(first.contact.id);
  });

  it("resolves an identity only inside its own company and only for active contacts", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const { contact } = await contactSvc.create(
      companyA,
      { displayName: "Luis", primaryPhone: "+34 912 345 678", consents: {} },
      { actor },
    );

    expect((await identity.resolve(companyA, { phone: "912345678" }))?.id).toBe(contact.id);
    expect(await identity.resolve(companyB, { phone: "912345678" })).toBeNull();
    expect(await identity.resolve(companyA, { email: "nadie@acme.com" })).toBeNull();

    await contactSvc.update(companyA, contact.id, { status: "archived" }, { actor });
    expect(await identity.resolve(companyA, { phone: "912345678" })).toBeNull();
  });

  it("links a contact to a customer of its own company only, with one primary contact", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const customer = (await customerSvc.create(companyA, { kind: "organization", name: "Acme", tags: [] }, { actor }))
      .customer;
    const first = (await contactSvc.create(companyA, { displayName: "Uno", consents: {} }, { actor })).contact;
    const second = (await contactSvc.create(companyA, { displayName: "Dos", consents: {} }, { actor })).contact;
    const foreign = (await contactSvc.create(companyB, { displayName: "Ajeno", consents: {} }, { actor })).contact;

    await expect(contactSvc.link(companyB, customer.id, first.id, {}, { actor })).rejects.toMatchObject({ status: 404 });
    await expect(contactSvc.link(companyA, customer.id, foreign.id, {}, { actor })).rejects.toMatchObject({ status: 404 });

    await contactSvc.link(companyA, customer.id, first.id, { isPrimary: true }, { actor });
    await contactSvc.link(companyA, customer.id, second.id, { isPrimary: true, role: "CEO" }, { actor });

    const linked = await contactSvc.listByCustomer(companyA, customer.id);
    expect(linked?.map((row) => [row.contact.displayName, row.isPrimary])).toEqual([
      ["Dos", true],
      ["Uno", false],
    ]);
    expect(await contactSvc.listByCustomer(companyB, customer.id)).toBeNull();

    expect(await contactSvc.unlink(companyB, customer.id, first.id, { actor })).toBe(false);
    expect(await contactSvc.unlink(companyA, customer.id, first.id, { actor })).toBe(true);
  });

  it("lists the customers a contact is linked to, primary first, and hides it from other companies", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const first = await customerSvc.create(companyA, { name: "Zeta SL", kind: "organization", tags: [] }, { actor });
    const second = await customerSvc.create(companyA, { name: "Alfa SL", kind: "organization", tags: [] }, { actor });
    const contact = await contactSvc.create(companyA, { displayName: "Persona", consents: {} }, { actor });
    await contactSvc.link(companyA, first.customer.id, contact.contact.id, { isPrimary: true, role: "CEO" }, { actor });
    await contactSvc.link(companyA, second.customer.id, contact.contact.id, { isPrimary: false }, { actor });

    const linked = await contactSvc.listCustomers(companyA, contact.contact.id);
    expect(linked?.map((row) => [row.customer.name, row.isPrimary, row.role])).toEqual([
      ["Zeta SL", true, "CEO"],
      ["Alfa SL", false, null],
    ]);
    expect(await contactSvc.listCustomers(companyB, contact.contact.id)).toBeNull();
  });

  it("paginates and searches contacts within the company", async () => {
    const companyId = await createCompany();
    for (let index = 0; index < 3; index += 1) {
      await contactSvc.create(companyId, { displayName: `Persona ${index}`, consents: {} }, { actor });
    }
    await contactSvc.create(companyId, { displayName: "Marta", primaryEmail: "marta@x.es", consents: {} }, { actor });

    const first = await contactSvc.list(companyId, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await contactSvc.list(companyId, { limit: 2, cursor: first.nextCursor ?? undefined });
    const ids = new Set([...first.items, ...second.items].map((row) => row.id));
    expect(ids.size).toBe(4);

    const found = await contactSvc.list(companyId, { q: "marta@x", limit: 25 });
    expect(found.items.map((row) => row.displayName)).toEqual(["Marta"]);
  });
});
