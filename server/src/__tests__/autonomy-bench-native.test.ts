import { describe, expect, it } from "vitest";
import type { AutonomyBenchCase } from "@paperclipai/shared";
import { buildAutonomyBenchJudgeRequest } from "../services/autonomy-bench-native.js";

describe("native autonomy bench judge request", () => {
  it("keeps the reference on the judge side and asks for all rubric dimensions", () => {
    const testCase: AutonomyBenchCase = {
      caseId: "case-1", actionType: "message", source: "fixture", sourceId: "fixture-1",
      transcript: [{ role: "contact", text: "Please help." }],
      reference: { text: "reference reply", proposedAction: "escalate" },
    };
    const request = buildAutonomyBenchJudgeRequest(testCase, "candidate reply");
    expect(JSON.stringify(request.state)).toContain("reference reply");
    expect(JSON.stringify(request.state)).toContain("candidate reply");
    expect(Object.keys(request.questions).sort()).toEqual(["appropriateness", "facts", "proposed_action", "tone"]);
    expect(Object.values(request.questions).every((question) => question.type === "score")).toBe(true);
  });

  it("rejects oversized judge inputs before a provider invocation", () => {
    const testCase: AutonomyBenchCase = {
      caseId: "case-2", actionType: "email", source: "fixture",
      transcript: [{ role: "contact", text: "x".repeat(30_000) }], reference: { text: "reference" },
    };
    expect(() => buildAutonomyBenchJudgeRequest(testCase, "candidate")).toThrow("autonomy_bench_judge_input_too_large");
  });
});
