import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, principalPermissionGrants } from "@paperclipai/db";
import {
  AGENT_CAPABILITY_PERMISSION_KEYS,
  AGENT_SPECIALTIES,
  agentCapabilityGrantKeys,
  type AgentCapabilities,
  type AgentCapabilitiesResponse,
  type AgentCapabilityAutonomyLevel,
  type AgentProfile,
  type AgentSpecialty,
  type PermissionKey,
} from "@paperclipai/shared";
import { notFound } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { accessService } from "./access.js";
import { autonomyService } from "./autonomy.js";

/**
 * Capabilities of an agent (plan: doc/plans/2026-10-24-capacidades-de-agente.md).
 *
 * A capability is on iff the agent holds the matching `principal_permission_grants`
 * row. The profile (specialty, sectors, code flag) lives in `agents.metadata.profile`.
 * Approval levels stay in `autonomy_policies` and are only read here.
 */

const CAPABILITY_GRANT_KEYS = Object.values(AGENT_CAPABILITY_PERMISSION_KEYS) as PermissionKey[];

export interface AgentCapabilitiesActor {
  actorType: "agent" | "user" | "system" | "plugin";
  actorId: string;
  agentId?: string | null;
  runId?: string | null;
  agentApiKeyId?: string | null;
  /** Board user who makes the change; recorded as `granted_by_user_id`. */
  userId?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isSpecialty(value: unknown): value is AgentSpecialty {
  return typeof value === "string" && (AGENT_SPECIALTIES as readonly string[]).includes(value);
}

/** Reads `metadata.profile` as an AgentProfile, or null when it has no valid specialty. */
export function profileFromMetadata(metadata: unknown): AgentProfile | null {
  const profile = asRecord(asRecord(metadata)?.profile);
  if (!profile || !isSpecialty(profile.specialty)) return null;
  const sectors = Array.isArray(profile.sectors)
    ? profile.sectors.filter((sector): sector is string => typeof sector === "string")
    : [];
  return { specialty: profile.specialty, sectors };
}

/** The `code` flag from `metadata.profile`. Agents without a stored flag keep code enabled. */
export function codeFromMetadata(metadata: unknown): boolean {
  const code = asRecord(asRecord(metadata)?.profile)?.code;
  return typeof code === "boolean" ? code : true;
}

/**
 * Metadata written when an agent is created with explicit capabilities or a profile.
 * `requestedCapabilities` keeps the requested switches until the grants are applied;
 * for a pending hire that happens at activation (see `standardAgentGrantKeysFor`).
 * Returns the input unchanged when neither was given.
 */
export function capabilityMetadataForCreate(
  metadata: Record<string, unknown> | null | undefined,
  capabilities: AgentCapabilities | undefined,
  profile: { specialty: AgentSpecialty; sectors: string[] } | undefined,
): Record<string, unknown> | null | undefined {
  if (!capabilities && !profile) return metadata;
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  const previous = profileFromMetadata(next);
  const code = capabilities?.code ?? codeFromMetadata(next);
  next.profile = {
    specialty: profile?.specialty ?? previous?.specialty ?? "custom",
    sectors: profile?.sectors ?? previous?.sectors ?? [],
    code,
  };
  if (capabilities) {
    next.requestedCapabilities = {
      messages: capabilities.messages,
      calls: capabilities.calls,
      video: capabilities.video,
    };
  }
  return next;
}

function capabilitiesFromGrantKeys(granted: Set<string>): AgentCapabilities {
  return {
    messages: granted.has(AGENT_CAPABILITY_PERMISSION_KEYS.messages),
    calls: granted.has(AGENT_CAPABILITY_PERMISSION_KEYS.calls),
    video: granted.has(AGENT_CAPABILITY_PERMISSION_KEYS.video),
    code: false,
  };
}

export function agentCapabilitiesService(db: Db) {
  const access = accessService(db);
  const autonomy = autonomyService(db);

  async function loadAgent(companyId: string, agentId: string) {
    const agent = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!agent) throw notFound("Agent not found");
    return agent;
  }

  async function grantedKeys(companyId: string, agentId: string): Promise<Set<string>> {
    const rows = await db
      .select({ permissionKey: principalPermissionGrants.permissionKey })
      .from(principalPermissionGrants)
      .where(and(
        eq(principalPermissionGrants.companyId, companyId),
        eq(principalPermissionGrants.principalType, "agent"),
        eq(principalPermissionGrants.principalId, agentId),
        inArray(principalPermissionGrants.permissionKey, CAPABILITY_GRANT_KEYS),
      ));
    return new Set(rows.map((row) => row.permissionKey));
  }

  async function readCurrent(companyId: string, agentId: string) {
    const agent = await loadAgent(companyId, agentId);
    const granted = await grantedKeys(companyId, agentId);
    const capabilities = { ...capabilitiesFromGrantKeys(granted), code: codeFromMetadata(agent.metadata) };
    return { agent, capabilities, profile: profileFromMetadata(agent.metadata) };
  }

  /**
   * Makes the capability grants of an agent match `capabilities`: inserts the missing
   * grants and deletes the revoked ones. Writes no activity; `apply` does.
   */
  async function syncGrants(
    companyId: string,
    agentId: string,
    capabilities: AgentCapabilities,
    grantedByUserId: string | null,
  ): Promise<{ added: PermissionKey[]; removed: PermissionKey[] }> {
    const wanted = new Set<string>(agentCapabilityGrantKeys(capabilities));
    const current = await grantedKeys(companyId, agentId);
    const added: PermissionKey[] = [];
    const removed: PermissionKey[] = [];
    for (const key of CAPABILITY_GRANT_KEYS) {
      const has = current.has(key);
      const want = wanted.has(key);
      if (want && !has) {
        await access.setPrincipalPermission(companyId, "agent", agentId, key, true, grantedByUserId);
        added.push(key);
      } else if (!want && has) {
        await access.setPrincipalPermission(companyId, "agent", agentId, key, false, grantedByUserId);
        removed.push(key);
      }
    }
    return { added, removed };
  }

  async function autonomyLevels(companyId: string, agentId: string): Promise<AgentCapabilitiesResponse["autonomy"]> {
    const [message, email, call] = await Promise.all([
      autonomy.effectiveLevel(companyId, agentId, "message"),
      autonomy.effectiveLevel(companyId, agentId, "email"),
      autonomy.effectiveLevel(companyId, agentId, "call"),
    ]);
    return {
      message: message.level as AgentCapabilityAutonomyLevel,
      email: email.level as AgentCapabilityAutonomyLevel,
      call: call.level as AgentCapabilityAutonomyLevel,
    };
  }

  return {
    /** Grant-backed capabilities, profile and approval levels of one agent. */
    async get(companyId: string, agentId: string): Promise<AgentCapabilitiesResponse> {
      const { capabilities, profile } = await readCurrent(companyId, agentId);
      return {
        profile,
        capabilities,
        autonomy: await autonomyLevels(companyId, agentId),
      };
    },

    /**
     * Replaces the capabilities (and the profile when given), records an
     * `agent.capabilities_updated` activity with before/after, and returns the new view.
     */
    async apply(
      companyId: string,
      agentId: string,
      capabilities: AgentCapabilities,
      profile: { specialty: AgentSpecialty; sectors: string[] } | undefined,
      actor: AgentCapabilitiesActor,
    ): Promise<AgentCapabilitiesResponse> {
      const before = await readCurrent(companyId, agentId);
      const { added, removed } = await syncGrants(companyId, agentId, capabilities, actor.userId ?? null);

      const metadata = { ...(asRecord(before.agent.metadata) ?? {}) };
      const nextMetadata: Record<string, unknown> = {
        ...metadata,
        profile: {
          specialty: profile?.specialty ?? before.profile?.specialty ?? "custom",
          sectors: profile?.sectors ?? before.profile?.sectors ?? [],
          code: capabilities.code,
        },
      };
      // The grants are the source of truth now; drop the creation snapshot.
      delete nextMetadata.requestedCapabilities;
      await db
        .update(agents)
        .set({ metadata: nextMetadata, updatedAt: new Date() })
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)));

      const after = await readCurrent(companyId, agentId);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId ?? null,
        runId: actor.runId ?? null,
        agentApiKeyId: actor.agentApiKeyId ?? null,
        action: "agent.capabilities_updated",
        entityType: "agent",
        entityId: agentId,
        details: {
          before: { capabilities: before.capabilities, profile: before.profile },
          after: { capabilities: after.capabilities, profile: after.profile },
          grantsAdded: added,
          grantsRemoved: removed,
        },
      });

      return {
        profile: after.profile,
        capabilities: after.capabilities,
        autonomy: await autonomyLevels(companyId, agentId),
      };
    },

    syncGrants,
  };
}
