import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb } from "@paperclipai/db";
import type { OfficeLayout } from "@paperclipai/shared";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { officeRoutes } from "../routes/office.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(`Skipping office route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`);
}

type Db = ReturnType<typeof createDb>;

function createApp(db: Db, actor: Express.Request["actor"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", officeRoutes(db));
  app.use(errorHandler);
  return app;
}

describeEmbeddedPostgres("office layout routes", () => {
  let db!: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-office-routes-");
    db = createDb(tempDb.connectionString);
  }, 120_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany(label: string) {
    const nonce = randomUUID().slice(0, 8);
    const [company] = await db
      .insert(companies)
      .values({ name: `Office ${label} ${nonce}`, issuePrefix: `OF${nonce.slice(0, 4).toUpperCase()}${label.slice(0, 1).toUpperCase()}` })
      .returning();
    return company!;
  }

  function boardFor(companyId: string, userId = "office-board-user"): Express.Request["actor"] {
    return {
      type: "board",
      userId,
      source: "session",
      companyIds: [companyId],
      isInstanceAdmin: false,
      memberships: [{ companyId, membershipRole: "admin", status: "active" }],
    } as unknown as Express.Request["actor"];
  }

  it("returns the default layout from live agents, saves, resets and rejects bad input", async () => {
    const company = await seedCompany("main");
    const [active, paused] = await db
      .insert(agents)
      .values([
        { companyId: company.id, name: "Ada", role: "general", status: "idle", adapterType: "process", adapterConfig: {}, runtimeConfig: {} },
        { companyId: company.id, name: "Bob", role: "general", status: "paused", adapterType: "process", adapterConfig: {}, runtimeConfig: {} },
      ])
      .returning();
    await db.insert(agents).values({ companyId: company.id, name: "Gone", role: "general", status: "terminated", adapterType: "process", adapterConfig: {}, runtimeConfig: {} });

    const app = createApp(db, boardFor(company.id));
    const path = `/api/companies/${company.id}/office/layout`;

    // Default: built from non-terminated agents, not persisted.
    const initial = await request(app).get(path);
    expect(initial.status, JSON.stringify(initial.body)).toBe(200);
    expect(initial.body.source).toBe("default");
    const deskAgents = (initial.body.layout.objects as Array<{ kind: string; agentId?: string }>)
      .filter(object => object.kind === "desk")
      .map(object => object.agentId)
      .sort();
    expect(deskAgents).toEqual([active!.id, paused!.id].sort());

    // Save a custom layout.
    const custom: OfficeLayout = {
      version: 1,
      cols: 12,
      rows: 8,
      floor: "carpet_blue",
      wall: "plaster",
      objects: [
        { id: "plant_1", kind: "plant", x: 1, y: 2 },
        { id: "desk_ada", kind: "desk", x: 4, y: 4, agentId: active!.id, label: "Ada" },
      ],
    };
    const saved = await request(app).put(path).send({ layout: custom });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toEqual({ layout: custom, source: "saved" });

    const fetched = await request(app).get(path);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual({ layout: custom, source: "saved" });

    // Invalid layouts are rejected with a client error and nothing is overwritten.
    const invalid = await request(app).put(path).send({ layout: { ...custom, version: 2 } });
    expect(invalid.status).toBeGreaterThanOrEqual(400);
    expect(invalid.status).toBeLessThan(500);
    const unchanged = await request(app).get(path);
    expect(unchanged.body.source).toBe("saved");

    // Reset deletes the saved row and returns the default again.
    const reset = await request(app).delete(path);
    expect(reset.status, JSON.stringify(reset.body)).toBe(200);
    expect(reset.body.source).toBe("default");
    const afterReset = await request(app).get(path);
    expect(afterReset.body.source).toBe("default");
  });

  it("keeps layouts per user within a company", async () => {
    const company = await seedCompany("users");
    const path = `/api/companies/${company.id}/office/layout`;
    const layout: OfficeLayout = { version: 1, cols: 10, rows: 7, floor: "wood", wall: "plaster", objects: [{ id: "p", kind: "plant", x: 0, y: 1 }] };
    await request(createApp(db, boardFor(company.id, "user-one"))).put(path).send({ layout });
    const other = await request(createApp(db, boardFor(company.id, "user-two"))).get(path);
    expect(other.body.source).toBe("default");
  });

  it("refuses agent actors and board users of another company", async () => {
    const company = await seedCompany("guard");
    const otherCompany = await seedCompany("other");
    const [agent] = await db
      .insert(agents)
      .values({ companyId: company.id, name: "Worker", role: "general", status: "idle", adapterType: "process", adapterConfig: {}, runtimeConfig: {} })
      .returning();
    const path = `/api/companies/${company.id}/office/layout`;
    const layout: OfficeLayout = { version: 1, cols: 10, rows: 7, floor: "wood", wall: "plaster", objects: [] };

    const agentActor = {
      type: "agent",
      agentId: agent!.id,
      companyId: company.id,
      keyScope: undefined,
      source: "agent_key",
    } as unknown as Express.Request["actor"];
    const agentApp = createApp(db, agentActor);
    expect((await request(agentApp).get(path)).status).toBe(403);
    expect((await request(agentApp).put(path).send({ layout })).status).toBe(403);
    expect((await request(agentApp).delete(path)).status).toBe(403);
    expect((await request(agentApp).post(`${path.replace("/layout", "")}/design-chat`).send({ message: "hi", layout, history: [] })).status).toBe(403);

    const strangerApp = createApp(db, boardFor(otherCompany.id));
    expect((await request(strangerApp).get(path)).status).toBe(403);
    expect((await request(strangerApp).put(path).send({ layout })).status).toBe(403);
  });

  it("answers design-chat with no_ai_connection when the company has no Anthropic default", async () => {
    const company = await seedCompany("chat");
    const app = createApp(db, boardFor(company.id));
    const layout: OfficeLayout = { version: 1, cols: 10, rows: 7, floor: "wood", wall: "plaster", objects: [] };
    const response = await request(app)
      .post(`/api/companies/${company.id}/office/design-chat`)
      .send({ message: "pon una planta", layout, history: [] });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error).toBe("no_ai_connection");
  });

  it("rejects malformed design-chat bodies before any provider call", async () => {
    const company = await seedCompany("badchat");
    const app = createApp(db, boardFor(company.id));
    const layout: OfficeLayout = { version: 1, cols: 10, rows: 7, floor: "wood", wall: "plaster", objects: [] };
    const empty = await request(app).post(`/api/companies/${company.id}/office/design-chat`).send({ message: "", layout, history: [] });
    expect(empty.status).toBe(400);
    const tooMany = await request(app).post(`/api/companies/${company.id}/office/design-chat`)
      .send({ message: "x", layout, history: Array.from({ length: 21 }, () => ({ role: "user", content: "y" })) });
    expect(tooMany.status).toBe(400);
  });
});
