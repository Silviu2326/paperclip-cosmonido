import { z } from "zod";
import type { PermissionKey } from "./constants.js";
import type { ConversationChannel } from "./constants/crm.js";

/**
 * What an agent is for and what it may do (plan: doc/plans/2026-10-24-capacidades-de-agente.md).
 *
 * - `messages` and `calls` are company permission grants per agent
 *   (`principal_permission_grants`). Media actions use individual grants; `video`
 *   remains a compatibility aggregate for older clients.
 *   Outbound CRM conversation channels can additionally be restricted by the
 *   optional `profile.messageChannels` allowlist; absence keeps legacy behavior.
 *   A missing grant means the agent may not do it. The approval level of a message or call
 *   (draft_only / send_with_approval / send_direct) stays in `autonomy_policies`; raising it
 *   above draft_only needs a passing autonomy bench, so the creation wizard only offers on/off.
 * - `code` remains a legacy profile flag. Enforced work restrictions live in
 *   `profile.workPermissions` and `profile.codeAdapterAccess`.
 * - The specialty and sectors live in `agents.metadata.profile`.
 */

export const AGENT_CAPABILITY_KEYS = ["messages", "calls", "video", "mediaAnalyze", "mediaEdit", "mediaCreateVideo", "code"] as const;
export type AgentCapabilityKey = (typeof AGENT_CAPABILITY_KEYS)[number];

export interface AgentCapabilities {
  /** May write to people and customers (email, WhatsApp, chat, SMS). */
  messages: boolean;
  /** May make phone calls. */
  calls: boolean;
  /** May generate and edit video and other media. */
  video: boolean;
  /** May analyze existing audio/video (transcription and detection). */
  mediaAnalyze: boolean;
  /** May edit and render existing media projects. */
  mediaEdit: boolean;
  /** May create a video from a structured specification and authorized assets. */
  mediaCreateVideo: boolean;
  /** Legacy role indicator; enforcement uses the explicit profile work policy. */
  code: boolean;
}

const agentCapabilitiesInputSchema = z.object({
  messages: z.boolean(),
  calls: z.boolean(),
  video: z.boolean(),
  mediaAnalyze: z.boolean().optional(),
  mediaEdit: z.boolean().optional(),
  mediaCreateVideo: z.boolean().optional(),
  code: z.boolean(),
}).strict();

/** Accepts the pre-action `video` switch from older clients and expands it on writes. */
export const agentCapabilitiesSchema = agentCapabilitiesInputSchema.transform((value) => ({
  ...value,
  mediaAnalyze: value.mediaAnalyze ?? value.video,
  mediaEdit: value.mediaEdit ?? value.video,
  mediaCreateVideo: value.mediaCreateVideo ?? value.video,
}));

/** Everything on: what agents could do before capabilities existed, and the default when none is given. */
export const ALL_AGENT_CAPABILITIES_ENABLED: AgentCapabilities = {
  messages: true,
  calls: true,
  video: true,
  mediaAnalyze: true,
  mediaEdit: true,
  mediaCreateVideo: true,
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

/** CRM channels with an outbound conversation transport. Voice uses call permissions instead. */
export const AGENT_MESSAGE_CHANNELS = [
  "email",
  "whatsapp",
  "messenger",
  "instagram",
  "telegram",
  "webchat",
  "sms",
] as const satisfies readonly ConversationChannel[];
export type AgentMessageChannel = (typeof AGENT_MESSAGE_CHANNELS)[number];

export const AGENT_WORK_PERMISSION_KEYS = [
  "workspaceRead", "workspaceWrite", "workspaceExecute", "tasksRead", "tasksCreate", "tasksUpdate", "tasksAssign", "projectsRead", "projectsManage", "documentsRead", "documentsWrite",
] as const;
export type AgentWorkPermission = (typeof AGENT_WORK_PERMISSION_KEYS)[number];
export type AgentWorkPermissions = Record<AgentWorkPermission, boolean>;
export const agentWorkPermissionsSchema = z.object({
  workspaceRead: z.boolean(), workspaceWrite: z.boolean(), workspaceExecute: z.boolean(),
  tasksRead: z.boolean(), tasksCreate: z.boolean(), tasksUpdate: z.boolean(), tasksAssign: z.boolean(),
  projectsRead: z.boolean(), projectsManage: z.boolean(), documentsRead: z.boolean(), documentsWrite: z.boolean(),
}).strict().refine(value => !value.workspaceExecute || (value.workspaceRead && value.workspaceWrite), {
  message: "Command execution requires workspace read and write access.", path: ["workspaceExecute"],
});
export const ALL_AGENT_WORK_PERMISSIONS: AgentWorkPermissions = Object.fromEntries(AGENT_WORK_PERMISSION_KEYS.map(key => [key, true])) as AgentWorkPermissions;
export function defaultAgentWorkPermissions(specialty: AgentSpecialty): AgentWorkPermissions {
  const software = specialty === "software";
  const operations = specialty === "operations";
  return {
    workspaceRead: software, workspaceWrite: software, workspaceExecute: software,
    tasksRead: true, tasksCreate: software || operations, tasksUpdate: software || operations, tasksAssign: false,
    projectsRead: true, projectsManage: operations, documentsRead: true, documentsWrite: software || operations,
  };
}

export function workPermissionsForSpecialty(value: AgentWorkPermissions, specialty: AgentSpecialty): AgentWorkPermissions {
  if (specialty === "software" || specialty === "custom") return { ...value };
  const next = { ...value, workspaceRead: false, workspaceWrite: false, workspaceExecute: false };
  if (specialty !== "operations") {
    next.tasksCreate = false; next.tasksUpdate = false; next.tasksAssign = false;
    next.projectsManage = false; next.documentsWrite = false;
  }
  return next;
}

/** Stored in `agents.metadata.profile`. */
export interface AgentProfile {
  specialty: AgentSpecialty;
  workPermissions?: AgentWorkPermissions;
  codeAdapterAccess?: "read_only" | "workspace_write" | null;
  sectors: string[];
  /** Optional allowlist for outbound CRM conversation channels. Missing means legacy unrestricted. */
  messageChannels?: AgentMessageChannel[];
}

export const agentProfileSchema = z.object({
  workPermissions: agentWorkPermissionsSchema.optional(),
  codeAdapterAccess: z.enum(["read_only", "workspace_write"]).nullable().optional(),
  specialty: agentSpecialtySchema,
  sectors: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  messageChannels: z.array(z.enum(AGENT_MESSAGE_CHANNELS)).max(AGENT_MESSAGE_CHANNELS.length).optional(),
});

/** Initial selections for each specialty. Available options are defined by AGENT_SPECIALTY_CAPABILITIES. */
export const AGENT_SPECIALTY_PRESETS: Record<AgentSpecialty, { capabilities: AgentCapabilities }> = {
  customer_care: { capabilities: { messages: true, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: false } },
  sales: { capabilities: { messages: true, calls: true, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: false } },
  video_content: { capabilities: { messages: false, calls: false, video: true, mediaAnalyze: true, mediaEdit: true, mediaCreateVideo: true, code: false } },
  software: { capabilities: { messages: false, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: true } },
  operations: { capabilities: { messages: false, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: false } },
  custom: { capabilities: { messages: false, calls: false, video: false, mediaAnalyze: false, mediaEdit: false, mediaCreateVideo: false, code: false } },
};

/** Available permission options per agent specialty; presets only decide initial values. */
export const AGENT_SPECIALTY_CAPABILITIES: Record<AgentSpecialty, readonly AgentCapabilityKey[]> = {
  customer_care: ["messages", "calls"],
  sales: ["messages", "calls"],
  video_content: ["mediaAnalyze", "mediaEdit", "mediaCreateVideo"],
  software: ["code"],
  operations: [],
  custom: ["messages", "calls", "mediaAnalyze", "mediaEdit", "mediaCreateVideo", "code"],
};

/** Explicit saves remove permissions outside the selected specialty. Reads preserve legacy grants. */
export function capabilitiesForSpecialty(capabilities: AgentCapabilities, specialty: AgentSpecialty): AgentCapabilities {
  const allowed = AGENT_SPECIALTY_CAPABILITIES[specialty];
  const next = { ...capabilities };
  for (const key of AGENT_CAPABILITY_KEYS) next[key] = key !== "video" && allowed.includes(key) && capabilities[key];
  next.video = next.mediaAnalyze || next.mediaEdit || next.mediaCreateVideo;
  return next;
}

/** Suggested conversation channels; these never create the separate provider connection. */
export const AGENT_SPECIALTY_MESSAGE_CHANNEL_PRESETS: Record<AgentSpecialty, AgentMessageChannel[]> = {
  customer_care: ["email", "whatsapp", "webchat"],
  sales: ["email", "whatsapp"],
  video_content: [],
  software: [],
  operations: [],
  custom: [],
};

/** The permission grant behind each enforced capability. */
export const AGENT_CAPABILITY_PERMISSION_KEYS = {
  messages: "channels:message",
  calls: "channels:call",
  video: "media:generate",
  mediaAnalyze: "media:analyze",
  mediaEdit: "media:edit",
  mediaCreateVideo: "media:create_video",
} as const satisfies Record<"messages" | "calls" | "video" | "mediaAnalyze" | "mediaEdit" | "mediaCreateVideo", PermissionKey>;

/** Grants an agent needs for a set of capabilities. */
export function agentCapabilityGrantKeys(capabilities: AgentCapabilities): PermissionKey[] {
  const grants: PermissionKey[] = [];
  if (capabilities.messages) grants.push(AGENT_CAPABILITY_PERMISSION_KEYS.messages);
  if (capabilities.calls) grants.push(AGENT_CAPABILITY_PERMISSION_KEYS.calls);
  if (capabilities.mediaAnalyze) grants.push(AGENT_CAPABILITY_PERMISSION_KEYS.mediaAnalyze);
  if (capabilities.mediaEdit) grants.push(AGENT_CAPABILITY_PERMISSION_KEYS.mediaEdit);
  if (capabilities.mediaCreateVideo) grants.push(AGENT_CAPABILITY_PERMISSION_KEYS.mediaCreateVideo);
  return grants;
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
  workPermissionSupport?: { workspace: boolean; commands: boolean; codexFilesystem?: boolean };
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
