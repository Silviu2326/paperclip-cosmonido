import { z } from "zod";
import type { PermissionKey } from "./constants.js";

/**
 * What an agent is for and what it may do (plan: doc/plans/2026-10-24-capacidades-de-agente.md).
 *
 * - `messages`, `calls` and `video` are company permission grants per agent
 *   (`principal_permission_grants`): `channels:message`, `channels:call`, `media:generate`.
 *   A missing grant means the agent may not do it. The approval level of a message or call
 *   (draft_only / send_with_approval / send_direct) stays in `autonomy_policies`; raising it
 *   above draft_only needs a passing autonomy bench, so the creation wizard only offers on/off.
 * - `code` is a profile flag stored with the specialty; nothing enforces it yet.
 * - The specialty and sectors live in `agents.metadata.profile`.
 */

export const AGENT_CAPABILITY_KEYS = ["messages", "calls", "video", "code"] as const;
export type AgentCapabilityKey = (typeof AGENT_CAPABILITY_KEYS)[number];

export interface AgentCapabilities {
  /** May write to people and customers (email, WhatsApp, chat, SMS). */
  messages: boolean;
  /** May make phone calls. */
  calls: boolean;
  /** May generate and edit video and other media. */
  video: boolean;
  /** Works on code and repositories (profile only, not enforced). */
  code: boolean;
}

export const agentCapabilitiesSchema = z.object({
  messages: z.boolean(),
  calls: z.boolean(),
  video: z.boolean(),
  code: z.boolean(),
}).strict();

/** Everything on: what agents could do before capabilities existed, and the default when none is given. */
export const ALL_AGENT_CAPABILITIES_ENABLED: AgentCapabilities = {
  messages: true,
  calls: true,
  video: true,
  code: true,
};

export const AGENT_SPECIALTIES = [
  "customer_care",
  "sales",
  "video_content",
  "software",
  "operations",
  "custom",
] as const;
export type AgentSpecialty = (typeof AGENT_SPECIALTIES)[number];
export const agentSpecialtySchema = z.enum(AGENT_SPECIALTIES);

/** Stored in `agents.metadata.profile`. */
export interface AgentProfile {
  specialty: AgentSpecialty;
  sectors: string[];
}

export const agentProfileSchema = z.object({
  specialty: agentSpecialtySchema,
  sectors: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
});

/** Default capabilities for each specialty. The user can change every switch afterwards. */
export const AGENT_SPECIALTY_PRESETS: Record<AgentSpecialty, { capabilities: AgentCapabilities }> = {
  customer_care: { capabilities: { messages: true, calls: false, video: false, code: false } },
  sales: { capabilities: { messages: true, calls: true, video: false, code: false } },
  video_content: { capabilities: { messages: false, calls: false, video: true, code: false } },
  software: { capabilities: { messages: false, calls: false, video: false, code: true } },
  operations: { capabilities: { messages: false, calls: false, video: false, code: false } },
  custom: { capabilities: { messages: false, calls: false, video: false, code: false } },
};

/** The permission grant behind each enforced capability. */
export const AGENT_CAPABILITY_PERMISSION_KEYS = {
  messages: "channels:message",
  calls: "channels:call",
  video: "media:generate",
} as const satisfies Record<"messages" | "calls" | "video", PermissionKey>;

/** Grants an agent needs for a set of capabilities. */
export function agentCapabilityGrantKeys(capabilities: AgentCapabilities): PermissionKey[] {
  return (Object.keys(AGENT_CAPABILITY_PERMISSION_KEYS) as Array<keyof typeof AGENT_CAPABILITY_PERMISSION_KEYS>)
    .filter((key) => capabilities[key])
    .map((key) => AGENT_CAPABILITY_PERMISSION_KEYS[key]);
}

/** Capability that an external action type (see EXTERNAL_ACTION_TYPES) needs from an agent actor. */
export const EXTERNAL_ACTION_CAPABILITY_PERMISSION: Readonly<Record<string, PermissionKey>> = {
  email: "channels:message",
  message: "channels:message",
  call: "channels:call",
};

export type AgentCapabilityAutonomyLevel = "draft_only" | "send_with_approval" | "send_direct";

/** `GET /agents/:id/capabilities` */
export interface AgentCapabilitiesResponse {
  profile: AgentProfile | null;
  capabilities: AgentCapabilities;
  /** Effective approval level of each outward action, read from the autonomy policies. */
  autonomy: { message: AgentCapabilityAutonomyLevel; email: AgentCapabilityAutonomyLevel; call: AgentCapabilityAutonomyLevel };
}

/** `PUT /agents/:id/capabilities` (board only). */
export const updateAgentCapabilitiesSchema = z.object({
  capabilities: agentCapabilitiesSchema,
  profile: agentProfileSchema.optional(),
});
export type UpdateAgentCapabilities = z.infer<typeof updateAgentCapabilitiesSchema>;
