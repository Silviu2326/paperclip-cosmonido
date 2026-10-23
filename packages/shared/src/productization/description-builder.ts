import { z } from "zod";
import { decisionRequestSchema } from "../decision-models.js";

export const BUILDER_AUTONOMY_LEVELS = ["draft_only", "send_with_approval", "send_direct"] as const;
/** The copilot may only request these levels; `send_direct` is always a human choice. */
export const COPILOT_PROPOSABLE_AUTONOMY = ["draft_only", "send_with_approval"] as const;
export const COPILOT_ROLE_CATALOG = [
  { id: "sales_lead", label: "Responsable de ventas", hint: "Cualifica leads, prepara propuestas y hace seguimiento comercial." },
  { id: "customer_support", label: "Atención al cliente", hint: "Responde consultas y escala incidencias a una persona." },
  { id: "content_marketing", label: "Contenido y marketing", hint: "Prepara publicaciones y campañas para revisión." },
  { id: "operations_assistant", label: "Asistente de operaciones", hint: "Coordina tareas internas, reservas y seguimiento." },
] as const;
export const COPILOT_BUDGET_TIERS_USD = [0, 25, 100, 250] as const;
export const COPILOT_ROUTINE_TEMPLATES = ["daily_brief", "lead_notification"] as const;
export const COPILOT_PROPOSAL_FEATURE = "productization.builder.copilot";
export const COPILOT_SANDBOX_FEATURE = "productization.builder.sandbox";

export const builderSelectionSchema = z.object({
  role: z.string().trim().min(1).max(120),
  skillIds: z.array(z.string().uuid()).max(50),
  connectionIds: z.array(z.string().uuid()).max(50),
  autonomy: z.enum(BUILDER_AUTONOMY_LEVELS),
  monthlyBudgetUsd: z.number().finite().min(0).max(1_000_000),
}).strict().superRefine((selection, ctx) => {
  if (new Set(selection.skillIds).size !== selection.skillIds.length) ctx.addIssue({ code: "custom", path: ["skillIds"], message: "Skill IDs must be unique" });
  if (new Set(selection.connectionIds).size !== selection.connectionIds.length) ctx.addIssue({ code: "custom", path: ["connectionIds"], message: "Connection IDs must be unique" });
});

export const builderPlanSchema = z.object({
  routines: z.array(z.object({
    template: z.enum(COPILOT_ROUTINE_TEMPLATES),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }).strict()).max(COPILOT_ROUTINE_TEMPLATES.length),
  playbookId: z.string().uuid().nullable(),
}).strict().superRefine((plan, ctx) => {
  if (new Set(plan.routines.map((routine) => routine.template)).size !== plan.routines.length) ctx.addIssue({ code: "custom", path: ["routines"], message: "Routine templates must be unique" });
});

// Provider answers are stored exactly as returned; unknown extra keys are dropped on read instead of breaking the journey.
const probabilities = z.record(z.string(), z.number().finite()).optional();
export const builderModelAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("boolean"), probability: z.number().finite(), confidence: z.number().finite().optional() }),
  z.object({ type: z.literal("choice"), choice: z.string().max(200), probabilities, confidence: z.number().finite().optional() }),
  z.object({ type: z.literal("score"), score: z.number().finite(), probabilities, confidence: z.number().finite().optional() }),
]);
const usageSchema = z.object({
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costCents: z.string().max(40).nullable(),
  costStatus: z.enum(["reported", "estimated", "unpriced"]),
});
const requestSnapshotSchema = decisionRequestSchema.refine((request) => JSON.stringify(request).length <= 24_000, "Stored model request is too large");

/** Exact request sent to and answers received from the configured decision model. Never synthesized locally. */
export const builderProposalSchema = z.object({
  idempotencyKey: z.string().uuid(),
  inputHash: z.string().length(64).optional(),
  message: z.string().trim().min(1).max(2000),
  feature: z.literal(COPILOT_PROPOSAL_FEATURE),
  invocationId: z.string().uuid(),
  provider: z.string().max(60).nullable(),
  model: z.string().max(120).nullable(),
  decidedAt: z.string().datetime({ offset: true }),
  catalogDigest: z.string().max(80),
  request: requestSnapshotSchema,
  answers: z.record(z.string(), builderModelAnswerSchema),
  usage: usageSchema,
  baseline: z.object({ draftId: z.string().uuid(), version: z.number().int().positive() }).strict().nullable(),
}).strict();

export const builderDraftVersionSchema = z.object({
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  description: z.string().trim().min(1).max(4000),
  selection: builderSelectionSchema,
  provenance: z.enum(["human_supplied", "model_proposed"]),
  plan: builderPlanSchema.optional(),
  proposal: builderProposalSchema.optional(),
  clonedFrom: z.object({ draftId: z.string().uuid(), version: z.number().int().positive() }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.provenance === "model_proposed") !== Boolean(value.proposal)) ctx.addIssue({ code: "custom", path: ["proposal"], message: "Model-proposed versions must carry their exact model provenance, and human versions must not" });
});

const changeSchema = z.object({
  changeId: z.string().min(1).max(60),
  kind: z.enum(["routine", "channel_request", "request_only"]),
  status: z.enum(["ready", "blocked", "request_only"]),
  summary: z.string().max(300),
  blocker: z.string().max(300).optional(),
  diff: z.array(z.string().max(300)).max(12),
  spec: z.object({ routine: z.record(z.string(), z.json()), trigger: z.record(z.string(), z.json()) }).optional(),
}).strict();
const resultSchema = z.object({
  changeId: z.string().min(1).max(60),
  outcome: z.enum(["created", "failed", "skipped_existing"]),
  routineId: z.string().uuid().optional(),
  triggerId: z.string().max(80).optional(),
  error: z.string().max(500).optional(),
  recordedAt: z.string().datetime({ offset: true }),
}).strict();

/** A governed change set pinned to one immutable version. Created objects still go through the user's own API permissions. */
export const builderApplicationSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  assigneeAgentId: z.string().uuid(),
  timezone: z.string().min(1).max(80),
  changes: z.array(changeSchema).max(8),
  results: z.array(resultSchema).max(8),
}).strict();

export const builderSandboxRunSchema = z.object({
  idempotencyKey: z.string().uuid(),
  inputHash: z.string().length(64).optional(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  scenario: z.string().trim().min(1).max(1000),
  feature: z.literal(COPILOT_SANDBOX_FEATURE),
  invocationId: z.string().uuid(),
  provider: z.string().max(60).nullable(),
  model: z.string().max(120).nullable(),
  request: requestSnapshotSchema,
  answers: z.record(z.string(), builderModelAnswerSchema),
  usage: usageSchema,
  toolsExecuted: z.literal(false),
  sideEffects: z.literal(false),
  qualifiesAutonomy: z.literal(false),
}).strict();

export const builderDraftSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  versions: z.array(builderDraftVersionSchema).min(1).max(10),
  applications: z.array(builderApplicationSchema).max(20).optional(),
  sandboxRuns: z.array(builderSandboxRunSchema).max(10).optional(),
}).strict();

export const builderDraftsSchema = z.array(builderDraftSchema).max(20);

export const builderDraftRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  draftId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(4000),
  selection: builderSelectionSchema,
}).strict();

export const builderCloneRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  sourceVersion: z.number().int().positive(),
}).strict();

export const builderConfigurationPreviewRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  draftId: z.string().uuid(),
  version: z.number().int().positive(),
}).strict();

export const copilotProposalRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  draftId: z.string().uuid().optional(),
  baseVersion: z.number().int().positive().optional(),
  message: z.string().trim().min(1).max(2000),
}).strict().refine((value) => (value.baseVersion === undefined) || Boolean(value.draftId), { path: ["baseVersion"], message: "baseVersion requires draftId" });

export const copilotApplyPlanRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  draftId: z.string().uuid(),
  version: z.number().int().positive(),
  assigneeAgentId: z.string().uuid(),
  timezone: z.string().trim().min(1).max(80),
}).strict();

/** The client selects a pinned change; only the server writes execution receipts. */
export const copilotApplyChangeRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  draftId: z.string().uuid(), applicationId: z.string().uuid(),
  changeId: z.string().min(1).max(60),
}).strict();
export type CopilotApplyChangeRequest = z.infer<typeof copilotApplyChangeRequestSchema>;

export const copilotSandboxRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  draftId: z.string().uuid(),
  version: z.number().int().positive(),
  scenario: z.string().trim().min(1).max(1000),
}).strict();

export type BuilderSelection = z.infer<typeof builderSelectionSchema>;
export type BuilderPlan = z.infer<typeof builderPlanSchema>;
export type BuilderProposal = z.infer<typeof builderProposalSchema>;
export type BuilderDraftVersion = z.infer<typeof builderDraftVersionSchema>;
export type BuilderApplication = z.infer<typeof builderApplicationSchema>;
export type BuilderApplicationChange = z.infer<typeof changeSchema>;
export type BuilderSandboxRun = z.infer<typeof builderSandboxRunSchema>;
export type BuilderDraft = z.infer<typeof builderDraftSchema>;
export type CopilotProposalRequest = z.infer<typeof copilotProposalRequestSchema>;
export type CopilotApplyPlanRequest = z.infer<typeof copilotApplyPlanRequestSchema>;
export type CopilotSandboxRequest = z.infer<typeof copilotSandboxRequestSchema>;
export type CopilotOutcome<T> =
  | ({ status: "saved" } & T)
  | { status: "unavailable"; reason: string; invocationId?: string }
  | { status: "failed"; errorCode: string; invocationId?: string };
