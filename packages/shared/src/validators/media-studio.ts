import { z } from "zod";

const id = z.string().uuid();
export const mediaOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cut_ranges"), ranges: z.array(z.object({ start: z.number().nonnegative(), end: z.number().positive() }).refine(r => r.end > r.start)).min(1).max(200) }),
  z.object({ type: z.literal("remove_silences"), thresholdDb: z.number().min(-90).max(0), minDurationMs: z.number().positive() }),
  z.object({ type: z.literal("remove_fillers"), words: z.array(z.string().trim().min(1).max(100)).min(1).max(100) }),
  z.object({ type: z.literal("burn_subtitles"), style: z.object({ font: z.string().max(100).regex(/^[A-Za-z0-9 _-]*$/).optional(), size: z.number().positive().max(200), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), highlightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), position: z.enum(["top", "center", "bottom"]) }) }),
  z.object({ type: z.literal("export"), aspect: z.enum(["9:16", "16:9"]), cropMode: z.literal("center") }),
  z.object({ type: z.literal("replace_audio"), assetId: id }),
]);
export const mediaProjectCreateSchema = z.object({
  creationType: z.enum(["source", "motor_video"]).default("source"),
  assetId: id.optional(),
  companyFileId: id.optional(),
  goalId: id.optional(),
  issueId: id.optional(),
}).superRefine((input, ctx) => {
  const hasSource = Boolean(input.assetId) || Boolean(input.companyFileId);
  const hasBothSources = Boolean(input.assetId) && Boolean(input.companyFileId);
  if (input.creationType === "source" && (!hasSource || hasBothSources)) {
    ctx.addIssue({ code: "custom", message: "Provide exactly one of assetId or companyFileId" });
  }
  if (input.creationType === "motor_video" && hasSource) {
    ctx.addIssue({ code: "custom", message: "A motor-video project must not have a source asset" });
  }
});
export const mediaMotorVideoRenderSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  primary: z.boolean().default(false),
  spec: z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
    let encoded: string;
    try { encoded = JSON.stringify(value); } catch { encoded = ""; }
    if (!encoded || encoded.length > 1_000_000) {
      ctx.addIssue({ code: "custom", message: "Video specification must be valid JSON up to 1 MB" });
    }
  }),
});
export const mediaDetectSilencesSchema = z.object({ thresholdDb: z.number().min(-90).max(0).default(-35), minDurationMs: z.number().positive().max(60000).default(800) });
export const mediaDetectFillersSchema = z.object({ words: z.array(z.string().trim().min(1)).min(1).max(100) });
export const mediaOperationsSchema = z.object({ operations: z.array(mediaOperationSchema).min(1).max(100) });
export const mediaRenderSchema = z.object({ idempotencyKey: z.string().min(1).max(200), primary: z.boolean().default(false), aspect: z.enum(["9:16", "16:9"]).default("9:16"), cropMode: z.literal("center").default("center") });
export const mediaDubSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  language: z.string().min(2).max(35),
  voiceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  translatedSegments: z.array(z.object({ start: z.number().nonnegative(), end: z.number().positive(), text: z.string().trim().min(1).max(5000) }).refine(segment => segment.end > segment.start)).min(1).max(200),
}).superRefine((input, ctx) => {
  const totalChars = input.translatedSegments.reduce((total, segment) => total + segment.text.length, 0);
  if (totalChars > 100_000) ctx.addIssue({ code: "custom", path: ["translatedSegments"], message: "Dubbing text must not exceed 100,000 characters" });
});
export const mediaTranscribeSchema = z.object({ idempotencyKey: z.string().min(1).max(200) });
export const mediaQueueQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().max(500).optional() });
export const mediaPriorityUpdateSchema = z.object({ priority: z.number().int().min(0).max(100), expectedUpdatedAt: z.string().min(20).max(40).refine(value => !Number.isNaN(Date.parse(value))) });

const frameAssetIdsSchema = z.array(id).min(1).max(200);
const dubVoiceIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

/** Stop motion: a sequence of same-company image assets becomes a short vertical or horizontal video. */
export const mediaStopMotionSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  frameAssetIds: frameAssetIdsSchema,
  frameDurationSeconds: z.number().min(0.05).max(10),
  cameraMotion: z.enum(["pan", "zoom", "none"]),
  aspect: z.enum(["9:16", "16:9"]).default("9:16"),
  primary: z.boolean().default(false),
  goalId: id.optional(),
});

/** Multivoice dubbing: each segment names its speaker and voice; the agent supplies the translated text. */
export const mediaDubMultivoiceBaseSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  language: z.string().min(2).max(35),
  segments: z.array(z.object({
    start: z.number().nonnegative(),
    end: z.number().positive(),
    text: z.string().trim().min(1).max(5000),
    speaker: z.string().trim().min(1).max(100),
    voiceId: dubVoiceIdSchema,
  }).refine(segment => segment.end > segment.start)).min(1).max(200),
  primary: z.boolean().default(false),
});
export const mediaDubMultivoiceSchema = mediaDubMultivoiceBaseSchema.superRefine((input, ctx) => {
  const totalChars = input.segments.reduce((total, segment) => total + segment.text.length, 0);
  if (totalChars > 100_000) ctx.addIssue({ code: "custom", path: ["segments"], message: "Dubbing text must not exceed 100,000 characters" });
});

/** Voiceover: exactly one voice source, either text to synthesize or an existing audio asset. */
export const mediaVoiceoverBaseSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  script: z.string().trim().min(1).max(20_000).optional(),
  voiceAssetId: id.optional(),
  voiceId: dubVoiceIdSchema.optional(),
  language: z.string().min(2).max(35).optional(),
  duckingDb: z.number().min(-40).max(0).default(-12),
  primary: z.boolean().default(false),
});
export const mediaVoiceoverSchema = mediaVoiceoverBaseSchema
  .refine(input => Boolean(input.script) !== Boolean(input.voiceAssetId), "Provide exactly one of script or voiceAssetId")
  .refine(input => !input.script || Boolean(input.voiceId), "voiceId is required when a script is given");
