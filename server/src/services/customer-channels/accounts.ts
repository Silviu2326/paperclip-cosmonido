import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { customerChannelAccounts } from "@paperclipai/db/schema/customer_channels";
import { conflict, notFound, unprocessable } from "../../errors.js";
import { logActivity } from "../activity-log.js";
import { secretService } from "../secrets.js";

// Customer channel accounts (Sprint 2 pistas D/E). Accounts reference company secrets by name;
// secret values are read only at send, verify or test time and never returned by this service.

export const CHANNEL_PROVIDERS = ["meta", "telegram", "twilio"] as const;
export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];
export const CHANNEL_KINDS = ["whatsapp", "messenger", "instagram", "telegram", "sms"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export const CHANNEL_ACCOUNT_STATUSES = ["pending", "active", "disabled"] as const;
export type ChannelAccountStatus = (typeof CHANNEL_ACCOUNT_STATUSES)[number];

const KINDS_BY_PROVIDER: Record<ChannelProvider, readonly ChannelKind[]> = {
  meta: ["whatsapp", "messenger", "instagram"],
  telegram: ["telegram"],
  twilio: ["sms"],
};

export function kindsForProvider(provider: ChannelProvider): readonly ChannelKind[] {
  return KINDS_BY_PROVIDER[provider];
}

export type ChannelAccountRow = typeof customerChannelAccounts.$inferSelect;

export interface ApprovedTemplate {
  name: string;
  language: string;
}

/** Public view: secret names only, never values. */
export interface ChannelAccountView {
  id: string;
  companyId: string;
  provider: ChannelProvider;
  kind: ChannelKind;
  label: string;
  externalAccountId: string;
  providerAccountSid: string | null;
  verifySecretName: string;
  challengeSecretName: string | null;
  tokenSecretName: string;
  status: ChannelAccountStatus;
  approvedTemplates: ApprovedTemplate[];
  lastTestedAt: string | null;
  lastTestError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelAccountInput {
  provider: ChannelProvider;
  kind: ChannelKind;
  label: string;
  externalAccountId: string;
  providerAccountSid?: string | null;
  verifySecretName: string;
  challengeSecretName?: string | null;
  tokenSecretName: string;
  approvedTemplates?: ApprovedTemplate[];
}

export interface UpdateChannelAccountInput {
  label?: string;
  providerAccountSid?: string | null;
  verifySecretName?: string;
  challengeSecretName?: string | null;
  tokenSecretName?: string;
  approvedTemplates?: ApprovedTemplate[];
  status?: "active" | "disabled";
}

export interface ChannelActor {
  actorType: "user" | "agent" | "system" | "plugin";
  actorId: string;
  agentId?: string | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function toChannelAccountView(row: ChannelAccountRow): ChannelAccountView {
  return {
    id: row.id,
    companyId: row.companyId,
    provider: row.provider as ChannelProvider,
    kind: row.kind as ChannelKind,
    label: row.label,
    externalAccountId: row.externalAccountId,
    providerAccountSid: row.providerAccountSid,
    verifySecretName: row.verifySecretName,
    challengeSecretName: row.challengeSecretName,
    tokenSecretName: row.tokenSecretName,
    status: row.status as ChannelAccountStatus,
    approvedTemplates: row.approvedTemplates ?? [],
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastTestError: row.lastTestError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Reads a company secret by name and returns its trimmed value, or null when the name is
 * unknown or the value is empty. Callers must never persist or return the result.
 */
export async function readCompanySecret(db: Db, companyId: string, name: string): Promise<string | null> {
  const secrets = secretService(db);
  const secret = await secrets.getByName(companyId, name);
  if (!secret) return null;
  const value = (await secrets.resolveSecretValue(companyId, secret.id, "latest")).trim();
  return value || null;
}

/** Accounts of one provider that accept inbound traffic and outbound sends. */
export async function listActiveAccounts(db: Db, companyId: string, provider: ChannelProvider): Promise<ChannelAccountRow[]> {
  return db
    .select()
    .from(customerChannelAccounts)
    .where(and(
      eq(customerChannelAccounts.companyId, companyId),
      eq(customerChannelAccounts.provider, provider),
      eq(customerChannelAccounts.status, "active"),
    ))
    .orderBy(asc(customerChannelAccounts.createdAt));
}

async function assertSecretNamesExist(db: Db, companyId: string, names: string[]) {
  const secrets = secretService(db);
  for (const name of new Set(names)) {
    const secret = await secrets.getByName(companyId, name);
    if (!secret) throw unprocessable(`Company secret "${name}" does not exist`, { secretName: name });
  }
}

function validateProviderShape(input: {
  provider: ChannelProvider;
  kind: ChannelKind;
  providerAccountSid?: string | null;
  challengeSecretName?: string | null;
}) {
  if (!KINDS_BY_PROVIDER[input.provider].includes(input.kind)) {
    throw unprocessable(`Kind ${input.kind} is not available for provider ${input.provider}`);
  }
  if (input.provider === "twilio" && !input.providerAccountSid) {
    throw unprocessable("Twilio accounts need providerAccountSid");
  }
  if (input.provider === "meta" && !input.challengeSecretName) {
    throw unprocessable("Meta accounts need challengeSecretName (hub.verify_token)");
  }
}

/** Read-only probe per provider. Shared by the test action and its tests. */
export function probeRequest(
  account: Pick<ChannelAccountRow, "provider" | "externalAccountId" | "providerAccountSid">,
  token: string,
): { url: string; headers: Record<string, string> } {
  if (account.provider === "meta") {
    return {
      url: `https://graph.facebook.com/v21.0/${encodeURIComponent(account.externalAccountId)}?fields=id`,
      headers: { Authorization: `Bearer ${token}` },
    };
  }
  if (account.provider === "telegram") {
    return { url: `https://api.telegram.org/bot${token}/getMe`, headers: {} };
  }
  const sid = account.providerAccountSid ?? "";
  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`,
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
  };
}

export function customerChannelService(db: Db, options: { fetch?: FetchLike } = {}) {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function loadRow(companyId: string, id: string): Promise<ChannelAccountRow | null> {
    const [row] = await db
      .select()
      .from(customerChannelAccounts)
      .where(and(eq(customerChannelAccounts.companyId, companyId), eq(customerChannelAccounts.id, id)))
      .limit(1);
    return row ?? null;
  }

  return {
    /** Loads by id alone so the route can check company access on the row. */
    async findById(id: string): Promise<ChannelAccountRow | null> {
      const [row] = await db.select().from(customerChannelAccounts).where(eq(customerChannelAccounts.id, id)).limit(1);
      return row ?? null;
    },

    async list(companyId: string): Promise<ChannelAccountView[]> {
      const rows = await db
        .select()
        .from(customerChannelAccounts)
        .where(eq(customerChannelAccounts.companyId, companyId))
        .orderBy(asc(customerChannelAccounts.createdAt));
      return rows.map(toChannelAccountView);
    },

    async create(companyId: string, input: CreateChannelAccountInput, actor: ChannelActor): Promise<ChannelAccountView> {
      validateProviderShape(input);
      await assertSecretNamesExist(db, companyId, [
        input.verifySecretName,
        input.tokenSecretName,
        ...(input.challengeSecretName ? [input.challengeSecretName] : []),
      ]);
      const [duplicate] = await db
        .select({ id: customerChannelAccounts.id })
        .from(customerChannelAccounts)
        .where(and(
          eq(customerChannelAccounts.companyId, companyId),
          eq(customerChannelAccounts.provider, input.provider),
          eq(customerChannelAccounts.externalAccountId, input.externalAccountId),
        ))
        .limit(1);
      if (duplicate) throw conflict("This account identifier is already connected for this provider");

      const [row] = await db
        .insert(customerChannelAccounts)
        .values({
          companyId,
          provider: input.provider,
          kind: input.kind,
          label: input.label,
          externalAccountId: input.externalAccountId,
          providerAccountSid: input.providerAccountSid ?? null,
          verifySecretName: input.verifySecretName,
          challengeSecretName: input.challengeSecretName ?? null,
          tokenSecretName: input.tokenSecretName,
          approvedTemplates: input.approvedTemplates ?? [],
          status: "pending",
        })
        .returning();
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId ?? null,
        action: "customer_channel.created",
        entityType: "customer_channel_account",
        entityId: row.id,
        details: { provider: row.provider, kind: row.kind },
      });
      return toChannelAccountView(row);
    },

    async update(companyId: string, id: string, input: UpdateChannelAccountInput, actor: ChannelActor): Promise<ChannelAccountView> {
      const current = await loadRow(companyId, id);
      if (!current) throw notFound("Channel account not found");
      const nextChallenge = input.challengeSecretName !== undefined ? input.challengeSecretName : current.challengeSecretName;
      validateProviderShape({
        provider: current.provider as ChannelProvider,
        kind: current.kind as ChannelKind,
        providerAccountSid: input.providerAccountSid !== undefined ? input.providerAccountSid : current.providerAccountSid,
        challengeSecretName: nextChallenge,
      });
      await assertSecretNamesExist(db, companyId, [
        input.verifySecretName ?? current.verifySecretName,
        input.tokenSecretName ?? current.tokenSecretName,
        ...(nextChallenge ? [nextChallenge] : []),
      ]);

      const [row] = await db
        .update(customerChannelAccounts)
        .set({
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.providerAccountSid !== undefined ? { providerAccountSid: input.providerAccountSid } : {}),
          ...(input.verifySecretName !== undefined ? { verifySecretName: input.verifySecretName } : {}),
          ...(input.challengeSecretName !== undefined ? { challengeSecretName: input.challengeSecretName } : {}),
          ...(input.tokenSecretName !== undefined ? { tokenSecretName: input.tokenSecretName } : {}),
          ...(input.approvedTemplates !== undefined ? { approvedTemplates: input.approvedTemplates } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(customerChannelAccounts.id, id))
        .returning();
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId ?? null,
        action: "customer_channel.updated",
        entityType: "customer_channel_account",
        entityId: id,
        details: { fields: Object.keys(input), status: row.status },
      });
      return toChannelAccountView(row);
    },

    async remove(companyId: string, id: string, actor: ChannelActor): Promise<void> {
      const current = await loadRow(companyId, id);
      if (!current) throw notFound("Channel account not found");
      await db.delete(customerChannelAccounts).where(eq(customerChannelAccounts.id, id));
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId ?? null,
        action: "customer_channel.deleted",
        entityType: "customer_channel_account",
        entityId: id,
        details: { provider: current.provider, kind: current.kind },
      });
    },

    /**
     * Calls a read-only provider endpoint with the account's send credential. A success moves a
     * pending account to active. Failures report the HTTP status only, never the credential.
     */
    async test(companyId: string, id: string, actor: ChannelActor): Promise<{ ok: boolean; status: number | null; detail: string }> {
      const current = await loadRow(companyId, id);
      if (!current) throw notFound("Channel account not found");
      const token = await readCompanySecret(db, companyId, current.tokenSecretName);
      let result: { ok: boolean; status: number | null; detail: string };
      if (!token) {
        result = { ok: false, status: null, detail: "The token secret is empty or missing" };
      } else {
        try {
          const probe = probeRequest(current, token);
          const response = await fetchImpl(probe.url, { method: "GET", headers: probe.headers });
          result = response.ok
            ? { ok: true, status: response.status, detail: "The provider accepted the credentials" }
            : { ok: false, status: response.status, detail: `The provider answered HTTP ${response.status}` };
        } catch {
          result = { ok: false, status: null, detail: "The provider could not be reached" };
        }
      }
      const now = new Date();
      await db
        .update(customerChannelAccounts)
        .set({
          lastTestedAt: now,
          lastTestError: result.ok ? null : result.detail,
          ...(result.ok && current.status === "pending" ? { status: "active" } : {}),
          updatedAt: now,
        })
        .where(eq(customerChannelAccounts.id, id));
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId ?? null,
        action: "customer_channel.tested",
        entityType: "customer_channel_account",
        entityId: id,
        details: { ok: result.ok, status: result.status },
      });
      return result;
    },
  };
}
