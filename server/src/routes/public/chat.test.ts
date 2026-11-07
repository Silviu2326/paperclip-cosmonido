import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { activityLog, companies, contacts, conversations, createDb, leads } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { conversationMessageService } from "../../services/conversations/messages.js";
import "../../services/conversations/transports/register-webchat.js";
import { webchatService } from "../../services/conversations/transports/webchat.js";
import { publicSurfaceRoutes, signPublicToken } from "../public-surface.js";

const support = await getEmbeddedPostgresTestSupport();
const describeDb = support.supported ? describe : describe.skip;

describeDb("public web chat", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db!: Db;
  let companyId!: string;
  let otherCompanyId!: string;
  let disabledCompanyId!: string;
  let app!: express.Express;

  const base = (cid: string = companyId) => `/api/p/${cid}/chat`;

  async function createSession(cid: string = companyId) {
    const res = await request(app).post(`${base(cid)}/session`).send({});
    expect(res.status).toBe(201);
    return res.body as { sessionId: string; token: string; expiresAt: string };
  }

  const auth = (session: { token: string }) => ({ Authorization: `Bearer ${session.token}` });

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-public-webchat-");
    db = createDb(tempDb.connectionString);
    // TODO(integration): drop this bridge once webchat_settings is exported and migrated (see integration notes).
    await db.execute(sql`
      create table if not exists webchat_settings (
        id uuid primary key default gen_random_uuid(),
        company_id uuid not null references companies(id) on delete cascade,
        active boolean not null default false,
        greeting text,
        brand_color text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint webchat_settings_company_uq unique (company_id)
      )`);

    const makeCompany = async (name: string) => {
      const id = randomUUID();
      await db.insert(companies).values({ id, name, issuePrefix: `WC${id.slice(0, 6).toUpperCase()}` });
      return id;
    };
    companyId = await makeCompany("Chat test");
    otherCompanyId = await makeCompany("Chat other");
    disabledCompanyId = await makeCompany("Chat disabled");

    await db.execute(sql`insert into webchat_settings (company_id, active, greeting, brand_color)
      values (${companyId}, true, 'Hola, en que te ayudamos?', '#0f766e'),
             (${otherCompanyId}, true, null, null),
             (${disabledCompanyId}, false, null, null)`);

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

  it("rejects missing, malformed, tampered, expired and foreign tokens with 401", async () => {
    const mine = await createSession();
    const theirs = await createSession();
    const url = `${base()}/${mine.sessionId}/messages`;

    await request(app).get(url).expect(401);
    await request(app).get(url).set("Authorization", "Bearer nonsense").expect(401);
    await request(app).get(url).set(auth(theirs)).expect(401);
    await request(app)
      .get(url)
      .set("Authorization", `Bearer ${mine.token.slice(0, -2)}xx`)
      .expect(401);

    const expired = signPublicToken(
      { purpose: "webchat-session", companyId, subject: mine.sessionId, ttlSeconds: 60 },
      new Date(Date.now() - 3600_000),
    );
    await request(app).get(url).set("Authorization", `Bearer ${expired}`).expect(401);

    // A token of this session sent to another company is refused.
    await request(app).get(`${base(otherCompanyId)}/${mine.sessionId}/messages`).set(auth(mine)).expect(401);
  });

  it("never shows the messages of another session", async () => {
    const a = await createSession();
    const b = await createSession();

    await request(app)
      .post(`${base()}/${a.sessionId}/messages`)
      .set(auth(a))
      .send({ body: "secret from A", seq: 1 })
      .expect(201);

    const forB = await request(app).get(`${base()}/${b.sessionId}/messages?after=0`).set(auth(b)).expect(200);
    expect(forB.body.messages).toEqual([]);

    await request(app).get(`${base()}/${a.sessionId}/messages`).set(auth(b)).expect(401);

    const forA = await request(app).get(`${base()}/${a.sessionId}/messages?after=0`).set(auth(a)).expect(200);
    expect(forA.body.messages).toHaveLength(1);
    expect(forA.body.messages[0]).toMatchObject({ direction: "inbound", body: "secret from A" });
  });

  it("applies the 30 messages per minute limit per session", async () => {
    const session = await createSession();
    for (let seq = 1; seq <= 30; seq += 1) {
      await request(app)
        .post(`${base()}/${session.sessionId}/messages`)
        .set(auth(session))
        .send({ body: `message ${seq}`, seq })
        .expect(201);
    }
    const blocked = await request(app)
      .post(`${base()}/${session.sessionId}/messages`)
      .set(auth(session))
      .send({ body: "message 31", seq: 31 });
    expect(blocked.status).toBe(429);
  });

  it("stores a repeated seq once and drops honeypot submissions silently", async () => {
    const session = await createSession();
    const url = `${base()}/${session.sessionId}/messages`;
    const first = await request(app).post(url).set(auth(session)).send({ body: "once", seq: 1 }).expect(201);
    const retry = await request(app).post(url).set(auth(session)).send({ body: "once", seq: 1 }).expect(200);
    expect(retry.body.message.id).toBe(first.body.message.id);

    await request(app).post(url).set(auth(session)).send({ body: "bot", seq: 2, website: "http://spam" }).expect(201);
    const page = await request(app).get(`${url}?after=0`).set(auth(session)).expect(200);
    expect(page.body.messages.map((m: { body: string }) => m.body)).toEqual(["once"]);
  });

  it("refuses bodies over 4 KB", async () => {
    const session = await createSession();
    await request(app)
      .post(`${base()}/${session.sessionId}/messages`)
      .set(auth(session))
      .send({ body: "a".repeat(4100), seq: 1 })
      .expect(413);
  });

  it("creates the lead and the contact once, and links them to the conversation", async () => {
    const session = await createSession();
    await request(app)
      .post(`${base()}/${session.sessionId}/messages`)
      .set(auth(session))
      .send({ body: "Quiero un presupuesto", seq: 1 })
      .expect(201);

    // The first message created a lead without contact. Identifying the visitor completes it.
    await request(app)
      .post(`${base()}/${session.sessionId}/identify`)
      .set(auth(session))
      .send({ name: "Ana", email: "Ana.Visitante@Example.com", website: "" })
      .expect(200);
    await request(app)
      .post(`${base()}/${session.sessionId}/identify`)
      .set(auth(session))
      .send({ name: "Ana", email: "ana.visitante@example.com" })
      .expect(200);

    const leadRows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.companyId, companyId), eq(leads.source, "webchat"), eq(leads.sourceRef, session.sessionId)));
    expect(leadRows).toHaveLength(1);
    expect(leadRows[0]!.contactId).not.toBeNull();

    const contactRows = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, companyId), eq(contacts.primaryEmail, "ana.visitante@example.com")));
    expect(contactRows).toHaveLength(1);
    expect(contactRows[0]!.id).toBe(leadRows[0]!.contactId);

    const [thread] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.companyId, companyId), eq(conversations.externalThreadId, session.sessionId)));
    expect(thread!.contactId).toBe(contactRows[0]!.id);
    expect(thread!.leadId).toBe(leadRows[0]!.id);
  });

  it("requires an email or a phone to identify", async () => {
    const session = await createSession();
    await request(app)
      .post(`${base()}/${session.sessionId}/identify`)
      .set(auth(session))
      .send({ name: "Sin contacto" })
      .expect(400);
  });

  it("shows outbound replies to the widget only after they are sent, then marks them delivered", async () => {
    const session = await createSession();
    const url = `${base()}/${session.sessionId}/messages`;
    await request(app).post(url).set(auth(session)).send({ body: "Hola", seq: 1 }).expect(201);

    const [thread] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.companyId, companyId), eq(conversations.externalThreadId, session.sessionId)));
    const messages = conversationMessageService(db);
    const draft = await messages.draft(
      companyId,
      thread!.id,
      { body: "Borrador interno", attachments: [], idempotencyKey: `draft-${randomUUID()}` },
      { userId: "board-user" },
    );

    const beforeSend = await request(app).get(`${url}?after=0`).set(auth(session)).expect(200);
    expect(beforeSend.body.messages.map((m: { body: string }) => m.body)).toEqual(["Hola"]);

    await messages.send(companyId, draft.id, { userId: "board-user" });

    const afterSend = await request(app).get(`${url}?after=0`).set(auth(session)).expect(200);
    const reply = afterSend.body.messages.find((m: { body: string }) => m.body === "Borrador interno");
    expect(reply).toMatchObject({ direction: "outbound", deliveryStatus: "delivered" });

    const again = await request(app).get(`${url}?after=0`).set(auth(session)).expect(200);
    expect(again.body.messages.find((m: { body: string }) => m.body === "Borrador interno").deliveryStatus).toBe("delivered");
  });

  it("hands a web chat conversation to a person, once, with an activity entry", async () => {
    const session = await createSession();
    await request(app)
      .post(`${base()}/${session.sessionId}/messages`)
      .set(auth(session))
      .send({ body: "Necesito hablar con alguien", seq: 1 })
      .expect(201);
    const [thread] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.companyId, companyId), eq(conversations.externalThreadId, session.sessionId)));

    const handed = await webchatService(db).handoff(companyId, thread!.id, { userId: "board-user" });
    expect(handed.status).toBe("waiting_us");
    expect(handed.priority).toBe("high");

    const rows = await db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.companyId, companyId), eq(activityLog.action, "conversation.webchat_handoff")));
    expect(rows).toHaveLength(1);

    const [emailThread] = await db
      .insert(conversations)
      .values({ companyId, channel: "email", status: "open", priority: "normal" })
      .returning();
    await expect(webchatService(db).handoff(companyId, emailThread!.id, { userId: "board-user" })).rejects.toThrow(
      "Only web chat conversations",
    );
  });

  it("serves the widget script with a JavaScript content type and caching headers", async () => {
    const served = await request(app).get(`/api/p/${companyId}/widget.js`).expect(200);
    expect(served.headers["content-type"]).toMatch(/^application\/javascript/);
    expect(served.headers["cache-control"]).toContain("max-age=");
    expect(served.text).toContain("Paperclip web chat widget");

    await request(app).get(`/api/p/${randomUUID()}/widget.js`).expect(404);
  });

  it("returns widget config for an enabled company and disables the chat for the others", async () => {
    const config = await request(app).get(`${base()}/config`).expect(200);
    expect(config.body).toMatchObject({
      enabled: true,
      name: "Chat test",
      greeting: "Hola, en que te ayudamos?",
      brandColor: "#0f766e",
      logoUrl: null,
    });

    const disabled = await request(app).get(`${base(disabledCompanyId)}/config`).expect(200);
    expect(disabled.body).toEqual({ enabled: false });
    await request(app).post(`${base(disabledCompanyId)}/session`).send({}).expect(404);
  });
});
