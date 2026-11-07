import type { EngineEventListener, ProviderId, UsageRecord } from "../core/types.js";
import type { SttUsageRecord } from "../stt/types.js";
import type { LlmUsage } from "../llm/types.js";

export interface UsageScope { companyId?: string; agentId?: string; issueId?: string }
export interface VoiceCostRecord extends UsageScope {
  provider: ProviderId;
  model?: string;
  operation: UsageRecord["operation"] | SttUsageRecord["operation"] | "chat";
  requestId?: string;
  costCents: number;
  costStatus: "priced" | "unpriced" | "estimated";
  pricingProvenance: {
    source: string;
    unit: UsageRecord["unit"] | "token";
    units: number;
    centsPerUnit: number | null;
    estimatedCents: number | null;
    coverage: string;
  };
  /** Token breakdown is retained for LLM usage while units remain total tokens. */
  tokenUsage?: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number };
}

/** Preserve unknown pricing and fractional cents; engine estimates are not invoices. */
export function toCostRecord(usage: UsageRecord, scope?: UsageScope): VoiceCostRecord;
export function toCostRecord(usage: SttUsageRecord, scope?: UsageScope): VoiceCostRecord;
export function toCostRecord(usage: LlmUsage, scope?: UsageScope): VoiceCostRecord;
export function toCostRecord(usage: UsageRecord | SttUsageRecord | LlmUsage, scope?: UsageScope): VoiceCostRecord;
export function toCostRecord(usage: UsageRecord | SttUsageRecord | LlmUsage, scope: UsageScope = {}): VoiceCostRecord {
  const llm = !("operation" in usage);
  const units = llm ? usage.inputTokens + usage.outputTokens : usage.units;
  const unit = llm ? "token" as const : usage.unit;
  if (!Number.isFinite(units) || units < 0) throw new RangeError("Usage units must be finite and nonnegative.");
  const cents = usage.estimatedCents;
  if (cents !== null && (!Number.isFinite(cents) || cents < 0)) throw new RangeError("Estimated cents must be null or finite and nonnegative.");
  return {
    companyId: scope.companyId, agentId: scope.agentId, issueId: scope.issueId,
    provider: usage.provider, model: usage.model, operation: llm ? "chat" : usage.operation, requestId: usage.requestId,
    ...(llm ? { tokenUsage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedInputTokens: usage.cachedInputTokens, cacheWriteTokens: usage.cacheWriteTokens, reasoningTokens: usage.reasoningTokens } } : {}),
    costCents: cents ?? 0, costStatus: cents === null ? "unpriced" : "estimated",
    pricingProvenance: {
      source: usage.pricingSource, unit, units,
      centsPerUnit: cents !== null && units > 0 ? cents / units : null,
      estimatedCents: cents,
      coverage: cents === null
        ? "No monetary rate is established; zero costCents is an unpriced placeholder, not free usage."
        : "Estimate for this operation's reported units; provider invoice, plan discounts and taxes may differ.",
    },
  };
}

/** Forward only usage events; the synchronous callback should enqueue durable writes. */
export type VoiceUsageEvent = Parameters<EngineEventListener>[0] | { type: "stt.usage"; usage: SttUsageRecord; scope?: UsageScope } | { type: "llm.usage"; usage: LlmUsage; scope?: UsageScope };
/** Forward voice, STT, and LLM usage events to a durable cost writer. */
export function createUsageSink(onRecord: (record: VoiceCostRecord) => void): (event: VoiceUsageEvent) => void {
  return event => { if (event.type === "usage" || event.type === "stt.usage" || event.type === "llm.usage") onRecord(toCostRecord(event.usage, event.scope)); };
}
