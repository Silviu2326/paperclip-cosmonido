import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { commitments, costEvents, crmActivities, dailyBriefPreferences, decisions, issues } from "@paperclipai/db";
import type { DailyBrief, DailyBriefChannel, DailyBriefItem, DailyBriefPreference } from "@paperclipai/shared";
import type { UpdateDailyBriefPreferenceInput } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { commitmentService as commitmentExtractorService } from "./commitment-extractor.js";

/** Sprint 3 WP13: daily owner brief composed from the same sources as Inicio. */

const SECTION_LIMIT = 10;
/** Open commitments due within this horizon (or already overdue) appear in the brief. */
const COMMITMENT_HORIZON_MS = 48 * 60 * 60 * 1000;
/** externalRef of the crm_activities row that marks an overdue commitment as alerted. */
const OVERDUE_ALERT_REF_PREFIX = "commitment-overdue:";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_TIMEZONE = "Europe/Madrid";

export type DailyBriefSendInput = {
  companyId: string;
  userId: string;
  channel: "email" | "whatsapp";
  subject: string;
  markdown: string;
};
export type DailyBriefSendResult = { delivered: boolean; reason?: string };

export interface DailyBriefDeps {
  send?: (input: DailyBriefSendInput) => Promise<DailyBriefSendResult>;
  /** Supplied by WP5 once decisions are answerable remotely. */
  remoteDecisionUrl?: (companyId: string, decisionId: string) => Promise<string | null>;
  /** Overrides the default query (open commitments due within 48 h, or overdue). */
  commitmentsDue?: (companyId: string, date: string) => Promise<DailyBriefItem[]>;
  /**
   * Called once per overdue commitment by the commitment extractor's alertDue. Every alert also
   * leaves a `system` crm activity on the commitment; that activity is the once-only marker.
   */
  alert?: (companyId: string, commitment: { id: string; dueAt: string }) => Promise<void>;
  now?: () => Date;
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function assertTimezone(timezone: string): void {
  try {
    getFormatter(timezone);
  } catch {
    throw unprocessable("Zona horaria no válida", { timezone });
  }
}

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

/** Wall-clock parts of an instant in the given IANA timezone. */
function localParts(instant: Date, timezone: string): LocalParts {
  const values: Record<string, number> = {};
  for (const part of getFormatter(timezone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour! % 24,
    minute: values.minute!,
    second: values.second!,
  };
}

function localDateKey(instant: Date, timezone: string): string {
  const p = localParts(instant, timezone);
  return formatDateKey(p.year, p.month, p.day);
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

/** Offset in ms between the wall clock of `instant` in `timezone` and UTC. */
function offsetMs(instant: number, timezone: string): number {
  const p = localParts(new Date(instant), timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** UTC instant at which the wall clock in `timezone` reads 00:00 on the given calendar day. */
function zonedMidnight(year: number, month: number, day: number, timezone: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetMs(guess, timezone);
  const second = guess - offsetMs(first, timezone);
  return new Date(second);
}

/** Half-open window [start, end) covering one local calendar day. */
export function localDayWindow(dateKey: string, timezone: string): { start: Date; end: Date } {
  const { year, month, day } = parseDateKey(dateKey);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: zonedMidnight(year, month, day, timezone),
    end: zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timezone),
  };
}

function monthStartFor(dateKey: string, timezone: string): Date {
  const { year, month } = parseDateKey(dateKey);
  return zonedMidnight(year, month, 1, timezone);
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function sectionLines(items: DailyBriefItem[], empty: string, total = items.length): string[] {
  if (items.length === 0) return [empty];
  const lines = items.slice(0, SECTION_LIMIT).map((item) => {
    const detail = item.detail ? ` — ${item.detail}` : "";
    const link = item.link ? ` (${item.link})` : "";
    return `- ${item.title}${detail}${link}`;
  });
  if (total > SECTION_LIMIT) lines.push(`- +${total - SECTION_LIMIT} más`);
  return lines;
}

function renderMarkdown(brief: Omit<DailyBrief, "markdown">): string {
  const decisionItems: DailyBriefItem[] = brief.needsDecision.map((item) => ({
    title: item.title,
    detail: item.detail,
    link: item.remoteUrl ?? item.link,
  }));
  const lines = [
    `# Resumen de ${brief.date}`,
    "",
    "## Hecho",
    ...sectionLines(brief.done, "Nada cerrado hoy."),
    "",
    "## Entrado",
    ...sectionLines(brief.incoming, "Nada nuevo hoy."),
    "",
    "## Necesita tu decisión",
    ...sectionLines(decisionItems, "Nada pendiente de tu decisión."),
    "",
    "## Compromisos que vencen",
    ...sectionLines(brief.commitmentsDue, "Ningún compromiso vence hoy."),
    "",
    "## Coste",
    `- Hoy: ${formatMoney(brief.cost.todayCents, brief.cost.currency)}`,
    `- Este mes: ${formatMoney(brief.cost.monthCents, brief.cost.currency)}`,
  ];
  return lines.join("\n");
}

/** Open commitments of the company that are due within the horizon or already overdue. */
async function commitmentsDueDefault(db: Db, companyId: string, now: Date): Promise<DailyBriefItem[]> {
  const horizon = new Date(now.getTime() + COMMITMENT_HORIZON_MS);
  const rows = await db
    .select({
      id: commitments.id,
      who: commitments.who,
      what: commitments.what,
      dueAt: commitments.dueAt,
      customerId: commitments.customerId,
    })
    .from(commitments)
    .where(
      and(
        eq(commitments.companyId, companyId),
        eq(commitments.status, "open"),
        isNotNull(commitments.dueAt),
        lte(commitments.dueAt, horizon),
      ),
    )
    .orderBy(commitments.dueAt)
    .limit(50);
  return rows.map((row) => {
    const overdue = row.dueAt !== null && row.dueAt.getTime() < now.getTime();
    const owner = row.who === "us" ? "Nuestro compromiso" : "Compromiso del cliente";
    return {
      title: row.what,
      detail: `${owner} · ${overdue ? "vencido" : "vence"} ${row.dueAt?.toISOString() ?? ""}`.trim(),
      link: row.customerId ? `/customers/${row.customerId}` : null,
    };
  });
}

/** Companies with at least one open commitment past its due date. */
async function companiesWithOverdueCommitments(db: Db, now: Date): Promise<string[]> {
  const rows = await db
    .selectDistinct({ companyId: commitments.companyId })
    .from(commitments)
    .where(and(eq(commitments.status, "open"), isNotNull(commitments.dueAt), lte(commitments.dueAt, now)));
  return rows.map((row) => row.companyId);
}

function defaultPreference(companyId: string, userId: string): DailyBriefPreference {
  const now = new Date();
  return {
    id: "",
    companyId,
    userId,
    enabled: false,
    channel: "email",
    hourLocal: 8,
    timezone: DEFAULT_TIMEZONE,
    lastSentOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

function toPreference(row: typeof dailyBriefPreferences.$inferSelect): DailyBriefPreference {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    enabled: row.enabled,
    channel: row.channel as DailyBriefChannel,
    hourLocal: row.hourLocal,
    timezone: row.timezone,
    lastSentOn: row.lastSentOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function dailyBriefService(db: Db, deps: DailyBriefDeps = {}) {
  const now = () => deps.now?.() ?? new Date();

  async function compose(
    companyId: string,
    _userId: string,
    options: { date?: string; timezone: string },
  ): Promise<DailyBrief> {
    assertTimezone(options.timezone);
    const date = options.date ?? localDateKey(now(), options.timezone);
    const { start, end } = localDayWindow(date, options.timezone);
    const monthStart = monthStartFor(date, options.timezone);

    const doneRows = await db
      .select({ id: issues.id, identifier: issues.identifier, title: issues.title })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          eq(issues.status, "done"),
          gte(issues.updatedAt, start),
          lt(issues.updatedAt, end),
        ),
      )
      .orderBy(desc(issues.updatedAt));

    const incomingRows = await db
      .select({ id: issues.id, identifier: issues.identifier, title: issues.title })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          gte(issues.createdAt, start),
          lt(issues.createdAt, end),
        ),
      )
      .orderBy(desc(issues.createdAt));

    const decisionRows = await db
      .select({ id: decisions.id, title: decisions.title })
      .from(decisions)
      .where(and(eq(decisions.companyId, companyId), eq(decisions.status, "open")))
      .orderBy(desc(decisions.createdAt));

    const needsDecision = await Promise.all(
      decisionRows.map(async (row) => {
        let remoteUrl: string | null = null;
        if (deps.remoteDecisionUrl) {
          try {
            remoteUrl = await deps.remoteDecisionUrl(companyId, row.id);
          } catch {
            remoteUrl = null;
          }
        }
        return {
          title: row.title,
          detail: null,
          link: "/decisions",
          decisionId: row.id,
          remoteUrl,
        };
      }),
    );

    const commitmentsDue = deps.commitmentsDue
      ? await deps.commitmentsDue(companyId, date)
      : await commitmentsDueDefault(db, companyId, now());

    const [todayRow] = await db
      .select({ total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision` })
      .from(costEvents)
      .where(
        and(
          eq(costEvents.companyId, companyId),
          gte(costEvents.occurredAt, start),
          lt(costEvents.occurredAt, end),
        ),
      );
    const [monthRow] = await db
      .select({ total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision` })
      .from(costEvents)
      .where(
        and(
          eq(costEvents.companyId, companyId),
          gte(costEvents.occurredAt, monthStart),
          lt(costEvents.occurredAt, end),
        ),
      );

    const toItem = (row: { identifier: string | null; id: string; title: string }): DailyBriefItem => ({
      title: row.title,
      detail: row.identifier,
      link: `/issues/${row.identifier ?? row.id}`,
    });

    const brief = {
      companyId,
      date,
      timezone: options.timezone,
      done: doneRows.map(toItem),
      incoming: incomingRows.map(toItem),
      needsDecision,
      commitmentsDue,
      cost: {
        todayCents: Number(todayRow?.total ?? 0),
        monthCents: Number(monthRow?.total ?? 0),
        // companies has no currency column yet; every company reports in USD.
        currency: DEFAULT_CURRENCY,
      },
    };
    return { ...brief, markdown: renderMarkdown(brief) };
  }

  async function getPreference(companyId: string, userId: string): Promise<DailyBriefPreference> {
    const [row] = await db
      .select()
      .from(dailyBriefPreferences)
      .where(and(eq(dailyBriefPreferences.companyId, companyId), eq(dailyBriefPreferences.userId, userId)))
      .limit(1);
    return row ? toPreference(row) : defaultPreference(companyId, userId);
  }

  async function updatePreference(
    companyId: string,
    userId: string,
    patch: UpdateDailyBriefPreferenceInput,
  ): Promise<DailyBriefPreference> {
    const changes: Partial<typeof dailyBriefPreferences.$inferInsert> = {};
    if (patch.enabled !== undefined) changes.enabled = patch.enabled;
    if (patch.channel !== undefined) changes.channel = patch.channel;
    if (patch.hourLocal !== undefined) changes.hourLocal = patch.hourLocal;
    if (patch.timezone !== undefined) {
      assertTimezone(patch.timezone);
      changes.timezone = patch.timezone;
    }
    const updatedAt = now();
    const [row] = await db
      .insert(dailyBriefPreferences)
      .values({ companyId, userId, ...changes, updatedAt })
      .onConflictDoUpdate({
        target: [dailyBriefPreferences.companyId, dailyBriefPreferences.userId],
        set: { ...changes, updatedAt },
      })
      .returning();
    if (!row) throw new Error("Daily brief preference upsert returned no row");
    return toPreference(row);
  }

  async function sendBrief(
    row: typeof dailyBriefPreferences.$inferSelect,
    localDate: string,
  ): Promise<DailyBriefSendResult> {
    const channel = row.channel as DailyBriefChannel;
    if (channel === "none") return { delivered: false, reason: "channel disabled" };
    if (!deps.send) return { delivered: false, reason: "no delivery channel configured" };
    try {
      const brief = await compose(row.companyId, row.userId, { date: localDate, timezone: row.timezone });
      return await deps.send({
        companyId: row.companyId,
        userId: row.userId,
        channel,
        subject: `Resumen de ${localDate}`,
        markdown: brief.markdown,
      });
    } catch (err) {
      return { delivered: false, reason: err instanceof Error ? err.message : "send failed" };
    }
  }

  /**
   * Alerts once per overdue open commitment of one company, through the commitment extractor
   * (`deps.alert`), and records a `system` crm activity on each alerted commitment. The activity
   * is the marker: a commitment that already has it is not alerted again.
   */
  async function alertOverdueCommitments(companyId: string, at: Date): Promise<number> {
    const overdue = await db
      .select({ id: commitments.id, what: commitments.what, dueAt: commitments.dueAt })
      .from(commitments)
      .where(
        and(
          eq(commitments.companyId, companyId),
          eq(commitments.status, "open"),
          isNotNull(commitments.dueAt),
          lte(commitments.dueAt, at),
        ),
      )
      .limit(200);
    if (overdue.length === 0) return 0;

    const refFor = (id: string) => `${OVERDUE_ALERT_REF_PREFIX}${id}`;
    const markers = await db
      .select({ externalRef: crmActivities.externalRef })
      .from(crmActivities)
      .where(and(eq(crmActivities.companyId, companyId), inArray(crmActivities.externalRef, overdue.map((row) => refFor(row.id)))));
    const alerted = new Set(markers.map((marker) => marker.externalRef));

    const candidates = overdue.map((row) => ({
      id: row.id,
      dueAt: row.dueAt,
      alertedAt: alerted.has(refFor(row.id)) ? at : null,
    }));
    const extractor = commitmentExtractorService(db, { alert: deps.alert });
    const dueIds = await extractor.alertDue(companyId, candidates, at);

    for (const id of dueIds) {
      const row = overdue.find((item) => item.id === id);
      await db.insert(crmActivities).values({
        companyId,
        subjectKind: "commitment",
        subjectId: id,
        kind: "system",
        actorUserId: null,
        actorAgentId: null,
        summary: `Compromiso vencido: ${row?.what ?? id}`,
        payload: { dueAt: row?.dueAt?.toISOString() ?? null },
        externalRef: refFor(id),
        occurredAt: at,
      });
    }
    return dueIds.length;
  }

  /**
   * Called every ~10 minutes by the scheduler. Sends at most one brief per
   * preference per local day: lastSentOn is claimed before sending, so a
   * failed attempt is not retried the same day.
   */
  async function tick(at: Date = now()): Promise<{ attempted: number; delivered: number }> {
    for (const companyId of await companiesWithOverdueCommitments(db, at)) {
      try {
        await alertOverdueCommitments(companyId, at);
      } catch (error) {
        logger.warn({ err: error, companyId }, "overdue commitment alerts failed");
      }
    }

    const rows = await db
      .select()
      .from(dailyBriefPreferences)
      .where(
        and(
          eq(dailyBriefPreferences.enabled, true),
          sql`${dailyBriefPreferences.channel} <> 'none'`,
        ),
      );

    let attempted = 0;
    let delivered = 0;
    for (const row of rows) {
      let localDate: string;
      let hour: number;
      try {
        const parts = localParts(at, row.timezone);
        hour = parts.hour;
        localDate = formatDateKey(parts.year, parts.month, parts.day);
      } catch {
        continue;
      }
      if (hour !== row.hourLocal) continue;
      if (row.lastSentOn === localDate) continue;

      // Claim the day first so concurrent ticks cannot send twice.
      const claimed = await db
        .update(dailyBriefPreferences)
        .set({ lastSentOn: localDate, updatedAt: at })
        .where(
          and(
            eq(dailyBriefPreferences.id, row.id),
            or(isNull(dailyBriefPreferences.lastSentOn), sql`${dailyBriefPreferences.lastSentOn} <> ${localDate}`),
          ),
        )
        .returning({ id: dailyBriefPreferences.id });
      if (claimed.length === 0) continue;

      attempted += 1;
      const result = await sendBrief(row, localDate);
      if (result.delivered) delivered += 1;

      await logActivity(db, {
        companyId: row.companyId,
        actorType: "system",
        actorId: "daily-brief",
        action: result.delivered ? "daily_brief.sent" : "daily_brief.skipped",
        entityType: "daily_brief_preference",
        entityId: row.id,
        details: {
          userId: row.userId,
          date: localDate,
          channel: row.channel,
          ...(result.reason ? { reason: result.reason } : {}),
        },
      });
    }
    return { attempted, delivered };
  }

  return { compose, getPreference, updatePreference, tick, alertOverdueCommitments };
}

export type DailyBriefService = ReturnType<typeof dailyBriefService>;
