import { z } from "zod";

const text = z.string().trim().min(1).max(12000);
const httpsUrl = z.string().url().max(2000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS URL without credentials");

export const autopilotConfigSchema = z.object({
  enabled: z.boolean().default(false),
  objective: text,
  productContext: z.string().max(20000).default(""),
  plannerAgentId: z.string().uuid(),
  builderAgentId: z.string().uuid(),
  reviewerAgentId: z.string().uuid(),
  fallbackAgentId: z.string().uuid().nullable().default(null),
  selectionMode: z.enum(["manual", "automatic"]).default("manual"),
  automaticMaxRisk: z.enum(["low", "medium"]).default("low"),
  allowPush: z.boolean().default(true),
  allowProductionDeploy: z.boolean().default(false),
  reservePercent: z.number().min(0).max(90).default(15),
  intervalMinutes: z.number().int().min(15).max(10080).default(360),
  maxCyclesPerDay: z.number().int().min(1).max(24).default(3),
  maxRevisionAttempts: z.number().int().min(0).max(5).default(2),
  deploymentTargets: z.array(z.object({
    provider: z.enum(["vercel", "railway"]),
    projectWorkspaceId: z.string().uuid(),
    projectRef: z.string().trim().min(1).max(255),
    environment: z.string().trim().min(1).max(255).default("preview"),
    serviceRef: z.string().trim().max(255).default(""),
    healthUrl: httpsUrl.optional(),
  }).strict()).max(20).default([]),
}).strict();
export type AutopilotConfig = z.infer<typeof autopilotConfigSchema>;

export const autopilotPlanSchema = z.object({
  id: z.enum(["essential", "balanced", "ambitious"]),
  title: z.string().trim().min(1).max(200),
  problem: text,
  benefit: text,
  evidence: z.array(text).min(1).max(12),
  assumptions: z.array(text).max(12),
  effort: text,
  risk: z.enum(["low", "medium", "high"]),
  acceptanceCriteria: z.array(text).min(1).max(20),
  steps: z.array(text).min(1).max(20),
  workspaceIds: z.array(z.string().uuid()).min(1).max(20),
}).strict();
export type AutopilotPlan = z.infer<typeof autopilotPlanSchema>;

export const autopilotPlansSchema = z.object({
  issueId: z.string().uuid(),
  summary: text,
  recommendedPlanId: z.enum(["essential", "balanced", "ambitious"]),
  plans: z.array(autopilotPlanSchema).min(3).max(3).refine(
    (plans) => new Set(plans.map((plan) => plan.id)).size === 3,
    "Provide one essential, one balanced and one ambitious plan",
  ),
}).strict();

export const autopilotReportSchema = z.object({
  issueId: z.string().uuid(),
  outcome: z.enum(["passed", "changes_requested", "blocked"]),
  summary: text,
  evidence: z.array(z.object({ label: text, detail: text, url: httpsUrl.optional() }).strict()).min(1).max(30),
  commits: z.array(z.object({
    workspaceId: z.string().uuid(),
    sha: z.string().regex(/^[a-f0-9]{40}$/i),
    branch: z.string().trim().min(1).max(255),
    url: httpsUrl.optional(),
  }).strict()).max(20).default([]),
  deployments: z.array(z.object({
    provider: z.enum(["vercel", "railway"]),
    workspaceId: z.string().uuid(),
    projectRef: z.string().min(1).max(255),
    environment: z.string().min(1).max(255),
    serviceRef: z.string().max(255).default(""),
    deploymentRef: z.string().min(1).max(255),
    sourceSha: z.string().regex(/^[a-f0-9]{40}$/i),
    status: z.enum(["ready", "failed", "building"]),
    health: z.enum(["passed", "failed", "not_checked"]),
    url: httpsUrl,
  }).strict()).max(20).default([]),
}).strict();
export type AutopilotReport = z.infer<typeof autopilotReportSchema>;
export type AutopilotPhase = "planning" | "implementation" | "review" | "verification";
export type AutopilotStatus = "idle" | "planning" | "awaiting_selection" | "implementing" | "reviewing" | "verifying" | "waiting_capacity" | "blocked" | "completed";
export interface AutopilotEvent { at: string; message: string; issueId?: string; }
export interface AutopilotState {
  status: AutopilotStatus;
  phase: AutopilotPhase;
  cycle: number;
  day: string;
  cyclesToday: number;
  revisionAttempts: number;
  activeIssueId: string | null;
  selectedPlanId: AutopilotPlan["id"] | null;
  recommendedPlanId: AutopilotPlan["id"] | null;
  plans: AutopilotPlan[];
  summary: string;
  reports: Array<AutopilotReport & { agentId: string; at: string; runId: string; cycle: number; phase: AutopilotPhase }>;
  feedback: Array<{ at: string; text: string }>;
  events: AutopilotEvent[];
  capacity?: { agentId: string; observedAt: string; available: boolean; known: boolean; retryAt: string | null };
}
export interface ProjectAutopilot {
  projectId: string;
  companyId: string;
  enabled: boolean;
  config: AutopilotConfig;
  state: AutopilotState;
  revision: number;
  nextTickAt: string | Date;
  updatedAt: string | Date;
}
export function initialAutopilotState(): AutopilotState {
  return { status: "idle", phase: "planning", cycle: 0, day: "", cyclesToday: 0,
    revisionAttempts: 0, activeIssueId: null, selectedPlanId: null,
    recommendedPlanId: null, plans: [], summary: "", reports: [], feedback: [], events: [] };
}

/** Capacity must belong to the selected account; unknown is never invented availability. */
export function autopilotCapacity(windows: Array<{ usedPercent: number | null; resetsAt: string | null }>, reservePercent: number, now = Date.now()) {
  const exhausted = windows.filter((window) => window.usedPercent !== null && window.usedPercent >= 100 - reservePercent);
  const resets = exhausted.map((window) => Date.parse(window.resetsAt ?? "")).filter((value) => Number.isFinite(value) && value > now);
  return { available: exhausted.length === 0, retryAt: resets.length ? new Date(Math.max(...resets)).toISOString() : null };
}

export function validateAutopilotVerification(config: AutopilotConfig, implementation: AutopilotReport | undefined, report: AutopilotReport): string[] {
  if (report.outcome !== "passed") return [];
  return config.deploymentTargets.flatMap((target) => {
    const commit = implementation?.commits.find((item) => item.workspaceId === target.projectWorkspaceId);
    const deployment = report.deployments.find((item) => item.provider === target.provider && item.workspaceId === target.projectWorkspaceId
      && item.projectRef === target.projectRef && item.environment === target.environment && item.serviceRef === target.serviceRef);
    if (!commit || !deployment || deployment.sourceSha.toLowerCase() !== commit.sha.toLowerCase()
      || deployment.status !== "ready" || deployment.health !== "passed") {
      return [`${target.provider}/${target.projectRef}: require the implementation commit, ready deployment and successful health check for the configured target`];
    }
    return [];
  });
}
