import { describe, expect, it } from "vitest";
import { applyAgentCodeAccess } from "./agent-code-access.js";
describe("saved code access policy", () => {
  it("preserves existing configuration unless an explicit policy was saved", () => {
    const config = { engine: "acp" };
    applyAgentCodeAccess({}, "codex_local", config);
    expect(config).toEqual({ engine: "acp" });
  });
  it("applies the selected policy after overrides and selects the enforcing CLI engine", () => {
    const config: Record<string, unknown> = { engine: "acp", paperclipCodeAccess: "workspace_write" };
    applyAgentCodeAccess({ profile: { codeAdapterAccess: "read_only" } }, "codex_local", config);
    expect(config).toMatchObject({ engine: "cli", paperclipCodeAccess: "read_only" });
    const cleared = { engine: "acp" };
    applyAgentCodeAccess({ profile: { codeAdapterAccess: null } }, "codex_local", cleared);
    expect(cleared.engine).toBe("acp");
  });
  it("fails closed after changing to an adapter or custom command that cannot enforce the policy", () => {
    const metadata = { profile: { codeAdapterAccess: "read_only" } };
    expect(() => applyAgentCodeAccess(metadata, "http", {})).toThrow();
    expect(() => applyAgentCodeAccess(metadata, "codex_local", { command: "custom-wrapper" })).toThrow();
  });
});
