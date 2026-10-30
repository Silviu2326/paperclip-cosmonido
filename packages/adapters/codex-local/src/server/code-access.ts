import { runAdapterExecutionTargetProcess } from "@paperclipai/adapter-utils/execution-target";

/** A bounded, model-free probe in the actual execution target. Never falls back to bypass mode. */
export async function probeCodexFilesystemSandbox(input: {
  runId: string;
  target: Parameters<typeof runAdapterExecutionTargetProcess>[1];
  command: string;
  cwd: string;
  env: Record<string, string>;
  access: unknown;
}): Promise<{ available: boolean; detail: string | null }> {
  if (input.access !== "read_only" && input.access !== "workspace_write") return { available: true, detail: null };
  try {
    const result = await runAdapterExecutionTargetProcess(input.runId, input.target, input.command, [
      "sandbox", "-c", `sandbox_mode="${input.access === "read_only" ? "read-only" : "workspace-write"}"`,
      "-c", "sandbox_workspace_write.writable_roots=[]", "-c", "sandbox_workspace_write.exclude_tmpdir_env_var=true", "-c", "sandbox_workspace_write.exclude_slash_tmp=true",
      "--", "node", "-e", "process.stdout.write('paperclip-code-sandbox-ready')",
    ], { cwd: input.cwd, env: input.env, timeoutSec: 15, graceSec: 2, onLog: async () => {} });
    const available = result.exitCode === 0 && !result.timedOut && result.stdout.includes("paperclip-code-sandbox-ready");
    return { available, detail: available ? null : "The execution environment cannot start the requested Codex filesystem sandbox." };
  } catch {
    return { available: false, detail: "The execution environment could not verify the requested Codex filesystem sandbox." };
  }
}
