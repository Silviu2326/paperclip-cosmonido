/** One independent bounded maintenance lane: slow providers cannot stall other outboxes. */
export function createProductMaintenanceLane(options: { intervalMs: number; enabled: () => boolean; run: () => Promise<unknown>; onError: () => void }) {
  let stopping = false;
  let inFlight: Promise<void> | null = null;
  const tick = () => {
    if (stopping || inFlight || !options.enabled()) return;
    inFlight = Promise.resolve().then(options.run).then(() => undefined, options.onError).finally(() => { inFlight = null; });
  };
  const timer = setInterval(tick, options.intervalMs);
  timer.unref?.();
  return { tick, async stop() { stopping = true; clearInterval(timer); await inFlight; } };
}
