import { describe, expect, it } from "vitest";
import { autopilotConfigSchema, initialAutopilotState } from "@paperclipai/shared";
import { autopilotPrompt } from "./project-autopilot-prompts.js";

describe("project autonomy assignments", () => {
  const config = autopilotConfigSchema.parse({ objective: "Improve Smart Dental", plannerAgentId: "a16a2689-a19c-44da-9f06-514a3f4aaf57",
    builderAgentId: "a16a2689-a19c-44da-9f06-514a3f4aaf57", reviewerAgentId: "73481ee2-ed51-48c0-942c-53764aadf653" });
  it("sends the full product context and durable result contract to discovery", () => {
    const text = autopilotPrompt({ projectId: "project", projectName: "Smart Dental", config, state: initialAutopilotState(), phase: "planning", workspaces: [] });
    expect(text).toContain("exactly three genuinely project-specific");
    expect(text).toContain("never invented revenue");
    expect(text).toContain("search_api then call_api");
    expect(text).toContain("autopilot/plans");
  });
  it("retains failed-test and production boundaries in implementation and verification", () => {
    const input = { projectId: "project", projectName: "Smart Dental", config, state: initialAutopilotState(), workspaces: [] };
    expect(autopilotPrompt({ ...input, phase: "implementation" })).toContain("Never force-push");
    expect(autopilotPrompt({ ...input, phase: "implementation" })).toContain("Do not claim success when tests fail");
    expect(autopilotPrompt({ ...input, phase: "verification" })).toContain("preview/staging environments only");
    expect(autopilotPrompt({ ...input, phase: "verification" })).toContain("compare each deployment's source commit");
  });
});
