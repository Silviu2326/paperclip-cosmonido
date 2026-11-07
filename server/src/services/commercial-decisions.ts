import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { decisionRemoteTokens, decisions } from "@paperclipai/db";
import type {
  CommercialDecisionEffect,
  CommercialDecisionMetadata,
  CommercialSubjectKind,
  CreateCommercialDecisionInput,
  CreateRemoteDecisionLinkInput,
  RemoteDecisionLink,
  ResolveCommercialDecisionInput,
} from "@paperclipai/shared";
import { HttpError, conflict, notFound, unprocessable } from "../errors.js";
import type { AuthorizationActor } from "./authorization.js";
import { logActivity } from "./activity-log.js";
import type { decisionService } from "./decisions.js";

/** Sprint 3 WP5: commercial decisions stored in `decisions` with `metadata.commercial`. */

export type CommercialShadowOutcome = "sent_unchanged" | "edited" | "rejected";
export type CommercialEffectHandler = (
  effect: CommercialDecisionEffect,
  ctx: { companyId: string; decisionId: string; actor: AuthorizationActor },
) => Promise<void>;

export type CommercialDecisionDeps = {
  decisions: ReturnType<typeof decisionService>;
  effectHandlers?: Partial<Record<CommercialDecisionEffect["kind"], CommercialEffectHandler>>;
  recordShadowOutcome?: (input: {
    companyId: string;
    agentId: string;
    actionType: string;
    outcome: CommercialShadowOutcome;
  }) => Promise<void>;
  subjectVersion?: (companyId: string, subject: { kind: CommercialSubjectKind; id: string }) => Promise<string | null>;
  publicBaseUrl?: string;
};

type PendingEffect = { kind: string; reason: string };
type Resolution = {
  optionId: string;
  claimedAt: string;
  appliedAt?: string | null;
  pendingEffects?: PendingEffect[];
};
/** Stored metadata.commercial; `resolution` is runtime state written by this service. */
export type CommercialDecisionRecord = CommercialDecisionMetadata & { resolution?: Resolution | null };

export type CommercialDecisionView = Omit<typeof decisions.$inferSelect, "signedSpec"> & {
  commercial: CommercialDecisionRecord | null;
};

export type ResolveCommercialResult = { decision: CommercialDecisionView; applied: boolean };

export type RemoteDecisionDescription = {
  title: string;
  body: string;
  options: Array<{ id: string; label: string; description: string | null }>;
  expiresAt: string;
  status: string;
};

/** Claims older than this with no `appliedAt` are treated as abandoned (process stopped mid-resolution). */
const CLAIM_TTL_MS = 60_000;
const HOUR_MS = 3_600_000;

function gone(message: string, details?: unknown) {
  return new HttpError(410, message, details);
}

function subjectChanged() {
  return conflict("El elemento cambió desde que se creó la decisión", { code: "subject_changed" });
}

export function parseCommercial(metadata: unknown): CommercialDecisionRecord | null {
  const raw = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).commercial
    : undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as CommercialDecisionRecord;
  if (typeof record.type !== "string" || !record.subject || typeof record.subjectVersion !== "string") return null;
  return { ...record, effects: record.effects ?? {} };
}

function shadowOutcome(optionId: string, style: string | undefined): CommercialShadowOutcome {
  if (optionId === "approve" || optionId === "send") return "sent_unchanged";
  if (optionId === "edit") return "edited";
  if (optionId === "reject" || optionId === "discard") return "rejected";
  if (style === "primary") return "sent_unchanged";
  if (style === "destructive") return "rejected";
  return "edited";
}

function toView(row: typeof decisions.$inferSelect): CommercialDecisionView {
  const { signedSpec: _signedSpec, ...rest } = row;
  return { ...rest, commercial: parseCommercial(row.metadata) };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function commercialDecisionService(db: Db, deps: CommercialDecisionDeps) {
  async function loadRow(dbOrTx: Db, id: string) {
    const row = await dbOrTx.select().from(decisions).where(eq(decisions.id, id)).then((rows) => rows[0] ?? null);
    if (!row || !parseCommercial(row.metadata)) throw notFound("Decision not found");
    return row;
  }

  async function view(id: string) {
    return toView(await loadRow(db, id));
  }

  async function create(companyId: string, input: CreateCommercialDecisionInput, origin: {
    actor: AuthorizationActor;
    agentId: string;
    runId: string;
  }): Promise<CommercialDecisionView> {
    const optionIds = input.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) throw unprocessable("Commercial decision option ids must be unique");
    const hasContinuation = Boolean(input.continuation?.playbookRunId);
    const commercial: CommercialDecisionRecord = {
      type: input.type,
      subject: input.subject,
      subjectVersion: input.subjectVersion,
      effects: Object.fromEntries(input.options.map((option) => [option.id, option.effect])),
      continuation: input.continuation ?? null,
      shadowAgentId: input.shadowAgentId ?? null,
      shadowActionType: input.shadowActionType ?? null,
    };
    const created = await deps.decisions.create({
      companyId,
      actor: origin.actor,
      agentId: origin.agentId,
      runId: origin.runId,
      title: input.title,
      body: input.body,
      ruleKey: `commercial.${input.type}`,
      options: input.options.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description ?? null,
        style: option.style ?? "default",
        // Effects live in metadata.commercial.effects; the base decisions executor must not run them.
        effects: [],
      })),
      expiresAt: new Date(Date.now() + input.expiresInHours * HOUR_MS),
      idempotencyKey: input.idempotencyKey,
      continuationPolicy: hasContinuation ? "wake_origin_agent" : "none",
      metadata: { commercial },
    });
    await logActivity(db, {
      companyId,
      actorType: "agent",
      actorId: origin.agentId,
      agentId: origin.agentId,
      runId: origin.runId,
      action: "decision.commercial_created",
      entityType: "decision",
      entityId: created.id,
      details: { type: input.type, subject: input.subject, subjectVersion: input.subjectVersion },
    });
    return toView(created);
  }

  async function get(decisionId: string): Promise<CommercialDecisionView | null> {
    const row = await db.select().from(decisions).where(eq(decisions.id, decisionId)).then((rows) => rows[0] ?? null);
    return row && parseCommercial(row.metadata) ? toView(row) : null;
  }

  async function listOpen(companyId: string, limit = 50): Promise<CommercialDecisionView[]> {
    const rows = await db.select().from(decisions)
      .where(and(
        eq(decisions.companyId, companyId),
        eq(decisions.status, "open"),
        sql`(${decisions.metadata} -> 'commercial') IS NOT NULL`,
      ))
      .orderBy(desc(decisions.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map(toView);
  }

  /**
   * Applies the declared effect of the chosen option. Never throws for unknown or failing effects:
   * they are recorded in `resolution.pendingEffects` so the decision still resolves.
   */
  async function applyOutcome(row: typeof decisions.$inferSelect, commercial: CommercialDecisionRecord,
    optionId: string, actor: AuthorizationActor): Promise<PendingEffect[]> {
    const pending: PendingEffect[] = [];
    const option = row.options.find((item) => item.id === optionId);
    const effect: CommercialDecisionEffect = commercial.effects[optionId] ?? { kind: "none" };
    if (effect.kind !== "none") {
      const handler = deps.effectHandlers?.[effect.kind] as CommercialEffectHandler | undefined;
      if (!handler) {
        pending.push({ kind: effect.kind, reason: "no_handler" });
      } else {
        try {
          await handler(effect, { companyId: row.companyId, decisionId: row.id, actor });
        } catch {
          pending.push({ kind: effect.kind, reason: "handler_failed" });
        }
      }
    }
    if (commercial.shadowAgentId && commercial.shadowActionType && deps.recordShadowOutcome) {
      try {
        await deps.recordShadowOutcome({
          companyId: row.companyId,
          agentId: commercial.shadowAgentId,
          actionType: commercial.shadowActionType,
          outcome: shadowOutcome(optionId, option?.style),
        });
      } catch {
        pending.push({ kind: "shadow_outcome", reason: "record_failed" });
      }
    }
    return pending;
  }

  async function releaseClaim(decisionId: string) {
    await db.update(decisions).set({
      metadata: sql`${decisions.metadata} #- '{commercial,resolution}'`,
      updatedAt: new Date(),
    }).where(and(eq(decisions.id, decisionId), eq(decisions.status, "open")));
  }

  async function resolve(
    decisionId: string,
    input: ResolveCommercialDecisionInput,
    actor: { decidedByUserId: string; userActor: AuthorizationActor; via?: "board" | "remote_link"; tokenId?: string },
  ): Promise<ResolveCommercialResult> {
    // Pre-checks run outside the lock: decide() uses the shared pool, and no DB call may run inside the claim transaction.
    const current = await loadRow(db, decisionId);
    const commercial = parseCommercial(current.metadata)!;
    if (current.status !== "open") return { decision: toView(current), applied: false };
    if (!current.options.some((option) => option.id === input.optionId)) throw unprocessable("Unknown optionId");
    if (input.subjectVersion !== undefined && input.subjectVersion !== commercial.subjectVersion) throw subjectChanged();
    if (deps.subjectVersion) {
      const currentVersion = await deps.subjectVersion(current.companyId, commercial.subject);
      if (currentVersion !== null && currentVersion !== commercial.subjectVersion) throw subjectChanged();
    }

    // Atomic claim: under the advisory lock only one caller moves an open decision into resolution.
    const claimedRow = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`commercial-decision:${decisionId}`}, 0))`);
      const row = await loadRow(tx as unknown as Db, decisionId);
      const record = parseCommercial(row.metadata)!;
      if (row.status !== "open") return null;
      const existing = record.resolution;
      if (existing && (existing.appliedAt || Date.parse(existing.claimedAt) > Date.now() - CLAIM_TTL_MS)) return null;
      const resolution: Resolution = { optionId: input.optionId, claimedAt: new Date().toISOString(), appliedAt: null };
      const [updated] = await tx.update(decisions).set({
        metadata: { ...row.metadata, commercial: { ...record, resolution } },
        updatedAt: new Date(),
      }).where(and(eq(decisions.id, decisionId), eq(decisions.status, "open"))).returning();
      return updated ?? null;
    });
    if (!claimedRow) return { decision: await view(decisionId), applied: false };

    try {
      await deps.decisions.decide({
        id: decisionId,
        optionId: input.optionId,
        decidedByUserId: actor.decidedByUserId,
        userActor: actor.userActor,
        idempotencyKey: null,
      });
    } catch (error) {
      await releaseClaim(decisionId);
      if (error instanceof HttpError && error.status === 409 && (error.details as { code?: string } | undefined)?.code === "decision_already_resolved") {
        return { decision: await view(decisionId), applied: false };
      }
      throw error;
    }

    const pending = await applyOutcome(claimedRow, commercial, input.optionId, actor.userActor);
    const appliedAt = new Date().toISOString();
    const finalRow = await db.transaction(async (tx) => {
      const row = await loadRow(tx as unknown as Db, decisionId);
      const record = parseCommercial(row.metadata)!;
      const resolution: Resolution = { ...(record.resolution ?? { optionId: input.optionId, claimedAt: appliedAt }), appliedAt, pendingEffects: pending };
      const [updated] = await tx.update(decisions).set({
        metadata: { ...row.metadata, commercial: { ...record, resolution } },
        updatedAt: new Date(),
      }).where(eq(decisions.id, decisionId)).returning();
      await logActivity(tx as unknown as Db, {
        companyId: row.companyId,
        actorType: "user",
        actorId: actor.decidedByUserId,
        action: "decision.commercial_resolved",
        entityType: "decision",
        entityId: decisionId,
        details: {
          optionId: input.optionId,
          type: record.type,
          subject: record.subject,
          subjectVersion: record.subjectVersion,
          via: actor.via ?? "board",
          ...(actor.tokenId ? { tokenId: actor.tokenId } : {}),
          pendingEffects: pending,
        },
      });
      return updated ?? row;
    });
    return { decision: toView(finalRow), applied: true };
  }

  async function createRemoteLink(decisionId: string, input: CreateRemoteDecisionLinkInput,
    actor: { userId: string | null }): Promise<RemoteDecisionLink> {
    const row = await loadRow(db, decisionId);
    if (row.status !== "open") throw conflict("decision_already_resolved", { code: "decision_already_resolved" });
    const token = randomBytes(32).toString("base64url");
    const requested = new Date(Date.now() + input.expiresInHours * HOUR_MS);
    const expiresAt = requested.getTime() > row.expiresAt.getTime() ? row.expiresAt : requested;
    await db.insert(decisionRemoteTokens).values({
      companyId: row.companyId,
      decisionId,
      tokenHash: hashToken(token),
      channel: input.channel,
      recipientUserId: actor.userId,
      expiresAt,
    });
    await logActivity(db, {
      companyId: row.companyId,
      actorType: "user",
      actorId: actor.userId ?? "unknown",
      action: "decision.remote_link_created",
      entityType: "decision",
      entityId: decisionId,
      details: { channel: input.channel, expiresAt: expiresAt.toISOString() },
    });
    const base = (deps.publicBaseUrl ?? "").replace(/\/+$/, "");
    return { decisionId, url: `${base}/api/public/decisions/${token}`, expiresAt: expiresAt.toISOString() };
  }

  async function findToken(token: string) {
    const row = await db.select().from(decisionRemoteTokens).where(eq(decisionRemoteTokens.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Decision link not found");
    if (row.usedAt || row.expiresAt.getTime() <= Date.now()) throw gone("Decision link has expired or was already used");
    return row;
  }

  async function resolveRemote(token: string, optionId: string, _meta: { ip?: string | null; userAgent?: string | null }) {
    const link = await findToken(token);
    const decision = await loadRow(db, link.decisionId);
    const recipient = link.recipientUserId ?? "remote-link";
    // Claim the token atomically before resolving; release it again if the resolution is refused.
    const [claimed] = await db.update(decisionRemoteTokens)
      .set({ usedAt: new Date(), usedOptionId: optionId })
      .where(and(eq(decisionRemoteTokens.id, link.id), isNull(decisionRemoteTokens.usedAt), gt(decisionRemoteTokens.expiresAt, new Date())))
      .returning();
    if (!claimed) throw gone("Decision link has expired or was already used");
    try {
      return await resolve(decision.id, { optionId }, {
        decidedByUserId: recipient,
        userActor: { type: "board", userId: recipient, companyIds: [decision.companyId], source: "session" },
        via: "remote_link",
        tokenId: link.id,
      });
    } catch (error) {
      await db.update(decisionRemoteTokens).set({ usedAt: null, usedOptionId: null }).where(eq(decisionRemoteTokens.id, link.id));
      throw error;
    }
  }

  async function describeRemote(token: string): Promise<RemoteDecisionDescription> {
    const link = await findToken(token);
    const row = await loadRow(db, link.decisionId);
    return {
      title: row.title,
      body: row.body,
      options: row.options.map((option) => ({ id: option.id, label: option.label, description: option.description ?? null })),
      expiresAt: link.expiresAt.toISOString(),
      status: row.status,
    };
  }

  return { create, get, listOpen, resolve, createRemoteLink, resolveRemote, describeRemote };
}

export type CommercialDecisionService = ReturnType<typeof commercialDecisionService>;
