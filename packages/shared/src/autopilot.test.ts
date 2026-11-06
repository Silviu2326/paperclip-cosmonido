import { describe, expect, it } from "vitest";
import { autopilotCapacity, autopilotConfigSchema, autopilotPlansSchema, autopilotReportSchema, validateAutopilotVerification } from "./autopilot.js";

const workspaceId = "76e8914d-fec3-4ae9-902f-f438193de8b6";
const issueId = "b83d6570-31b9-4bdc-b358-63881c1bb964";
const config = autopilotConfigSchema.parse({ objective: "Improve the product", plannerAgentId: issueId, builderAgentId: issueId,
  reviewerAgentId: workspaceId, deploymentTargets: [{ provider: "vercel", projectWorkspaceId: workspaceId, projectRef: "prj_frontend", environment: "preview" }] });
const implementation = autopilotReportSchema.parse({ issueId, outcome: "passed", summary: "Implemented", evidence: [{ label: "Build", detail: "Passed" }],
  commits: [{ workspaceId, sha: "a".repeat(40), branch: "autopilot/feature" }] });
const verification = autopilotReportSchema.parse({ issueId, outcome: "passed", summary: "Verified", evidence: [{ label: "Health", detail: "HTTP 200 and browser flow passed" }],
  deployments: [{ provider: "vercel", workspaceId, projectRef: "prj_frontend", environment: "preview", deploymentRef: "dpl_1", sourceSha: "a".repeat(40), status: "ready", health: "passed", url: "https://preview.example.com" }] });

describe("autopilot capacity and evidence contracts", () => {
  it("waits for the last blocking reset when a short and weekly window are both exhausted", () => {
    const result = autopilotCapacity([{ usedPercent: 100, resetsAt: "2030-01-01T05:00:00Z" }, { usedPercent: 95, resetsAt: "2030-01-07T00:00:00Z" }], 15, Date.parse("2030-01-01T00:00:00Z"));
    expect(result).toEqual({ available: false, retryAt: "2030-01-07T00:00:00.000Z" });
  });
  it("does not invent a reset for missing or expired reset metadata", () => {
    expect(autopilotCapacity([{ usedPercent: 100, resetsAt: null }], 0)).toEqual({ available: false, retryAt: null });
    expect(autopilotCapacity([{ usedPercent: 100, resetsAt: "2000-01-01T00:00:00Z" }], 0).available).toBe(false);
  });
  it("honors the reserve at its boundary and permits unused capacity", () => {
    expect(autopilotCapacity([{ usedPercent: 85, resetsAt: null }], 15).available).toBe(false);
    expect(autopilotCapacity([{ usedPercent: 84, resetsAt: null }], 15).available).toBe(true);
  });
  it("accepts verification only for the matching source commit and configured deployment target", () => {
    expect(validateAutopilotVerification(config, implementation, verification)).toEqual([]);
    expect(validateAutopilotVerification(config, implementation, { ...verification, deployments: [{ ...verification.deployments[0]!, sourceSha: "b".repeat(40) }] })).toHaveLength(1);
  });
  it.each(["projectRef", "environment", "serviceRef"] as const)("rejects a deployment from a different %s", key => {
    expect(validateAutopilotVerification(config, implementation, { ...verification, deployments: [{ ...verification.deployments[0]!, [key]: "another-target" }] })).toHaveLength(1);
  });
  it("rejects a reachable URL without successful health and ready build evidence", () => {
    for (const patch of [{ health: "not_checked" as const }, { status: "building" as const }]) {
      expect(validateAutopilotVerification(config, implementation, { ...verification, deployments: [{ ...verification.deployments[0]!, ...patch }] })).toHaveLength(1);
    }
    expect(validateAutopilotVerification(config, undefined, verification)).toHaveLength(1);
  });
  it("allows a blocked report to retain incomplete evidence without claiming verification", () => {
    expect(validateAutopilotVerification(config, undefined, { ...verification, outcome: "blocked", deployments: [] })).toEqual([]);
  });
  it("rejects duplicate plan tiers even when exactly three plans were supplied", () => {
    const plan = { id: "essential", title: "Compare images", problem: "No comparison", benefit: "Faster explanation", evidence: ["Inspected screen"], assumptions: [], effort: "Small", risk: "low", acceptanceCriteria: ["Comparison works"], steps: ["Build comparison"], workspaceIds: [workspaceId] };
    expect(autopilotPlansSchema.safeParse({ issueId, summary: "Found opportunities", recommendedPlanId: "essential", plans: [plan, plan, plan] }).success).toBe(false);
    expect(autopilotPlansSchema.safeParse({ issueId, summary: "Found opportunities", recommendedPlanId: "essential", plans: [plan, { ...plan, id: "balanced" }, { ...plan, id: "ambitious" }] }).success).toBe(true);
  });
  it("rejects evidence URLs that carry credentials and incomplete commit identifiers", () => {
    expect(autopilotReportSchema.safeParse({ ...verification, evidence: [{ label: "Evidence", detail: "Link", url: "https://token@example.com/" }] }).success).toBe(false);
    expect(autopilotReportSchema.safeParse({ ...implementation, commits: [{ ...implementation.commits[0]!, sha: "abcdef0" }] }).success).toBe(false);
  });
});
