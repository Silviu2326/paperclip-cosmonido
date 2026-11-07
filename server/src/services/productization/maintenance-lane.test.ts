import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductMaintenanceLane } from "./maintenance-lane.js";

describe("independent product maintenance lanes", () => {
  afterEach(() => vi.useRealTimers());
  it("a slow provider cannot overlap itself or prevent another lane from progressing", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const blocked = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const fast = vi.fn(async () => {});
    const slowLane = createProductMaintenanceLane({ intervalMs: 100, enabled: () => true, run: blocked, onError: vi.fn() });
    const fastLane = createProductMaintenanceLane({ intervalMs: 100, enabled: () => true, run: fast, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(500);
    expect(blocked).toHaveBeenCalledTimes(1); expect(fast).toHaveBeenCalledTimes(5);
    const stopping = slowLane.stop(); release(); await stopping; await fastLane.stop();
    await vi.advanceTimersByTimeAsync(500); expect(blocked).toHaveBeenCalledTimes(1); expect(fast).toHaveBeenCalledTimes(5);
  });
  it("a failed attempt is reported once and the next scheduled attempt can proceed", async () => {
    vi.useFakeTimers(); const onError = vi.fn(); const work = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const lane = createProductMaintenanceLane({ intervalMs: 100, enabled: () => true, run: work, onError });
    await vi.advanceTimersByTimeAsync(200); await lane.stop();
    expect(onError).toHaveBeenCalledTimes(1); expect(work).toHaveBeenCalledTimes(2);
  });
});
