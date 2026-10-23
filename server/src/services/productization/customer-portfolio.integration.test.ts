import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  commitments,
  companies,
  costEvents,
  createDb,
  customers,
  deliverableReviews,
  goals,
  projects,
  type Db,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
  type EmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { customerPortfolioService } from "./customer-portfolio.js";

const postgresSupport = await getEmbeddedPostgresTestSupport();
const describeWithPostgres = postgresSupport.supported ? describe : describe.skip;

if (!postgresSupport.supported) {
  console.warn(
    `Skipping customer portfolio integration tests: ${postgresSupport.reason ?? "embedded PostgreSQL is unavailable"}`,
  );
}

describeWithPostgres("customer portfolio (real PostgreSQL)", () => {
  let db: Db;
  let temporary: EmbeddedPostgresTestDatabase | undefined;

  beforeAll(async () => {
    temporary = await startEmbeddedPostgresTestDatabase("paperclip-customer-portfolio-");
    db = createDb(temporary.connectionString);
  }, 90_000);

  afterAll(async () => {
    await db?.$client.end();
    await temporary?.cleanup();
  });

  async function company(name: string) {
    const companyId = randomUUID();
    const [created] = await db.insert(companies).values({
      id: companyId,
      name,
      issuePrefix: `CP${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    }).returning();
    return created!;
  }

  async function customer(companyId: string, name: string, status: "active" | "archived" = "active") {
    const [created] = await db.insert(customers).values({ companyId, name, status }).returning();
    return created!;
  }

  it("keeps rows company-scoped and rejects a cursor owned by another company", async () => {
    const firstCompany = await company("Portfolio owner");
    const otherCompany = await company("Other company");
    const ownCustomer = await customer(firstCompany.id, "Visible customer");
    const foreignCustomer = await customer(otherCompany.id, "Private customer");
    const service = customerPortfolioService(db);

    const result = await service.read(firstCompany.id, 30);
    expect(result.items.map((item) => item.customerId)).toEqual([ownCustomer.id]);
    await expect(service.read(firstCompany.id, 30, foreignCustomer.id)).rejects.toMatchObject({ status: 404 });
  });

  it("groups both cost windows and work attention in SQL, excluding unpriced events from USD totals", async () => {
    const owner = await company("Portfolio metrics");
    const account = await customer(owner.id, "Acme");
    const [project] = await db.insert(projects).values({
      companyId: owner.id,
      customerId: account.id,
      name: "Acme delivery",
    }).returning();
    const [assignment] = await db.insert(goals).values({
      companyId: owner.id,
      projectId: project!.id,
      title: "Prepare the launch",
      kind: "assignment",
      status: "active",
    }).returning();
    const now = Date.now();
    const event = (occurredAt: Date, costCents: number, costStatus: "reported" | "unpriced") => ({
      companyId: owner.id,
      goalId: assignment!.id,
      usageKind: "decision",
      provider: "fixture",
      model: "fixture-model",
      costCents,
      costStatus,
      occurredAt,
    });
    await db.insert(costEvents).values([
      event(new Date(now - 5 * 86_400_000), 240, "reported"),
      event(new Date(now - 35 * 86_400_000), 510, "reported"),
      event(new Date(now - 8 * 86_400_000), 0, "unpriced"),
    ]);
    await db.insert(deliverableReviews).values({
      companyId: owner.id,
      goalId: assignment!.id,
      targetKind: "work_product",
      targetId: randomUUID(),
      targetVersion: "v1",
      state: "pending",
    });
    await db.insert(commitments).values({
      companyId: owner.id,
      customerId: account.id,
      who: "us",
      what: "Send the revised launch plan",
      status: "open",
      dueAt: new Date(now - 86_400_000),
    });

    const calls = { select: 0, execute: 0 };
    const countedDb = new Proxy(db, {
      get(target, property) {
        const original = Reflect.get(target, property, target);
        if (property !== "select" && property !== "execute") return original;
        return (...args: unknown[]) => {
          calls[property] += 1;
          return Reflect.apply(original, target, args);
        };
      },
    }) as Db;

    const [result] = (await customerPortfolioService(countedDb).read(owner.id, 30)).items;
    expect(result).toMatchObject({
      customerId: account.id,
      activeAssignments: 1,
      pendingReviews: 1,
      overdueCommitments: 1,
      currentCostCents: 240,
      previousCostCents: 510,
      unpricedEvents: 1,
      state: "needs_attention",
    });
    // A populated page uses one customer-page select and one grouped metrics query.
    expect(calls).toEqual({ select: 1, execute: 1 });
  });

  it("returns stable 25-customer pages with one grouped metrics query per page", async () => {
    const owner = await company("Portfolio pagination");
    await db.insert(customers).values(Array.from({ length: 26 }, (_, index) => ({
      companyId: owner.id,
      name: `Customer ${index + 1}`,
    })));
    await customer(owner.id, "Archived customer", "archived");

    const calls = { select: 0, execute: 0 };
    const countedDb = new Proxy(db, {
      get(target, property) {
        const original = Reflect.get(target, property, target);
        if (property !== "select" && property !== "execute") return original;
        return (...args: unknown[]) => {
          calls[property] += 1;
          return Reflect.apply(original, target, args);
        };
      },
    }) as Db;
    const service = customerPortfolioService(countedDb);

    const firstPage = await service.read(owner.id, 30);
    expect(firstPage.items).toHaveLength(25);
    expect(firstPage.nextCursor).toBe(firstPage.items.at(-1)?.customerId);
    expect(calls).toEqual({ select: 1, execute: 1 });

    calls.select = 0;
    calls.execute = 0;
    const secondPage = await service.read(owner.id, 30, firstPage.nextCursor!);
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(calls).toEqual({ select: 2, execute: 1 });
  });
});
