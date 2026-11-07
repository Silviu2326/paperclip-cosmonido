import { z } from "zod";
import {
  ONBOARDING_JOURNEY_VERSION,
  isValidOnboardingTimestamp,
  type OnboardingJourney,
  type OnboardingPath,
} from "./onboarding-journey.js";
import { builderDraftsSchema } from "./description-builder.js";

export const onboardingPathSchema = z.enum(["entrepreneur", "agency", "commercial"]);
const timestampSchema = z.string().refine(isValidOnboardingTimestamp, "Expected canonical UTC timestamp");
const safeHttpUrlSchema = z.string().max(2048).url().refine((value) => {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password;
  } catch { return false; }
}, "Expected an HTTP(S) URL without embedded credentials");
const evidenceSchema = z.object({ at: timestampSchema, reference: z.string().min(1) }).strict();
const connectionSnapshotSchema = z.object({ connectionId: z.string().min(1), checkedAt: timestampSchema, evidenceReference: z.string().min(1) }).strict();
const connectionSchema = z.object({
  id: z.string().min(1),
  stage: z.enum(["available", "connected", "authorized", "checked"]),
  checkEvidence: evidenceSchema.optional(),
  invalidatedAt: evidenceSchema.optional(),
  checkHistory: z.array(evidenceSchema).optional(),
  invalidationHistory: z.array(evidenceSchema).optional(),
}).strict();

export const onboardingJourneySchema = z.object({
  version: z.literal(ONBOARDING_JOURNEY_VERSION),
  id: z.string().uuid(),
  accountId: z.string().min(1).nullable(),
  companyId: z.string().uuid(),
  path: onboardingPathSchema,
  createdAt: timestampSchema,
  currentStep: z.enum(["business", "context", "connections", "team", "activation", "first_job", "complete"]).optional(),
  business: z.object({
    url: safeHttpUrlSchema.optional(),
    suggestedBusinessName: z.string().optional(),
    suggestedOffer: z.string().optional(),
    confirmedBusinessName: z.string().optional(),
    confirmedOffer: z.string().optional(),
    confirmation: evidenceSchema.optional(),
  }).strict().optional(),
  context: z.object({ audience: z.string(), desiredOutcome: z.string(), constraints: z.string().optional(), confirmation: evidenceSchema }).strict().optional(),
  connections: z.array(connectionSchema),
  team: z.object({
    agentIds: z.array(z.string().uuid()).optional(),
    installed: evidenceSchema.optional(),
    installedConnections: z.array(connectionSnapshotSchema).optional(),
    activated: evidenceSchema.optional(),
    activatedConnections: z.array(connectionSnapshotSchema).optional(),
  }).strict().optional(),
  firstJob: evidenceSchema.optional(),
  firstJobGoalId: z.string().uuid().optional(),
  firstJobIssueId: z.string().uuid().optional(),
  firstJobConnections: z.array(connectionSnapshotSchema).optional(),
  firstAcceptedDeliverable: evidenceSchema.optional(),
  builderDrafts: builderDraftsSchema.optional(),
}).strict() satisfies z.ZodType<OnboardingJourney>;

/** Only facts explicitly supplied by the board user; evidence is always server-created. */
export const onboardingUserEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("business_suggestion_recorded"), url: safeHttpUrlSchema.optional() }).strict(),
  z.object({ type: z.literal("business_confirmed"), businessName: z.string().trim().min(1).max(200), offer: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ type: z.literal("context_confirmed"), audience: z.string().trim().min(1).max(2000), desiredOutcome: z.string().trim().min(1).max(2000), constraints: z.string().trim().max(4000).optional() }).strict(),
]);

export const onboardingPutSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  path: onboardingPathSchema,
}).strict();

export const onboardingEventRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  event: onboardingUserEventSchema,
}).strict();

export const onboardingActivationRequestSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
export const onboardingTeamSelectionRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  agentIds: z.array(z.string().uuid()).min(1).max(50),
}).strict();
export const onboardingFirstJobRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  goalId: z.string().uuid(),
}).strict();

const onboardingAgentCandidateSchema = z.object({ id: z.string().uuid(), name: z.string(), title: z.string().nullable() }).strict();
const onboardingGoalCandidateSchema = z.object({ id: z.string().uuid(), title: z.string(), issueId: z.string().uuid(), startedAt: timestampSchema }).strict();

export const onboardingSnapshotSchema = z.object({
  journey: onboardingJourneySchema,
  revision: z.number().int().positive(),
  serverNow: timestampSchema,
  availableAgents: z.array(onboardingAgentCandidateSchema),
  availableAgentsTruncated: z.boolean(),
  eligibleGoals: z.array(onboardingGoalCandidateSchema),
  eligibleGoalsTruncated: z.boolean(),
}).strict();
export const onboardingMutationResponseSchema = onboardingSnapshotSchema.extend({
  result: z.object({ accepted: z.boolean(), reason: z.string().optional() }).strict().optional(),
}).strict();

export type OnboardingUserEvent = z.infer<typeof onboardingUserEventSchema>;
export type OnboardingPutInput = z.infer<typeof onboardingPutSchema>;
export type OnboardingEventRequest = z.infer<typeof onboardingEventRequestSchema>;
export type OnboardingActivationRequest = z.infer<typeof onboardingActivationRequestSchema>;
export type OnboardingTeamSelectionRequest = z.infer<typeof onboardingTeamSelectionRequestSchema>;
export type OnboardingFirstJobRequest = z.infer<typeof onboardingFirstJobRequestSchema>;
export type OnboardingSnapshot = z.infer<typeof onboardingSnapshotSchema>;
export type OnboardingMutationResponse = z.infer<typeof onboardingMutationResponseSchema>;
export type OnboardingPathInput = OnboardingPath;
