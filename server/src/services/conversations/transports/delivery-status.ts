import { and, eq } from "drizzle-orm";
import { type Db, conversationMessages } from "@paperclipai/db";
import { logActivity } from "../../activity-log.js";

// Provider delivery callbacks (Meta statuses, Twilio status callbacks) update the outbound message
// that carries the provider id. Statuses only move forward, so a late "sent" never undoes "read".
// Duplicate or out-of-order callbacks are harmless.

export type ProviderDeliveryStatus = "sent" | "delivered" | "read" | "failed";

const RANK: Record<string, number> = { draft: 0, queued: 0, uncertain: 0, sent: 1, delivered: 2, read: 3 };

/** Returns true when the message status changed. Unknown provider ids are ignored. */
export async function applyProviderDeliveryStatus(
  db: Db,
  input: {
    companyId: string;
    provider: string;
    providerMessageId: string;
    status: ProviderDeliveryStatus;
    receipt?: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(conversationMessages)
    .where(and(
      eq(conversationMessages.companyId, input.companyId),
      eq(conversationMessages.provider, input.provider),
      eq(conversationMessages.providerMessageId, input.providerMessageId),
      eq(conversationMessages.direction, "outbound"),
    ))
    .limit(1);
  if (!row) return false;

  const current = row.deliveryStatus;
  if (input.status === "failed") {
    // A message the provider already delivered cannot fail afterwards.
    if (current === "delivered" || current === "read" || current === "failed") return false;
  } else {
    if (current === "failed") return false;
    if ((RANK[current] ?? -1) >= RANK[input.status]) return false;
  }

  const now = new Date();
  await db
    .update(conversationMessages)
    .set({
      deliveryStatus: input.status,
      providerReceipt: { ...(row.providerReceipt ?? {}), ...(input.receipt ?? {}), lastStatus: input.status },
      sentAt: row.sentAt ?? (input.status === "failed" ? null : now),
      updatedAt: now,
    })
    .where(eq(conversationMessages.id, row.id));
  await logActivity(db, {
    companyId: input.companyId,
    actorType: "system",
    actorId: "channel-webhook",
    action: "message.delivery_status_changed",
    entityType: "conversation_message",
    entityId: row.id,
    details: { provider: input.provider, from: current, to: input.status },
  });
  return true;
}
