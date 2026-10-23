import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { productNotificationSignals } from "@paperclipai/db";

/** Small transactional hook: only enqueue; never performs a push or reads customer content. */
export async function enqueueProductNotificationActivitySignal(
  db: Db,
  input: { companyId: string; activityId: string; action: string; entityType: string },
) {
  const relevant =
    (input.entityType === "decision" && /^decision\.(created|commercial_created|updated)$/.test(input.action)) ||
    (input.entityType === "deliverable_review" && input.action === "deliverable.submitted") ||
    (input.entityType === "issue" && /^issue\.(created|updated|status_changed|assigned)$/.test(input.action));
  if (!relevant) return false;
  await db.insert(productNotificationSignals).values({ companyId: input.companyId, activityId: input.activityId })
    .onConflictDoNothing({ target: [productNotificationSignals.companyId, productNotificationSignals.activityId] });
  return true;
}
