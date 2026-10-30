import { beforeEach, describe, expect, it, vi } from "vitest";
import { probeCodexFilesystemSandbox } from "./code-access.js";
const run = vi.hoisted(() => vi.fn());
vi.mock("@paperclipai/adapter-utils/execution-target", () => ({ runAdapterExecutionTargetProcess: run }));
const input = { runId: "probe", target: null, command: "codex", cwd: "/workspace", env: {}, access: "read_only" };
beforeEach(() => { run.mockReset(); });
describe("Codex filesystem sandbox preflight", () => {
  it("does not probe legacy agents without an explicit policy", async () => {
    expect(await probeCodexFilesystemSandbox({ ...input, access: undefined })).toEqual({ available: true, detail: null });
    expect(run).not.toHaveBeenCalled();
  });
  it("uses a model-free command in the actual target with a bounded timeout", async () => {
    run.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: "paperclip-code-sandbox-ready", stderr: "" });
    expect((await probeCodexFilesystemSandbox(input)).available).toBe(true);
    expect(run).toHaveBeenCalledWith("probe", null, "codex", expect.arrayContaining(["sandbox", 'sandbox_mode="read-only"', "node"]), expect.objectContaining({ timeoutSec: 15, cwd: "/workspace" }));
  });
  it.each([
    { exitCode: 1, timedOut: false, stdout: "", stderr: "bwrap: namespace denied" },
    { exitCode: 0, timedOut: false, stdout: "", stderr: "" },
    { exitCode: 0, timedOut: true, stdout: "paperclip-code-sandbox-ready", stderr: "" },
  ])("fails closed for an unavailable or unverified sandbox", async result => {
    run.mockResolvedValue(result);
    expect((await probeCodexFilesystemSandbox(input)).available).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("does not retry without a sandbox when probing fails", async () => {
    run.mockImplementation(() => { throw new Error("Unavailable"); });
    expect((await probeCodexFilesystemSandbox(input)).available).toBe(false);
    expect(run.mock.calls.length).toBe(1);
  });
});
