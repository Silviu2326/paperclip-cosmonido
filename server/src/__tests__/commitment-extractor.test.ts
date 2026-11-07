import { describe, expect, it } from "vitest";
import {
  dueAlerts,
  fingerprintCommitment,
  normalizeCandidates,
  normalizeCommitmentText,
} from "../services/commitment-extractor.js";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

describe("commitment fingerprints", () => {
  it("stays stable across whitespace, case and trailing punctuation", () => {
    const base = fingerprintCommitment(CONVERSATION_ID, "us", "Send the revised proposal");
    expect(fingerprintCommitment(CONVERSATION_ID, "us", "  send   the REVISED proposal. ")).toBe(base);
    expect(fingerprintCommitment(CONVERSATION_ID, "us", "Send the revised proposal!!")).toBe(base);
  });

  it("differs by conversation and by who", () => {
    const base = fingerprintCommitment(CONVERSATION_ID, "us", "Send the proposal");
    expect(fingerprintCommitment("00000000-0000-4000-8000-000000000002", "us", "Send the proposal")).not.toBe(base);
    expect(fingerprintCommitment(CONVERSATION_ID, "them", "Send the proposal")).not.toBe(base);
  });

  it("normalizes text by lowercasing, collapsing whitespace and stripping trailing punctuation", () => {
    expect(normalizeCommitmentText("  Call   Ana Tomorrow ... ")).toBe("call ana tomorrow");
  });
});

describe("normalizeCandidates", () => {
  it("collapses duplicates by fingerprint, keeps the most confident one and maps dueAt to ISO", () => {
    const due = new Date("2026-10-25T10:00:00.000Z");
    const candidates = normalizeCandidates(CONVERSATION_ID, {
      conversationId: CONVERSATION_ID,
      candidates: [
        { who: "us", what: "Send the proposal", dueAt: null, confidence: 0.5, evidence: "maybe" },
        { who: "us", what: "send  the proposal.", dueAt: due, confidence: 0.9, evidence: "I will send it Friday" },
        { who: "them", what: "Share the budget", dueAt: null, confidence: 0.7, evidence: null },
      ],
    });
    expect(candidates).toHaveLength(2);
    const ours = candidates.find((candidate) => candidate.who === "us")!;
    expect(ours.confidence).toBe(0.9);
    expect(ours.dueAt).toBe("2026-10-25T10:00:00.000Z");
    expect(ours.evidence).toBe("I will send it Friday");
    expect(candidates.find((candidate) => candidate.who === "them")!.dueAt).toBeNull();
  });
});

describe("dueAlerts", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");

  it("returns only past-due commitments that have not alerted", () => {
    const ids = dueAlerts([
      { id: "past", dueAt: "2026-10-21T09:00:00.000Z", alertedAt: null },
      { id: "future", dueAt: "2026-10-23T09:00:00.000Z" },
      { id: "no-date", dueAt: null },
      { id: "already", dueAt: "2026-10-20T09:00:00.000Z", alertedAt: "2026-10-21T09:05:00.000Z" },
    ], now);
    expect(ids).toEqual(["past"]);
  });

  it("alerts exactly once when the caller records alertedAt", () => {
    const commitments: Array<{ id: string; dueAt: string; alertedAt: string | null }> = [
      { id: "due", dueAt: "2026-10-22T11:00:00.000Z", alertedAt: null },
    ];
    expect(dueAlerts(commitments, now)).toEqual(["due"]);
    commitments[0]!.alertedAt = now.toISOString();
    expect(dueAlerts(commitments, new Date("2026-10-23T00:00:00.000Z"))).toEqual([]);
  });
});
