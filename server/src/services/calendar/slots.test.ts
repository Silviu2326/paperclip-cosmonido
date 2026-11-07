import { describe, expect, it } from "vitest";
import { candidateSlots, freeSlots, isSlotFree, parseWeeklyHours, zonedWallTimeToEpoch } from "./slots.js";

const MIN = 60_000;
// 2026-10-26 is a Monday.
const MON = Date.UTC(2026, 9, 26);

describe("calendar slot math", () => {
  it("generates slots that fit inside the weekly windows", () => {
    const slots = candidateSlots({
      from: MON,
      to: MON + 24 * 60 * MIN,
      timeZone: "UTC",
      weeklyHours: [{ weekday: 1, start: "09:00", end: "12:00" }],
      durationMinutes: 60,
    });
    expect(slots.map((slot) => new Date(slot.start).getUTCHours())).toEqual([9, 10, 11]);
  });

  it("keeps the buffer on both sides of a provider busy interval", () => {
    const candidates = candidateSlots({
      from: MON,
      to: MON + 24 * 60 * MIN,
      timeZone: "UTC",
      weeklyHours: [{ weekday: 1, start: "09:00", end: "12:00" }],
      durationMinutes: 30,
    });
    const busy = [{ start: MON + 10 * 60 * MIN, end: MON + 11 * 60 * MIN }];
    const free = freeSlots({ candidates, busy, bufferMinutes: 15, now: MON }).map((slot) => new Date(slot.start).getUTCHours() * 60 + new Date(slot.start).getUTCMinutes());
    // 9:00 is clear of 9:45; 9:30 touches the buffer; 11:00 is inside 11:15; 11:30 is clear.
    expect(free).toEqual([9 * 60, 11 * 60 + 30]);
  });

  it("without buffer, adjacent meetings are allowed", () => {
    const candidates = candidateSlots({
      from: MON,
      to: MON + 24 * 60 * MIN,
      timeZone: "UTC",
      weeklyHours: [{ weekday: 1, start: "09:00", end: "12:00" }],
      durationMinutes: 60,
    });
    const busy = [{ start: MON + 10 * 60 * MIN, end: MON + 11 * 60 * MIN }];
    const free = freeSlots({ candidates, busy, bufferMinutes: 0, now: MON });
    expect(free.map((slot) => new Date(slot.start).getUTCHours())).toEqual([9, 11]);
  });

  it("drops slots that start before now", () => {
    const candidates = candidateSlots({
      from: MON,
      to: MON + 24 * 60 * MIN,
      timeZone: "UTC",
      weeklyHours: [{ weekday: 1, start: "09:00", end: "10:00" }],
      durationMinutes: 30,
    });
    const free = freeSlots({ candidates, busy: [], bufferMinutes: 0, now: MON + 9 * 60 * MIN + 15 * MIN });
    expect(free.map((slot) => new Date(slot.start).getUTCMinutes())).toEqual([30]);
  });

  it("checks one exact slot against busy time and buffer", () => {
    const interval = { start: MON + 13 * 60 * MIN, end: MON + 14 * 60 * MIN };
    const busy = [{ start: MON + 14 * 60 * MIN, end: MON + 15 * 60 * MIN }];
    expect(isSlotFree({ interval, busy, bufferMinutes: 0, now: MON })).toBe(true);
    expect(isSlotFree({ interval, busy, bufferMinutes: 5, now: MON })).toBe(false);
  });

  it("applies the booking time zone, including the CET offset in late October", () => {
    const slots = candidateSlots({
      from: MON,
      to: MON + 24 * 60 * MIN,
      timeZone: "Europe/Madrid",
      weeklyHours: [{ weekday: 1, start: "09:00", end: "10:00" }],
      durationMinutes: 60,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toBe(Date.UTC(2026, 9, 26, 8, 0));
    expect(zonedWallTimeToEpoch(2026, 10, 26, 9 * 60, "Europe/Madrid")).toBe(Date.UTC(2026, 9, 26, 8, 0));
  });

  it("rejects ranges longer than 31 days", () => {
    expect(() =>
      candidateSlots({
        from: MON,
        to: MON + 40 * 24 * 60 * MIN,
        timeZone: "UTC",
        weeklyHours: [{ weekday: 1, start: "09:00", end: "10:00" }],
        durationMinutes: 30,
      }),
    ).toThrow(/31 days/);
  });

  it("validates weekly hours", () => {
    expect(() => parseWeeklyHours([{ weekday: 1, start: "10:00", end: "09:00" }])).toThrow(/end must be after start/);
    expect(() => parseWeeklyHours([{ weekday: 8, start: "09:00", end: "10:00" }])).toThrow(/weekday/);
    expect(parseWeeklyHours([{ weekday: 2, start: "09:00", end: "10:00" }])).toEqual([{ weekday: 2, start: "09:00", end: "10:00" }]);
  });
});
