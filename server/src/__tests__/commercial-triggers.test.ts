import { describe, expect, it, vi } from "vitest";
import type { CommercialTriggerEvent } from "@paperclipai/shared";
import { COMMERCIAL_ROUTINE_ORIGIN_KINDS, commercialTriggers, type WaitingPlaybookRun } from "../services/commercial-triggers.js";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const SUBJECT_ID = "00000000-0000-4000-8000-000000000002";

function event(overrides: Partial<CommercialTriggerEvent>): CommercialTriggerEvent {
  return {
    kind: "no_reply",
    companyId: COMPANY_ID,
    subjectKind: "opportunity",
    subjectId: SUBJECT_ID,
    occurredAt: "2026-10-22T10:00:00.000Z",
    ...overrides,
  };
}

function deps(runs: WaitingPlaybookRun[], options: { unsubscribed?: boolean } = {}) {
  return {
    findWaitingRuns: vi.fn(async () => runs),
    advanceRun: vi.fn(async () => undefined),
    stopSequence: vi.fn(async () => undefined),
    isUnsubscribed: vi.fn(async () => options.unsubscribed ?? false),
  };
}

// The service keeps `db` for future lookups only; these unit tests never touch it.
const db = {} as Parameters<typeof commercialTriggers>[0];

describe("commercial triggers", () => {
  it("advances every waiting run on no_reply", async () => {
    const runs = [
      { id: "run-a", currentStepKind: "wait", nextActionAt: null },
      { id: "run-b", currentStepKind: "follow_up", nextActionAt: null },
    ];
    const d = deps(runs);
    const result = await commercialTriggers(db, d).handle(event({ kind: "no_reply" }));
    expect(d.findWaitingRuns).toHaveBeenCalledWith(COMPANY_ID, "opportunity", SUBJECT_ID);
    expect(d.advanceRun).toHaveBeenCalledTimes(2);
    expect(d.advanceRun).toHaveBeenCalledWith("run-a", "no_reply");
    expect(d.advanceRun).toHaveBeenCalledWith("run-b", "no_reply");
    expect(d.stopSequence).not.toHaveBeenCalled();
    expect(result).toEqual({ advanced: 2, stopped: 0 });
  });

  it("stops follow_up sequences when the contact replies", async () => {
    const runs = [
      { id: "follow", currentStepKind: "follow_up", nextActionAt: "2026-10-23T10:00:00.000Z" },
      { id: "wait", currentStepKind: "wait_reply", nextActionAt: null },
    ];
    const d = deps(runs);
    const result = await commercialTriggers(db, d).handle(event({
      kind: "stage_changed",
      payload: { reason: "contact_replied" },
    }));
    expect(d.stopSequence).toHaveBeenCalledTimes(1);
    expect(d.stopSequence).toHaveBeenCalledWith("follow", "contact_replied");
    expect(d.advanceRun).toHaveBeenCalledTimes(1);
    expect(d.advanceRun).toHaveBeenCalledWith("wait", "contact_replied");
    expect(result).toEqual({ advanced: 1, stopped: 1 });
  });

  it("treats a stage change without the contact_replied reason as a plain advance", async () => {
    const d = deps([{ id: "follow", currentStepKind: "follow_up", nextActionAt: null }]);
    await commercialTriggers(db, d).handle(event({ kind: "stage_changed", payload: { reason: "manual" } }));
    expect(d.stopSequence).not.toHaveBeenCalled();
    expect(d.advanceRun).toHaveBeenCalledWith("follow", "stage_changed");
  });

  it("stops every sequence and advances nothing when the contact unsubscribed", async () => {
    const runs = [
      { id: "run-a", currentStepKind: "follow_up", nextActionAt: null },
      { id: "run-b", currentStepKind: "wait", nextActionAt: null },
    ];
    const d = deps(runs, { unsubscribed: true });
    const result = await commercialTriggers(db, d).handle(event({ kind: "commitment_due_soon", subjectKind: "commitment" }));
    expect(d.advanceRun).not.toHaveBeenCalled();
    expect(d.stopSequence).toHaveBeenCalledWith("run-a", "unsubscribed");
    expect(d.stopSequence).toHaveBeenCalledWith("run-b", "unsubscribed");
    expect(result).toEqual({ advanced: 0, stopped: 2 });
  });

  it("does nothing when no run is waiting on the subject", async () => {
    const d = deps([]);
    const result = await commercialTriggers(db, d).handle(event({ kind: "meeting_held" }));
    expect(d.advanceRun).not.toHaveBeenCalled();
    expect(d.isUnsubscribed).not.toHaveBeenCalled();
    expect(result).toEqual({ advanced: 0, stopped: 0 });
  });

  it("exposes the routine origin kinds that WP1 must accept", () => {
    expect(COMMERCIAL_ROUTINE_ORIGIN_KINDS).toEqual(["opportunity", "conversation", "commitment"]);
  });
});
