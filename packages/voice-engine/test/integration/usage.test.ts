import { describe, expect, it, vi } from "vitest";
import { createUsageSink, toCostRecord } from "../../src/integration/usage.js";
import { fakeUsage } from "../cli/fake-engine.js";

describe("cost records", () => {
  it("preserves fractional priced estimates, source and company attribution", () => {
    expect(toCostRecord(fakeUsage, { companyId: "co-1", agentId: "agent-1" })).toMatchObject({ provider: "fake", companyId: "co-1", agentId: "agent-1", costCents: 0.025, costStatus: "estimated", pricingProvenance: { source: "fixture rate card", unit: "character", units: 5, centsPerUnit: 0.005, estimatedCents: 0.025 } });
  });
  it("does not turn unknown pricing into a free request", () => {
    const result = toCostRecord({ ...fakeUsage, estimatedCents: null });
    expect(result).toMatchObject({ costCents: 0, costStatus: "unpriced", pricingProvenance: { estimatedCents: null, centsPerUnit: null } });
    expect(result.pricingProvenance.coverage).toContain("not free");
  });
  it("keeps a known zero estimate distinct from unpriced usage", () => {
    expect(toCostRecord({ ...fakeUsage, units: 0, estimatedCents: 0 })).toMatchObject({ costStatus: "estimated", costCents: 0, pricingProvenance: { centsPerUnit: null } });
  });
  it("normalizes STT and LLM token usage while retaining cached token detail", () => {
    expect(toCostRecord({ provider: "openai", model: "gpt-transcribe", operation: "transcribe", unit: "second", units: 12, estimatedCents: null, pricingSource: "unknown" })).toMatchObject({ operation: "transcribe", pricingProvenance: { unit: "second", units: 12 }, costStatus: "unpriced" });
    expect(toCostRecord({ provider: "openai", model: "gpt-fast", inputTokens: 100, outputTokens: 20, cachedInputTokens: 40, estimatedCents: 0.5, pricingSource: "fixture" })).toMatchObject({ operation: "chat", tokenUsage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 40 }, pricingProvenance: { unit: "token", units: 120 } });
  });
  it("rejects invalid numeric usage", () => {
    expect(() => toCostRecord({ ...fakeUsage, units: NaN })).toThrow(RangeError);
    expect(() => toCostRecord({ ...fakeUsage, estimatedCents: -1 })).toThrow(RangeError);
  });
  it("only forwards usage events, preserving event scope", () => {
    const onRecord = vi.fn();
    const sink = createUsageSink(onRecord);
    sink({ type: "cache.hit", key: "cache-1" });
    sink({ type: "synthesis.start", provider: "fake", model: "fake-tts", chars: 5, requestId: "req-1" });
    sink({ type: "usage", usage: fakeUsage, scope: { companyId: "co-1", agentId: "agent-1" } });
    expect(onRecord).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ companyId: "co-1", agentId: "agent-1", provider: "fake" }));
  });
});
