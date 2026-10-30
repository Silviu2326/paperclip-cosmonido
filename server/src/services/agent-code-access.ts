import { forbidden } from "../errors.js";

/** Apply after task overrides and secret resolution so neither can widen the saved policy. */
export function applyAgentCodeAccess(metadata: unknown, adapterType: string, config: Record<string, unknown>): void {
  const profile = metadata && typeof metadata === "object" && "profile" in metadata ? (metadata as { profile?: unknown }).profile : null;
  const access = profile && typeof profile === "object" && "codeAdapterAccess" in profile ? (profile as { codeAdapterAccess?: unknown }).codeAdapterAccess : null;
  if (access === null || access === undefined) return;
  if (adapterType !== "codex_local" || !["read_only", "workspace_write"].includes(String(access))) {
    throw forbidden("The configured code filesystem restriction requires the legacy Codex adapter. Clear it or select a supported adapter.", { code: "agent_code_access_unsupported" });
  }
  if (config.command !== undefined && config.command !== "codex") throw forbidden("Code filesystem restrictions require the standard Codex command.", { code: "agent_code_command_unsupported" });
  config.paperclipCodeAccess = access;
  config.engine = "cli"; // ACP cannot apply this filesystem contract.
}
