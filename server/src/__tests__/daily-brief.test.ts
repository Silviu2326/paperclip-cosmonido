import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { companies, costEvents, createDb, dailyBriefPreferences, issues } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { dailyBriefService, localDayWindow, type DailyBriefSendInput } from "../services/daily-brief.js";

const pgSupport = await getEmbeddedPostgresTestSupport();
const describePg = pgSupport.supported ? describe : describe.skip;

describePg("daily brief service", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-daily-brief-");
    db = createDb(tempDb.connectionString);
  }, 90_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  async function company(name: string) {
    return (await db.insert(companies).values({ name, issuePrefix: `DB${randomUUID().slice(0, 6).toUpperCase()}` }).returning())[0]!;
  }

  // Europe/Madrid is UTC+2 in October 2026 (CEST), so the local day 2026-10-21
  // covers [2026-10-20T22:00Z, 2026-10-21T22:00Z).
  const MADRID = "Europe/Madrid";
  const DAY = "2026-10-21";

  it("computes the local day window with DST-aware offsets", () => {
    const { start, end } = localDayWindow(DAY, MADRID);
    expect(start.toISOString()).toBe("2026-10-20T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-21T22:00:00.000Z");
    const mexico = localDayWindow(DAY, "America/Mexico_City");
    expect(mexico.start.toISOString()).toBe("2026-10-21T06:00:00.000Z");
  });

  it("puts issues in done/incoming by window and sums today's and month's cost", async () => {
    const c = await company("Brief compose");
    const insertIssue = (title: string, status: string, createdAt: string, updatedAt: string) =>
      db.insert(issues).values({ companyId: c.id, title, status, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) });
    await insertIssue("Cerrada hoy", "done", "2026-10-19T09:00:00Z", "2026-10-21T10:00:00Z");
    await insertIssue("Cerrada ayer", "done", "2026-10-19T09:00:00Z", "2026-10-20T20:00:00Z");
    await insertIssue("Entrada hoy", "todo", "2026-10-21T21:00:00Z", "2026-10-21T21:00:00Z");
    await insertIssue("Entrada mañana", "todo", "2026-10-21T23:00:00Z", "2026-10-21T23:00:00Z");

    const costs: Array<[string, number]> = [
      ["2026-10-21T09:00:00Z", 500], // today
      ["2026-10-20T23:30:00Z", 300], // today (local 01:30)
      ["2026-10-21T23:30:00Z", 900], // tomorrow local
      ["2026-10-20T21:00:00Z", 200], // yesterday local, same month
      ["2026-10-02T10:00:00Z", 100], // earlier this month
    ];
    for (const [occurredAt, costCents] of costs) {
      await db.insert(costEvents).values({
        companyId: c.id,
        usageKind: "enrichment",
        provider: "test",
        model: "test-model",
        costCents,
        occurredAt: new Date(occurredAt),
      });
    }

    const commitmentsCalls: Array<[string, string]> = [];
    const service = dailyBriefService(db, {
      commitmentsDue: async (companyId, date) => {
        commitmentsCalls.push([companyId, date]);
        return [{ title: "Propuesta a Acme", detail: null, link: null }];
      },
    });
    const brief = await service.compose(c.id, "user-1", { date: DAY, timezone: MADRID });

    expect(brief.date).toBe(DAY);
    expect(brief.done.map((item) => item.title)).toEqual(["Cerrada hoy"]);
    expect(brief.incoming.map((item) => item.title)).toEqual(["Entrada hoy"]);
    expect(brief.needsDecision).toEqual([]);
    expect(brief.commitmentsDue).toEqual([{ title: "Propuesta a Acme", detail: null, link: null }]);
    expect(commitmentsCalls).toEqual([[c.id, DAY]]);
    expect(brief.cost.todayCents).toBe(800);
    expect(brief.cost.monthCents).toBe(1100);
    expect(brief.cost.currency).toBe("USD");
    expect(brief.markdown.startsWith("# Resumen de 2026-10-21")).toBe(true);
    expect(brief.markdown).toContain("## Hecho");
    expect(brief.markdown).toContain("## Entrado");
    expect(brief.markdown).toContain("## Necesita tu decisión");
    expect(brief.markdown).toContain("## Compromisos que vencen");
    expect(brief.markdown).toContain("## Coste");
  });

  it("returns default preference values and upserts on company+user", async () => {
    const c = await company("Brief prefs");
    const service = dailyBriefService(db);
    const defaults = await service.getPreference(c.id, "user-1");
    expect(defaults).toMatchObject({ enabled: false, channel: "email", hourLocal: 8, timezone: "Europe/Madrid", lastSentOn: null });

    const first = await service.updatePreference(c.id, "user-1", { enabled: true, hourLocal: 7 });
    const second = await service.updatePreference(c.id, "user-1", { channel: "whatsapp" });
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ enabled: true, hourLocal: 7, channel: "whatsapp" });
    const rows = await db.select().from(dailyBriefPreferences).where(and(eq(dailyBriefPreferences.companyId, c.id), eq(dailyBriefPreferences.userId, "user-1")));
    expect(rows).toHaveLength(1);
  });

  it("rejects an invalid timezone with 422", async () => {
    const c = await company("Brief tz");
    await expect(dailyBriefService(db).updatePreference(c.id, "user-1", { timezone: "Mars/Olympus" })).rejects.toMatchObject({ status: 422 });
  });

  it("tick sends once per local day at the configured hour", async () => {
    const c = await company("Brief tick");
    const sent: DailyBriefSendInput[] = [];
    const service = dailyBriefService(db, {
      send: async (input) => { sent.push(input); return { delivered: true }; },
    });
    await service.updatePreference(c.id, "user-1", { enabled: true, channel: "email", hourLocal: 8, timezone: MADRID });
    const ownSends = () => sent.filter((input) => input.companyId === c.id);

    // 2026-10-21 06:00Z is 08:00 in Madrid.
    await service.tick(new Date("2026-10-21T06:00:00Z"));
    expect(ownSends()).toHaveLength(1);
    expect(ownSends()[0]).toMatchObject({ userId: "user-1", channel: "email", subject: "Resumen de 2026-10-21" });
    expect(ownSends()[0]!.markdown).toContain("# Resumen de 2026-10-21");

    // Same day, later tick in the same hour: no second send.
    await service.tick(new Date("2026-10-21T06:30:00Z"));
    expect(ownSends()).toHaveLength(1);

    // Next day at the same local hour: sends again.
    await service.tick(new Date("2026-10-22T06:00:00Z"));
    expect(ownSends()).toHaveLength(2);
    expect(ownSends()[1]!.subject).toBe("Resumen de 2026-10-22");

    const [row] = await db.select().from(dailyBriefPreferences).where(eq(dailyBriefPreferences.companyId, c.id));
    expect(row!.lastSentOn).toBe("2026-10-22");
  });

  it("uses the stored timezone, not UTC, to decide the hour", async () => {
    const c = await company("Brief Mexico");
    const sent: DailyBriefSendInput[] = [];
    const service = dailyBriefService(db, {
      send: async (input) => { sent.push(input); return { delivered: true }; },
    });
    await service.updatePreference(c.id, "user-1", { enabled: true, hourLocal: 8, timezone: "America/Mexico_City" });
    const ownSends = () => sent.filter((input) => input.companyId === c.id);

    // UTC 08:00 is 02:00 in Mexico City (UTC-6): not sent.
    await service.tick(new Date("2026-10-21T08:00:00Z"));
    expect(ownSends()).toHaveLength(0);

    // UTC 14:00 is 08:00 in Mexico City: sent.
    await service.tick(new Date("2026-10-21T14:00:00Z"));
    expect(ownSends()).toHaveLength(1);
  });

  it("records a skipped attempt when no delivery channel is configured", async () => {
    const c = await company("Brief no channel");
    const service = dailyBriefService(db);
    await service.updatePreference(c.id, "user-1", { enabled: true, hourLocal: 9, timezone: MADRID });
    // 2026-10-21 07:00Z is 09:00 in Madrid.
    await service.tick(new Date("2026-10-21T07:00:00Z"));
    const [row] = await db.select().from(dailyBriefPreferences).where(eq(dailyBriefPreferences.companyId, c.id));
    expect(row!.lastSentOn).toBe("2026-10-21");
  });
});
