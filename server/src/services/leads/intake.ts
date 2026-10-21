import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { crmActivities, leads } from "@paperclipai/db";
import type { LeadSource } from "@paperclipai/shared";
import { logActivity } from "../activity-log.js";
import {
  createContactWithIdentities,
  findContactByIdentity,
  identityKeys,
  type IdentityInput,
} from "./adapters.js";

export interface LeadIntakeInput {
  source: LeadSource;
  /** Identifier in the source system. (source, sourceRef) is unique per company when set. */
  sourceRef?: string | null;
  payload?: Record<string, unknown>;
  identity?: IdentityInput;
  language?: string | null;
  priority?: "low" | "normal" | "high" | null;
}

export interface LeadIntakeResult {
  lead: typeof leads.$inferSelect;
  /** false when the (source, sourceRef) pair already existed and nothing was written. */
  created: boolean;
}

/** Postgres unique_violation (23505), also when the driver wraps the error. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function leadIntakeService(db: Db) {
  async function findBySourceRef(companyId: string, source: LeadSource, sourceRef: string) {
    const [row] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.companyId, companyId), eq(leads.source, source), eq(leads.sourceRef, sourceRef)))
      .limit(1);
    return row ?? null;
  }

  return {
    findBySourceRef,

    /**
     * Normalizes an inbound entry from any channel into a lead. Idempotent: a repeated
     * (source, sourceRef) returns the existing lead and writes nothing. The existing lead
     * is not modified; a changed payload from the same source ref is ignored by design.
     */
    async ingest(companyId: string, input: LeadIntakeInput): Promise<LeadIntakeResult> {
      const sourceRef = input.sourceRef?.trim() || null;
      if (sourceRef) {
        const existing = await findBySourceRef(companyId, input.source, sourceRef);
        if (existing) return { lead: existing, created: false };
      }

      const payload = input.payload ?? {};
      const keys = identityKeys(input.identity ?? {});
      const displayName = typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim()
        : keys[0]?.identifier ?? "Lead";

      let created: typeof leads.$inferSelect;
      try {
        created = await db.transaction(async (tx) => {
          let contactId: string | null = null;
          if (keys.length > 0) {
            contactId = await findContactByIdentity(tx, companyId, keys);
            if (!contactId) {
              contactId = await createContactWithIdentities(tx, companyId, {
                displayName,
                language: input.language ?? null,
                keys,
                source: input.source,
              });
            }
          }
          const [lead] = await tx
            .insert(leads)
            .values({
              companyId,
              source: input.source,
              sourceRef,
              payload,
              status: "new",
              priority: input.priority ?? null,
              language: input.language ?? null,
              contactId,
            })
            .returning();
          await tx.insert(crmActivities).values({
            companyId,
            subjectKind: "lead",
            subjectId: lead.id,
            kind: "system",
            summary: `Lead recibido desde ${input.source}`,
            payload: { source: input.source, contactId },
            externalRef: sourceRef,
          });
          return lead;
        });
      } catch (error) {
        // A concurrent request with the same sourceRef won the race: return its lead.
        if (sourceRef && isUniqueViolation(error)) {
          const existing = await findBySourceRef(companyId, input.source, sourceRef);
          if (existing) return { lead: existing, created: false };
        }
        throw error;
      }

      await logActivity(db, {
        companyId,
        actorType: "system",
        actorId: `lead-intake:${input.source}`,
        action: "lead.received",
        entityType: "lead",
        entityId: created.id,
        details: { source: input.source, sourceRef, contactId: created.contactId },
      });
      return { lead: created, created: true };
    },
  };
}
