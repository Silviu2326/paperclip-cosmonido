import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { activityLog } from "@paperclipai/db";
import { badRequest } from "../../errors.js";
import type { LogActivityInput } from "../activity-log.js";

// Helpers shared by the CRM customer and contact services (pista A1).

export type CrmActor = Pick<LogActivityInput, "actorType" | "actorId" | "agentId" | "runId">;

/** Candidate returned when a create would duplicate an existing record. Never merges. */
export interface DuplicateCandidate<T> {
  record: T;
  reasons: string[];
}

/** Thrown by create operations when duplicates exist and `force` is not set. Mapped to HTTP 409. */
export class CrmDuplicateError<T = unknown> extends Error {
  candidates: DuplicateCandidate<T>[];
  constructor(candidates: DuplicateCandidate<T>[]) {
    super("Possible duplicates found");
    this.name = "CrmDuplicateError";
    this.candidates = candidates;
  }
}

export interface CursorPosition {
  updatedAt: Date;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque keyset cursor over (updated_at desc, id desc). */
export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(
    JSON.stringify({ u: position.updatedAt.toISOString(), i: position.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeCursor(cursor: string | undefined | null): CursorPosition | null {
  if (!cursor) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw badRequest("Invalid cursor");
  }
  if (!parsed || typeof parsed !== "object") throw badRequest("Invalid cursor");
  const { u, i } = parsed as { u?: unknown; i?: unknown };
  if (typeof u !== "string" || typeof i !== "string" || !UUID_PATTERN.test(i)) {
    throw badRequest("Invalid cursor");
  }
  const updatedAt = new Date(u);
  if (Number.isNaN(updatedAt.getTime())) throw badRequest("Invalid cursor");
  return { updatedAt, id: i };
}

/** Escapes LIKE wildcards so user search text is matched literally. */
export function likeContains(text: string): string {
  return `%${text.replace(/[\%_]/g, (ch) => `\${ch}`)}%`;
}

/** Returns one page from a query fetched with limit + 1 rows, plus the cursor for the next page. */
export function toPage<T extends { updatedAt: Date; id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null,
  };
}

/**
 * Idempotent creates: the activity row written by the first successful create
 * carries `details.idempotencyKey`, so a retry finds the entity it produced.
 * The caller must hold the advisory lock from `lockIdempotencyKey` in the same transaction.
 */
export async function lockIdempotencyKey(tx: Db, companyId: string, scope: string, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${companyId}:${scope}:${key}`}))`);
}

export async function findIdempotentEntityId(
  tx: Db,
  input: { companyId: string; action: string; entityType: string; key: string },
): Promise<string | null> {
  const [row] = await tx
    .select({ entityId: activityLog.entityId })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.companyId, input.companyId),
        eq(activityLog.action, input.action),
        eq(activityLog.entityType, input.entityType),
        sql`${activityLog.details}->>'idempotencyKey' = ${input.key}`,
      ),
    )
    .limit(1);
  return row?.entityId ?? null;
}
