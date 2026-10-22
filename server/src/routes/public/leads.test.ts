import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { companies, createDb, leads } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { publicSurfaceRoutes } from "../public-surface.js";

const support = await getEmbeddedPostgresTestSupport();
const describeDb = support.supported ? describe : describe.skip;

describeDb("public lead form", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db!: Db;
  let companyId!: string;
  let app!: express.Express;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-public-leads-");
    db = createDb(tempDb.connectionString);
    // TODO(integration): drop this bridge once lead_forms is exported and migrated (see integration notes).
    await db.execute(sql`
      create table if not exists lead_forms (
        id uuid primary key default gen_random_uuid(),
        company_id uuid not null references companies(id) on delete cascade,
        slug text not null,
        name text not null,
        fields jsonb not null default '[]'::jsonb,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint lead_forms_company_slug_uq unique (company_id, slug)
      )`);
    companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Form test", issuePrefix: `FT${companyId.slice(0, 6)}` });
    await db.execute(sql`insert into lead_forms (company_id, slug, name, fields, active)
      values (${companyId}, 'contact', 'Contact', '["name","email","phone"]'::jsonb, true),
             (${companyId}, 'closed', 'Closed', '[]'::jsonb, false)`);

    app = express();
    app.use(express.json());
    app.use("/api/p", publicSurfaceRoutes(db));
    app.use((err: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err.status ?? 500).json({ error: err.message });
    });
  }, 240_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  const url = () => `/api/p/${companyId}/form/contact`;

  it("stores a valid JSON submission as a form lead", async () => {
    const ref = randomUUID();
    const res = await request(app).post(url()).send({ name: "Eva", email: "Eva@Example.com", clientId: ref });
    expect(res.status).toBe(201);
    const rows = await db.select().from(leads).where(sql`${leads.companyId} = ${companyId} and ${leads.sourceRef} = ${"client:" + ref}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("form");
  });

  it("accepts form-urlencoded bodies", async () => {
    const ref = randomUUID();
    const res = await request(app)
      .post(url())
      .type("form")
      .send(`name=Gil&phone=612345678&clientId=${ref}`);
    expect(res.status).toBe(201);
    const rows = await db.select().from(leads).where(sql`${leads.companyId} = ${companyId} and ${leads.sourceRef} = ${"client:" + ref}`);
    expect(rows).toHaveLength(1);
  });

  it("silently drops a submission that fills the honeypot", async () => {
    const ref = randomUUID();
    const res = await request(app).post(url()).send({ name: "Bot", email: "bot@example.com", website: "http://spam", clientId: ref });
    expect(res.status).toBe(201);
    const rows = await db.select().from(leads).where(sql`${leads.companyId} = ${companyId} and ${leads.sourceRef} = ${"client:" + ref}`);
    expect(rows).toHaveLength(0);
  });

  it("rejects a submission without a usable email or phone", async () => {
    const res = await request(app).post(url()).send({ name: "Nadie", email: "no-es-correo" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown or inactive forms", async () => {
    expect((await request(app).post(`/api/p/${companyId}/form/closed`).send({ name: "X", email: "x@example.com" })).status).toBe(404);
    expect((await request(app).post(`/api/p/${companyId}/form/missing`).send({ name: "X", email: "x@example.com" })).status).toBe(404);
  });

  it("applies the per-IP form rate limit (20 per minute)", async () => {
    // A fresh app has fresh limiter buckets, so earlier requests in this file do not count.
    const limited = express();
    limited.use(express.json());
    limited.use("/api/p", publicSurfaceRoutes(db));
    limited.use((err: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err.status ?? 500).json({ error: err.message });
    });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await request(limited).post(url()).send({ name: `R${i}`, email: `r${i}@example.com`, clientId: `rl-${i}-${randomUUID()}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
