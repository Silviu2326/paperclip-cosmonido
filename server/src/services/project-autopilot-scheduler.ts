import type { Db } from "@paperclipai/db";
import { projectAutopilotService } from "./project-autopilot.js";
import { logger } from "../middleware/logger.js";

/** Durable due dates and row locks live in the service; this timer only supplies wakeups. */
export function startProjectAutopilotScheduler(db: Db, canRun: () => boolean) {
  const service = projectAutopilotService(db);
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  function sweep() {
    if (stopped || inFlight || !canRun()) return;
    inFlight = service.sweep().catch(err => logger.warn({ err }, "Project autonomy sweep failed"))
      .finally(() => { inFlight = null; });
  }
  const timer = setInterval(sweep, 30_000);
  timer.unref?.();
  return { sweep, async stop() { stopped = true; clearInterval(timer); await inFlight; } };
}
