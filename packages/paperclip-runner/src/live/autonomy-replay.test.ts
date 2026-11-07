import { describe, expect, it, vi } from "vitest";
import { runNativeAutonomyReplay, summarizeNativeAutonomyReplayUsage, type NativeAutonomyReplaySandbox } from "./autonomy-replay.js";
import type { CapabilityLiveTransportFactory } from "./live-session.js";

describe("native autonomy replay preflight", () => {
  it("does not construct the native transport when the sandbox boundary is not verified", async () => {
    const transportFactory = vi.fn(() => { throw new Error("transport must not start"); }) as unknown as CapabilityLiveTransportFactory;
    const sandbox: NativeAutonomyReplaySandbox = {
      preflight: async ({ workingDirectory }) => ({
        provider: "codex", profileId: "paperclip-runner-workspace-only", workingDirectory,
        filesystemScope: "workspace_only", networkEnabled: true, verified: true,
      }),
      transportFactory,
    };
    await expect(runNativeAutonomyReplay({
      provider: "codex", model: "test-model", apiKey: "test-only", baseInstructions: "Agent instructions",
      userMessage: "Replay input", timeoutMs: 1_000, sandbox,
    })).rejects.toThrow("native_autonomy_replay_sandbox_unverified");
    expect(transportFactory).not.toHaveBeenCalled();
  });

  it("refuses to synthesize a zero-cost result when the current turn has no usage receipt", () => {
    expect(() => summarizeNativeAutonomyReplayUsage({ usageLedger: undefined }, "turn-1"))
      .toThrow("native_autonomy_replay_usage_unavailable");
    expect(() => summarizeNativeAutonomyReplayUsage({ usageLedger: [{
      receiptId: "receipt-other-turn", attemptId: "attempt-1", providerResponseId: "response-1", turnId: "turn-2",
      providerCalls: 1, providerRequests: 1, inputTokens: 2, outputTokens: 3, cachedInputTokens: 0,
      reasoningTokens: 0, costNanodollars: 4, observedAt: new Date(0).toISOString(),
    }] }, "turn-1")).toThrow("native_autonomy_replay_usage_unavailable");
  });

  it("sums only the current turn's reported usage receipts", () => {
    expect(summarizeNativeAutonomyReplayUsage({ usageLedger: [{
      receiptId: "receipt-1", attemptId: "attempt-1", providerResponseId: "response-1", turnId: "turn-1",
      providerCalls: 1, providerRequests: 1, inputTokens: 11, outputTokens: 7, cachedInputTokens: 0,
      reasoningTokens: 0, costNanodollars: 130, observedAt: new Date(0).toISOString(),
    }, {
      receiptId: "receipt-2", attemptId: "attempt-1", providerResponseId: "response-2", turnId: "turn-2",
      providerCalls: 1, providerRequests: 1, inputTokens: 500, outputTokens: 500, cachedInputTokens: 0,
      reasoningTokens: 0, costNanodollars: 500, observedAt: new Date(0).toISOString(),
    }] }, "turn-1")).toEqual({ inputTokens: 11, outputTokens: 7, costNanodollars: 130 });
  });
});
