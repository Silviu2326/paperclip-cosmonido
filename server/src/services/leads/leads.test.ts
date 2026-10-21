import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { companies, createDb, crmActivities, customers, leads } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { leadIntakeService } from "./intake.js";
import { leadService } from "./leads.js";
import { csvImportService } from "./csv-import.js";

const support = await getEmbeddedPostgresTestSupport();
const describeDb = support.supported ? describe : describe.skip;

const actor = { actorType: "user" as const, actorId: "board-user", agentId: null, runId: null };

describeDb("lead intake and conversion", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db!: Db;
  let companyId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-leads-service-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Leads test", issuePrefix: `LT${companyId.slice(0, 6)}` });
  }, 240_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("ingesting the same (source, sourceRef) twice returns the existing lead and writes nothing new", async () => {
    const intake = leadIntakeService(db);
    const input = {
      source: "api" as const,
      sourceRef: `ext-${randomUUID()}`,
      payload: { name: "Ana" },
      identity: { email: "Ana.Dup@Example.com" },
    };
    const first = await intake.ingest(companyId, input);
    const second = await intake.ingest(companyId, input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.lead.id).toBe(first.lead.id);

    const rows = await db.select().from(leads).where(eq(leads.sourceRef, input.sourceRef));
    expect(rows).toHaveLength(1);
    const activity = await db.select().from(crmActivities).where(eq(crmActivities.subjectId, first.lead.id));
    expect(activity).toHaveLength(1);
  });

  it("two leads with the same email share one contact", async () => {
    const intake = leadIntakeService(db);
    const email = `shared-${randomUUID()}@example.com`;
    const a = await intake.ingest(companyId, { source: "api", sourceRef: randomUUID(), payload: { name: "A" }, identity: { email } });
    const b = await intake.ingest(companyId, { source: "webchat", sourceRef: randomUUID(), payload: { name: "B" }, identity: { email } });
    expect(a.lead.contactId).not.toBeNull();
    expect(b.lead.contactId).toBe(a.lead.contactId);
  });

  it("conversion is idempotent per idempotencyKey and rejects another key on a converted lead", async () => {
    const intake = leadIntakeService(db);
    const svc = leadService(db);
    const { lead } = await intake.ingest(companyId, {
      source: "manual",
      sourceRef: randomUUID(),
      payload: { name: "Carla", company: "Acme SL", email: `carla-${randomUUID()}@acme.test` },
      identity: { email: `carla-${randomUUID()}@acme.test` },
    });
    const key = `conv-${randomUUID()}`;

    const first = await svc.convert(lead.id, { createOpportunity: false, idempotencyKey: key }, actor);
    const replay = await svc.convert(lead.id, { createOpportunity: false, idempotencyKey: key }, actor);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.lead.status).toBe("converted");
    expect(replay.lead.customerId).toBe(first.lead.customerId);

    const orgCustomers = await db.select().from(customers).where(eq(customers.id, first.lead.customerId!));
    expect(orgCustomers).toHaveLength(1);
    expect(orgCustomers[0].name).toBe("Acme SL");

    await expect(
      svc.convert(lead.id, { createOpportunity: false, idempotencyKey: `other-${randomUUID()}` }, actor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("re-importing the same CSV imports nothing new", async () => {
    const csv = csvImportService(db);
    const email = `csv-${randomUUID()}@example.com`;
    const body = { csv: `name,email\nDana,${email}\n`, skipDuplicates: true };
    const preview = await csv.preview(companyId, body);
    expect(preview.totals.ready).toBe(1);
    const first = await csv.commit(companyId, body);
    expect(first.imported).toBe(1);
    const second = await csv.commit(companyId, body);
    expect(second.imported).toBe(0);
    const again = await csv.preview(companyId, body);
    expect(again.totals.duplicate).toBe(1);
  });
});
