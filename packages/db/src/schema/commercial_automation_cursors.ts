import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** One leased, cyclic keyset cursor per durable commercial source lane. */
export const commercialAutomationCursors = pgTable("commercial_automation_cursors", {
  lane: text("lane").primaryKey(),
  lastSourceId: uuid("last_source_id"),
  leaseToken: uuid("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
