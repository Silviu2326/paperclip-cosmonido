import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { CapabilityLiveSessionService, type CapabilityLiveSessionSnapshot, type CapabilityLiveTransportFactory } from "./live-session.js";

export interface NativeAutonomyReplayUsage {
  inputTokens: number;
  outputTokens: number;
  costNanodollars: number;
}

/** Missing provider usage is an unpriced result, never a zero-cost receipt. */
export function summarizeNativeAutonomyReplayUsage(
  snapshot: Pick<CapabilityLiveSessionSnapshot, "usageLedger">,
  turnId: string,
): NativeAutonomyReplayUsage {
  const usageLedger = snapshot.usageLedger;
  if (!usageLedger) throw new Error("native_autonomy_replay_usage_unavailable");
  const receipts = usageLedger.filter((receipt) => receipt.turnId === turnId);
  if (!receipts.length) throw new Error("native_autonomy_replay_usage_unavailable");
  const usage = receipts.reduce((total, receipt) => ({
    inputTokens: total.inputTokens + receipt.inputTokens,
    outputTokens: total.outputTokens + receipt.outputTokens,
    costNanodollars: total.costNanodollars + receipt.costNanodollars,
  }), { inputTokens: 0, outputTokens: 0, costNanodollars: 0 });
  if (![usage.inputTokens, usage.outputTokens, usage.costNanodollars].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("native_autonomy_replay_usage_invalid");
  }
  return usage;
}

export interface NativeAutonomyReplaySandboxAttestation {
  provider: "codex";
  profileId: "paperclip-runner-workspace-only";
  workingDirectory: string;
  filesystemScope: "workspace_only";
  networkEnabled: false;
  verified: true;
}

/** Trusted host adapter. No default process transport is selected by this API. */
export interface NativeAutonomyReplaySandbox {
  preflight(input: { workingDirectory: string }): Promise<NativeAutonomyReplaySandboxAttestation>;
  transportFactory: CapabilityLiveTransportFactory;
}

/** Inputs deliberately contain no reference answer or source record. */
export interface NativeAutonomyReplayInput {
  provider: "codex";
  model: string;
  apiKey: string;
  baseInstructions: string;
  userMessage: string;
  timeoutMs: number;
  sandbox: NativeAutonomyReplaySandbox;
  abortSignal?: AbortSignal;
}

export interface NativeAutonomyReplayResult {
  status: "completed" | "failed" | "interrupted" | "cancelled";
  assistantText: string;
  provider: "codex";
  model: string;
  inputTokens: number;
  outputTokens: number;
  costNanodollars: number;
  /** Semantic tools are disabled; this does not itself prove OS filesystem/network containment. */
  authority: "semantic-tools-disabled";
  qualification: "not_qualified";
  qualificationReason: "company_tool_catalog_not_bound";
}

/**
 * Executes one fresh Codex turn with semantic tools disabled. The trusted host
 * adapter must enforce and attest the OS boundary; disabling semantic tools
 * alone does not contain native process filesystem or network access. This is
 * not a production-qualified benchmark: company tools and their authority are
 * not represented by the Runner's fixed mock catalog.
 */
export async function runNativeAutonomyReplay(
  input: NativeAutonomyReplayInput,
): Promise<NativeAutonomyReplayResult> {
  const model = input.model.trim();
  const instructions = input.baseInstructions.trim();
  const message = input.userMessage.trim();
  if (!model || !instructions || !message) throw new Error("native_autonomy_replay_input_required");
  if (!input.apiKey.trim()) throw new Error("native_autonomy_replay_credential_required");
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 120_000) {
    throw new Error("native_autonomy_replay_timeout_out_of_range");
  }
  if (input.abortSignal?.aborted) throw new Error("native_autonomy_replay_cancelled_before_start");

  const scratch = await mkdtemp(join(tmpdir(), "paperclip-autonomy-replay-"));
  const resolvedScratch = resolve(scratch);
  const service = new CapabilityLiveSessionService({
    transportFactory: input.sandbox.transportFactory,
    transportOptions: {
      baseInstructions: instructions,
      environment: { PATH: process.env.PATH ?? "", OPENAI_API_KEY: input.apiKey },
    },
  });
  let sessionId: string | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const attestation = await input.sandbox.preflight({ workingDirectory: resolvedScratch });
    if (attestation.verified !== true || attestation.provider !== "codex" ||
        attestation.profileId !== "paperclip-runner-workspace-only" ||
        attestation.filesystemScope !== "workspace_only" || attestation.networkEnabled !== false ||
        resolve(attestation.workingDirectory) !== resolvedScratch) {
      throw new Error("native_autonomy_replay_sandbox_unverified");
    }
    const session = await service.create({
      provider: "codex",
      requestedModel: model,
      workingDirectory: resolvedScratch,
      capabilities: [],
      explicitClaims: [],
      scenario: { id: "autonomy-bench-empty-mock", claims: [], enableGenericApiRequest: false },
      turnTimeoutMs: input.timeoutMs,
      lifecyclePolicy: { mode: "per_turn", idleTimeoutMs: null },
    });
    sessionId = session.snapshot().sessionId;
    if (input.abortSignal) {
      abortListener = () => { void service.shutdown(sessionId!, "autonomy replay cancelled"); };
      input.abortSignal.addEventListener("abort", abortListener, { once: true });
    }
    const turn = await session.sendMessage(message);
    const usage = summarizeNativeAutonomyReplayUsage(turn.snapshot, turn.turnId);
    return {
      status: turn.status,
      assistantText: turn.assistantText,
      provider: "codex",
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costNanodollars: usage.costNanodollars,
      authority: "semantic-tools-disabled",
      qualification: "not_qualified",
      qualificationReason: "company_tool_catalog_not_bound",
    };
  } finally {
    if (input.abortSignal && abortListener) input.abortSignal.removeEventListener("abort", abortListener);
    if (sessionId) await service.shutdown(sessionId, "autonomy replay complete").catch(() => undefined);
    const scratchParent = resolve(dirname(resolvedScratch));
    const expectedParent = resolve(tmpdir());
    const scratchName = basename(resolvedScratch);
    if (scratchParent !== expectedParent || !scratchName.startsWith("paperclip-autonomy-replay-")) {
      throw new Error("native_autonomy_replay_cleanup_path_unverified");
    }
    await rm(resolvedScratch, { recursive: true, force: true });
  }
}
