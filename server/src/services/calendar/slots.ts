import type { BookingWeeklyHour } from "@paperclipai/db";

// Pure slot math for bookings. No I/O: availability is computed from the weekly
// hours of a booking type, its buffer, and the busy intervals reported by the
// provider (freeBusy) plus the events already held locally.

export interface TimeInterval {
  /** Epoch milliseconds, inclusive. */
  start: number;
  /** Epoch milliseconds, exclusive. */
  end: number;
}

const MINUTE_MS = 60_000;
const MAX_RANGE_DAYS = 31;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseLocalTime(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid local time "${value}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Offset in minutes of `timeZone` from UTC at the given instant (east positive). */
function zoneOffsetMinutes(epochMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / MINUTE_MS);
}

/** Converts a wall-clock date and minute-of-day in `timeZone` to epoch milliseconds. */
export function zonedWallTimeToEpoch(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): number {
  const wall = Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  const firstOffset = zoneOffsetMinutes(wall, timeZone);
  const guess = wall - firstOffset * MINUTE_MS;
  const secondOffset = zoneOffsetMinutes(guess, timeZone);
  return secondOffset === firstOffset ? guess : wall - secondOffset * MINUTE_MS;
}

/** Calendar date (year, month, day) that `epochMs` falls on in `timeZone`. */
function zonedDate(epochMs: number, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new Error(`Unknown time zone "${timeZone}"`);
  }
}

/**
 * Candidate slots of `durationMinutes` inside the weekly windows, between
 * `from` and `to` (inclusive start, exclusive end). Each window is walked from
 * its start in steps of the duration; a slot must fit entirely in the window.
 */
export function candidateSlots(input: {
  from: number;
  to: number;
  timeZone: string;
  weeklyHours: BookingWeeklyHour[];
  durationMinutes: number;
}): TimeInterval[] {
  if (input.to <= input.from) return [];
  const rangeDays = (input.to - input.from) / (24 * 60 * MINUTE_MS);
  if (rangeDays > MAX_RANGE_DAYS) throw new Error(`Availability range cannot exceed ${MAX_RANGE_DAYS} days`);

  const durationMs = input.durationMinutes * MINUTE_MS;
  const slots: TimeInterval[] = [];
  const startDay = zonedDate(input.from, input.timeZone);
  // Walk calendar days in UTC arithmetic; the zone is applied per window below.
  const firstUtcDay = Date.UTC(startDay.year, startDay.month - 1, startDay.day);
  const lastDayPlusOne = firstUtcDay + (Math.ceil(rangeDays) + 2) * 24 * 60 * MINUTE_MS;

  for (let dayMs = firstUtcDay; dayMs <= lastDayPlusOne; dayMs += 24 * 60 * MINUTE_MS) {
    const day = new Date(dayMs);
    const weekday = day.getUTCDay();
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth() + 1;
    const date = day.getUTCDate();
    for (const window of input.weeklyHours) {
      if (window.weekday !== weekday) continue;
      const windowStart = zonedWallTimeToEpoch(year, month, date, parseLocalTime(window.start), input.timeZone);
      const windowEnd = zonedWallTimeToEpoch(year, month, date, parseLocalTime(window.end), input.timeZone);
      for (let start = windowStart; start + durationMs <= windowEnd; start += durationMs) {
        const end = start + durationMs;
        if (start >= input.from && end <= input.to) slots.push({ start, end });
      }
    }
  }
  return slots.sort((a, b) => a.start - b.start);
}

/**
 * Keeps the candidates that start at or after `now` and leave `bufferMinutes`
 * of free time before and after every busy interval (freeBusy from the
 * provider and events already held locally).
 */
export function freeSlots(input: {
  candidates: TimeInterval[];
  busy: TimeInterval[];
  bufferMinutes: number;
  now: number;
}): TimeInterval[] {
  const buffer = input.bufferMinutes * MINUTE_MS;
  const blocked = input.busy.map((interval) => ({
    start: interval.start - buffer,
    end: interval.end + buffer,
  }));
  return input.candidates.filter((candidate) => {
    if (candidate.start < input.now) return false;
    return blocked.every((interval) => !(candidate.start < interval.end && candidate.end > interval.start));
  });
}

/** True when `interval` is one of the free slots, i.e. still bookable. */
export function isSlotFree(input: {
  interval: TimeInterval;
  busy: TimeInterval[];
  bufferMinutes: number;
  now: number;
}): boolean {
  return freeSlots({ candidates: [input.interval], ...input }).length === 1;
}

export function parseWeeklyHours(value: unknown): BookingWeeklyHour[] {
  if (!Array.isArray(value)) throw new Error("weeklyHours must be an array");
  return value.map((entry) => {
    const window = entry as Partial<BookingWeeklyHour>;
    if (!Number.isInteger(window.weekday) || window.weekday! < 0 || window.weekday! > 6) {
      throw new Error("weekday must be an integer between 0 and 6");
    }
    if (typeof window.start !== "string" || typeof window.end !== "string") {
      throw new Error("start and end must be HH:mm strings");
    }
    if (parseLocalTime(window.end) <= parseLocalTime(window.start)) {
      throw new Error("end must be after start");
    }
    return { weekday: window.weekday!, start: window.start, end: window.end };
  });
}
