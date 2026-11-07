import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Db } from "@paperclipai/db";
import { assets, companyFiles, companyFileVersions, documentRevisions, documents, goals, issues, mediaJobs, mediaProjects, productAccounts, productAccountCompanyGrants, productPlans } from "@paperclipai/db";
import type { MediaOperation } from "@paperclipai/shared";
import { detectSilences as detectSilencesWithFfmpeg, dubMultivoice, findFillerRanges, probeDuration, removeFillers, renderMedia, stopMotion, voiceover } from "@paperclipai/media-studio";
import { getStorageService } from "../storage/index.js";
import { workProductService } from "./work-products.js";
import { issueService } from "./issues.js";
import { costService } from "./costs.js";
import { budgetService } from "./budgets.js";
import { resolveGoalIdForIssue } from "./assignment-costs.js";
import { mediaStudioProviders } from "./media-studio-providers.js";
import { productizationEntitlementsService, type ProductReservationRef } from "./productization/entitlements.js";
import { estimateMotorVideoDurationSeconds, motorVideoAssetIds, renderWithMotorVideo } from "./media-studio/motor-video.js";
import { conflict, unprocessable } from "../errors.js";

const activeCompanies = new WeakMap<object, Set<string>>();
const activeJobControllers = new WeakMap<object, Map<string, AbortController>>();
const recoveryStarted = new WeakSet<object>();
const MOTOR_VIDEO_MAX_INPUT_BYTES = 512 * 1024 * 1024;
const ACTIVE_MEDIA_JOB_STATUSES = ["running", "cancel_requested", "finalizing"] as const;
class MediaJobCancelledError extends Error {
  constructor() {
    super("Media job was cancelled");
    this.name = "MediaJobCancelledError";
  }
}
type MediaStudioService = ReturnType<typeof createMediaStudioService>;
type MediaTranscriptSnapshot = { text: string; language: string | null; duration: number | null; words: Array<{ text: string; start: number; end: number }> };
const serviceCache = new WeakMap<object, MediaStudioService>();

export function mediaStudioService(db: Db): MediaStudioService {
  const cached = serviceCache.get(db as object);
  if (cached) return cached;
  const service = createMediaStudioService(db);
  serviceCache.set(db as object, service);
  return service;
}

function createMediaStudioService(db: Db) {
  const runningCompanies = activeCompanies.get(db as object) ?? new Set<string>();
  const runningJobs = activeJobControllers.get(db as object) ?? new Map<string, AbortController>();
  const providers = mediaStudioProviders(db);
  const entitlements = productizationEntitlementsService(db);
  function receiptPricing(value: { source: string; unit: string; units: number; centsPerUnit: number | null; estimatedCents: number | null; coverage: string } | undefined, status: "reported" | "estimated" | "unpriced") {
    if (!value) return undefined;
    return {
      source: status === "estimated" ? "rate_card" as const : status === "reported" ? "provider_reported" as const : "unknown" as const,
      evidence: `${value.source}; ${value.units} ${value.unit}; rate ${value.centsPerUnit ?? "unknown"} cents/unit; estimate ${value.estimatedCents ?? "unknown"} cents; ${value.coverage}`.slice(0, 1000),
    };
  }
  activeCompanies.set(db as object, runningCompanies);
  activeJobControllers.set(db as object, runningJobs);
  async function budgetBlock(companyId: string, agentId: string | null, issueId: string | null) {
    let projectId: string | null = null;
    if (issueId) {
      const [issue] = await db.select({ projectId: issues.projectId }).from(issues).where(and(eq(issues.id, issueId), eq(issues.companyId, companyId))).limit(1);
      projectId = issue?.projectId ?? null;
    }
    return budgetService(db).getInvocationBlock(companyId, agentId, { issueId, projectId });
  }
  async function videoMinutesNeedMeasurement(companyId: string): Promise<boolean> {
    const [binding] = await db.select({access:productAccounts.access,planId:productAccounts.planId})
      .from(productAccountCompanyGrants).innerJoin(productAccounts,eq(productAccounts.id,productAccountCompanyGrants.accountId))
      .where(eq(productAccountCompanyGrants.companyId,companyId)).limit(1);
    if(!binding)return false;
    if(binding.access!=="active"&&binding.access!=="trial_eligible") throw unprocessable("Paperclip product access is inactive.",{code:"plan_gate_account_inactive",metric:"video_minutes"});
    const [plan]=await db.select({limits:productPlans.limits}).from(productPlans).where(eq(productPlans.id,binding.planId)).limit(1);
    if(!plan||!plan.limits||typeof plan.limits!=="object"||!("video_minutes" in plan.limits)) throw unprocessable("Video quota data is incomplete.",{code:"plan_gate_data_incomplete",metric:"video_minutes"});
    const limit=(plan.limits as Record<string,unknown>).video_minutes;
    if(limit===null)return false;
    if(typeof limit!=="number"||!Number.isFinite(limit)||limit<0) throw unprocessable("Video quota data is incomplete.",{code:"plan_gate_data_incomplete",metric:"video_minutes"});
    return true;
  }
  /** Stop motion frames must be raster images that ffmpeg reads through the concat demuxer. */
  function imageExtension(contentType: string): string {
    if (contentType === "image/png") return "png";
    if (contentType === "image/jpeg") return "jpg";
    if (contentType === "image/webp") return "webp";
    throw new Error("Stop motion frames must be PNG, JPEG or WebP images");
  }
  async function downloadAsset(companyId: string, objectKey: string, path: string) {
    await pipeline((await getStorageService().getObject(companyId, objectKey)).stream, createWriteStream(path));
  }
  /** Stores a rendered MP4 as an asset (or as an issue attachment plus media work product when the job belongs to an issue). */
  async function publishVideoOutput(input: { job: typeof mediaJobs.$inferSelect; project: typeof mediaProjects.$inferSelect; companyId: string; outputPath: string; label: string }) {
    const { job, project, companyId, outputPath, label } = input;
    const stored = await getStorageService().putFile({ companyId, namespace: "media-studio", originalFilename: `${job.kind}-${project.id}.mp4`, contentType: "video/mp4", body: await readFile(outputPath) });
    const jobIssueId = typeof job.input.issueId === "string" ? job.input.issueId : project.issueId;
    if (!jobIssueId) {
      const [asset] = await db.insert(assets).values({ companyId, provider: stored.provider, objectKey: stored.objectKey, contentType: stored.contentType, byteSize: stored.byteSize, sha256: stored.sha256, originalFilename: stored.originalFilename, createdByAgentId: project.createdByAgentId, createdByUserId: project.createdByUserId }).returning();
      return asset!;
    }
    const attachment = await issueService(db).createAttachment({ issueId: jobIssueId, provider: stored.provider, objectKey: stored.objectKey, contentType: stored.contentType, byteSize: stored.byteSize, sha256: stored.sha256, originalFilename: stored.originalFilename, createdByAgentId: project.createdByAgentId, createdByUserId: project.createdByUserId });
    const [outputAsset] = await db.select().from(assets).where(and(eq(assets.id, attachment.assetId), eq(assets.companyId, companyId))).limit(1);
    if (!outputAsset) throw new Error("Media output attachment asset is unavailable");
    const contentPath = `/api/attachments/${attachment.id}/content`;
    await workProductService(db).createForIssue(jobIssueId, companyId, { type: "media", provider: "paperclip", externalId: outputAsset.id, title: `${label} video ${project.id}`, status: "ready_for_review", isPrimary: Boolean(job.input.primary), metadata: { attachmentId: attachment.id, assetId: outputAsset.id, mediaProjectId: project.id, contentType: outputAsset.contentType, byteSize: outputAsset.byteSize, contentPath, openPath: contentPath, downloadPath: `${contentPath}?download=1`, originalFilename: outputAsset.originalFilename } });
    return outputAsset;
  }
  async function markProjectCancelledIfIdle(companyId: string, projectId: string) {
    const [active] = await db.select({ id: mediaJobs.id }).from(mediaJobs)
      .where(and(eq(mediaJobs.companyId, companyId), eq(mediaJobs.projectId, projectId), inArray(mediaJobs.status, ["queued", ...ACTIVE_MEDIA_JOB_STATUSES])))
      .limit(1);
    if (!active) {
      await db.update(mediaProjects).set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(mediaProjects.id, projectId), eq(mediaProjects.companyId, companyId)));
    }
  }
  async function runQueue(companyId: string): Promise<void> {
    if (runningCompanies.has(companyId)) return;
    runningCompanies.add(companyId);
    try {
      for (;;) {
        const [candidate] = await db.select().from(mediaJobs).where(and(eq(mediaJobs.companyId, companyId), eq(mediaJobs.status, "queued"), sql`not exists (select 1 from media_jobs running where running.company_id = ${companyId} and running.status in ('running', 'cancel_requested', 'finalizing'))`)).orderBy(desc(mediaJobs.priority), asc(mediaJobs.createdAt), asc(mediaJobs.id)).limit(1);
        if (!candidate) return;
        // If a board reprioritizes after selection but before claim, retry against the new order.
        const [job] = await db.update(mediaJobs).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(and(eq(mediaJobs.id, candidate.id), eq(mediaJobs.status, "queued"), eq(mediaJobs.priority, candidate.priority))).returning();
        if (!job) continue;
        const controller = new AbortController();
        runningJobs.set(job.id, controller);
        let videoReservation: ProductReservationRef | null = null;
        let videoQuotaUncertain = false;
        let videoQuotaSettled = false;
        try {
          const assertMotorVideoNotCancelled = async () => {
            if (controller.signal.aborted) throw new MediaJobCancelledError();
            const [current] = await db.select({ status: mediaJobs.status }).from(mediaJobs)
              .where(and(eq(mediaJobs.id, job.id), eq(mediaJobs.companyId, companyId))).limit(1);
            if (current?.status === "cancel_requested") {
              controller.abort();
              throw new MediaJobCancelledError();
            }
          };
          const [project] = await db.select().from(mediaProjects).where(and(eq(mediaProjects.id, job.projectId), eq(mediaProjects.companyId, companyId))).limit(1);
          if (!project) throw new Error("Media project no longer exists");
          const motorVideoJob = job.kind === "motor_video_render";
          if (motorVideoJob !== (project.creationType === "motor_video")) throw new Error("Media job does not match its project type");
          const sourceAssetId = typeof job.input.sourceAssetId === "string" ? job.input.sourceAssetId : project.sourceAssetId;
          const [source] = sourceAssetId
            ? await db.select().from(assets).where(and(eq(assets.id, sourceAssetId), eq(assets.companyId, companyId))).limit(1)
            : [];
          if (!motorVideoJob && !source) throw new Error("Source asset no longer exists");
          if (motorVideoJob && source) throw new Error("Video creation project cannot have a source asset");
          const storage = getStorageService(); const folder = await mkdtemp(join(tmpdir(), "paperclip-media-job-"));
          try {
            const inputPath = join(folder, "input"), outputPath = join(folder, "render.mp4");
            if (source) await pipeline((await storage.getObject(companyId, source.objectKey)).stream, createWriteStream(inputPath));
            if(await videoMinutesNeedMeasurement(companyId)) {
              let durationSeconds:number;
              if (motorVideoJob) {
                durationSeconds = estimateMotorVideoDurationSeconds(job.input.spec);
              } else if(job.kind==="stop_motion") {
                const frameCount=Array.isArray(job.input.frameAssetIds)?job.input.frameAssetIds.length:0;
                const frameDuration=job.input.frameDurationSeconds;
                if(!Number.isSafeInteger(frameCount)||frameCount<1||typeof frameDuration!=="number"||!Number.isFinite(frameDuration)||frameDuration<=0) throw unprocessable("Video duration is unavailable for quota admission.",{code:"plan_gate_data_incomplete",metric:"video_minutes"});
                durationSeconds=frameCount*frameDuration;
              } else {
                try { durationSeconds=await probeDuration(inputPath); }
                catch { throw unprocessable("Video duration is unavailable for quota admission.",{code:"plan_gate_data_incomplete",metric:"video_minutes"}); }
              }
              if(!Number.isFinite(durationSeconds)||durationSeconds<=0) throw unprocessable("Video duration is unavailable for quota admission.",{code:"plan_gate_data_incomplete",metric:"video_minutes"});
              const minutes=durationSeconds/60;
              videoReservation=await entitlements.reserveForCompany({companyId,metric:"video_minutes",quantity:minutes,idempotencyKey:`media-video-minutes:${job.id}`,requestFingerprint:`${companyId}:${job.id}:${minutes.toFixed(7)}`});
            }
            if (motorVideoJob) {
              const block = await budgetBlock(companyId, project.createdByAgentId, project.issueId);
              if (block) throw new Error(block.reason);
              const spec = job.input.spec;
              const assetIds = motorVideoAssetIds(spec);
              const rows = assetIds.length
                ? await db.select().from(assets).where(and(eq(assets.companyId, companyId), inArray(assets.id, assetIds)))
                : [];
              if (rows.length !== assetIds.length) throw new Error("A referenced video asset is unavailable in this company");
              if (rows.reduce((total, row) => total + Number(row.byteSize), 0) > MOTOR_VIDEO_MAX_INPUT_BYTES) {
                throw unprocessable("Motor-video inputs exceed the 512 MiB per-render limit", { code: "media_input_too_large" });
              }
              const assetById = new Map(rows.map(row => [row.id.toLowerCase(), row] as const));
              const assetPaths = new Map<string, string>();
              const extensionFor = (contentType: string): string => {
                const extensions: Record<string, string> = {
                  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
                  "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3", "audio/mp3": "mp3",
                  "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "aac", "audio/mp4": "m4a", "audio/ogg": "ogg",
                };
                const extension = extensions[contentType.toLowerCase()];
                if (!extension) throw new Error(`Unsupported video asset type: ${contentType}`);
                return extension;
              };
              for (const assetId of assetIds) {
                const asset = assetById.get(assetId);
                if (!asset) throw new Error("A referenced video asset is unavailable in this company");
                const relativePath = `assets/${assetId}.${extensionFor(asset.contentType)}`;
                const targetPath = join(folder, relativePath);
                await mkdir(join(folder, "assets"), { recursive: true, mode: 0o700 });
                await pipeline((await storage.getObject(companyId, asset.objectKey)).stream, createWriteStream(targetPath, { mode: 0o600, flags: "wx" }));
                assetPaths.set(assetId, relativePath);
              }
              await assertMotorVideoNotCancelled();
              const rendered = await renderWithMotorVideo({
                spec,
                folder,
                assetPaths,
                signal: controller.signal,
                onProgress: progress => console.info("Motor-video render progress", { companyId, jobId: job.id, ...progress }),
              });
              await assertMotorVideoNotCancelled();
              const [finalizing] = await db.update(mediaJobs).set({ status: "finalizing", updatedAt: new Date() })
                .where(and(eq(mediaJobs.id, job.id), eq(mediaJobs.companyId, companyId), eq(mediaJobs.status, "running"))).returning({ id: mediaJobs.id });
              if (!finalizing) {
                const [current] = await db.select({ status: mediaJobs.status }).from(mediaJobs)
                  .where(and(eq(mediaJobs.id, job.id), eq(mediaJobs.companyId, companyId))).limit(1);
                if (current?.status === "cancel_requested" || controller.signal.aborted) throw new MediaJobCancelledError();
                throw new Error("Motor-video job changed before output finalization");
              }
              if (videoReservation) { await entitlements.commit(videoReservation); videoQuotaSettled = true; videoQuotaUncertain = false; }
              const outputAsset = await publishVideoOutput({ job, project, companyId, outputPath: rendered.outputPath, label: "Created" });
              await costService(db).createEvent(companyId, {
                agentId: project.createdByAgentId,
                responsibleUserId: project.createdByUserId,
                usageKind: "media",
                issueId: project.issueId,
                goalId: project.goalId,
                idempotencyKey: `media:${job.id}`,
                provider: "motor-video",
                biller: "motor-video",
                billingType: "unknown",
                costStatus: "unpriced",
                pricingProvenance: { source: "unknown", evidence: "Local Motor Video rendering; no provider invoice or compute rate is configured." },
                model: "motor-video-local",
                costCents: 0,
                occurredAt: new Date(),
              });
              await db.update(mediaJobs).set({ status: "done", outputAssetId: outputAsset.id, provider: "motor-video", costCents: 0, finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(mediaJobs.id, job.id), eq(mediaJobs.status, "finalizing")));
              await db.update(mediaProjects).set({ status: "ready", updatedAt: new Date() }).where(and(eq(mediaProjects.id, project.id), eq(mediaProjects.companyId, companyId)));
              continue;
            }
            if (job.kind === "transcribe") {
              const block = await budgetBlock(companyId, project.createdByAgentId, typeof job.input.issueId === "string" ? job.input.issueId : null);
              if (block) throw new Error(block.reason);
              videoQuotaUncertain=Boolean(videoReservation?.accountId);
              const result = await providers.transcribe({ companyId, sourcePath: inputPath });
              if(videoReservation){await entitlements.commit(videoReservation);videoQuotaSettled=true;videoQuotaUncertain=false;}
              await costService(db).createEvent(companyId, { agentId: project.createdByAgentId, responsibleUserId: project.createdByUserId, usageKind: "media", issueId: typeof job.input.issueId === "string" ? job.input.issueId : null, goalId: typeof job.input.goalId === "string" ? job.input.goalId : null, idempotencyKey: `media:${job.id}`, provider: result.provider, biller: "openai", billingType: "metered_api", costStatus: result.costStatus, pricingProvenance: receiptPricing(result.pricingProvenance, result.costStatus), model: "whisper-1", costCents: result.costCents, occurredAt: new Date() });
              const body = JSON.stringify({ text: result.text, language: result.language ?? null, duration: result.duration, words: result.words });
              const [doc] = await db.insert(documents).values({ companyId, title: `Transcript ${project.id}`, format: "json", latestBody: body, createdByAgentId: project.createdByAgentId, createdByUserId: project.createdByUserId }).returning();
              const [revision] = await db.insert(documentRevisions).values({ companyId, documentId: doc.id, revisionNumber: 1, title: doc.title, format: "json", body, changeSummary: "Generated from media transcription", createdByAgentId: project.createdByAgentId, createdByUserId: project.createdByUserId }).returning();
              await db.update(documents).set({ latestRevisionId: revision.id, updatedAt: new Date() }).where(eq(documents.id, doc.id));
              await db.update(mediaProjects).set({ transcriptDocumentId: doc.id, status: "ready", updatedAt: new Date() }).where(and(eq(mediaProjects.id, project.id), eq(mediaProjects.companyId, companyId)));
              await db.update(mediaJobs).set({status:"done",provider:result.provider,costCents:result.costCents,finishedAt:new Date(),updatedAt:new Date()}).where(eq(mediaJobs.id,job.id));
              continue;
            }
            if (job.kind === "stop_motion" || job.kind === "dub_multivoice" || job.kind === "voiceover") {
              // Media v3 jobs: each writes outputPath, then shares the publish path. Costs carry goal and issue attribution.
              const issueIdForCost = typeof job.input.issueId === "string" ? job.input.issueId : project.issueId;
              const goalIdForCost = typeof job.input.goalId === "string" ? job.input.goalId : project.goalId;
              const block = await budgetBlock(companyId, project.createdByAgentId, issueIdForCost);
              if (block) throw new Error(block.reason);
              const recordCost = (args: { key: string; provider: string; biller: string; billingType: "metered_api" | "unknown"; costStatus: "reported" | "estimated" | "unpriced"; pricingProvenance: { source: string; evidence: string }; model?: string; costCents: number }) =>
                costService(db).createEvent(companyId, { agentId: project.createdByAgentId, responsibleUserId: project.createdByUserId, usageKind: "media", issueId: issueIdForCost, goalId: goalIdForCost, idempotencyKey: args.key, provider: args.provider, biller: args.biller, billingType: args.billingType, costStatus: args.costStatus, pricingProvenance: args.pricingProvenance, model: args.model ?? "unknown", costCents: args.costCents, occurredAt: new Date() });
              // Local ffmpeg work has no provider invoice and no asserted rate: recorded as unpriced at 0 cents, attributed to the goal.
              const recordFfmpegCost = (key: string) => recordCost({ key, provider: "ffmpeg", biller: "ffmpeg", billingType: "unknown", costStatus: "unpriced", pricingProvenance: { source: "unknown", evidence: "Local ffmpeg compute on the server; no provider invoice and no rate asserted." }, model: "ffmpeg-local", costCents: 0 });
              let providerCents = 0;
              let providerName: string | null = null;
              const outputPath = join(folder, "render.mp4");
              if (job.kind === "stop_motion") {
                const frameIds = Array.isArray(job.input.frameAssetIds) ? job.input.frameAssetIds.map(String) : [];
                const frameRows = frameIds.length ? await db.select().from(assets).where(and(eq(assets.companyId, companyId), inArray(assets.id, frameIds))) : [];
                const framesById = new Map(frameRows.map(row => [row.id, row] as const));
                const framePaths: string[] = [];
                for (const [index, frameId] of frameIds.entries()) {
                  const frame = framesById.get(frameId);
                  if (!frame) throw new Error("A stop motion frame asset no longer exists");
                  const framePath = join(folder, `frame-${String(index).padStart(4, "0")}.${imageExtension(frame.contentType)}`);
                  await downloadAsset(companyId, frame.objectKey, framePath);
                  framePaths.push(framePath);
                }
                const landscape = job.input.aspect === "16:9";
                await stopMotion({ framePaths, frameDurationSeconds: Number(job.input.frameDurationSeconds), cameraMotion: job.input.cameraMotion as "pan" | "zoom" | "none", outputPath, width: landscape ? 1920 : 1080, height: landscape ? 1080 : 1920 });
                if(videoReservation){await entitlements.commit(videoReservation);videoQuotaSettled=true;}
                await recordFfmpegCost(`media:${job.id}`);
              } else if (job.kind === "dub_multivoice") {
                const segments = Array.isArray(job.input.segments) ? job.input.segments as Array<{ start: number; end: number; text: string; speaker: string; voiceId: string }> : [];
                if (!segments.length) throw new Error("Multivoice dubbing job has no segments");
                const language = String(job.input.language ?? "");
                // One provider call per voice: segments sharing a voiceId are synthesized together, then positioned on the timeline.
                const groups = new Map<string, typeof segments>();
                for (const segment of segments) groups.set(segment.voiceId, [...(groups.get(segment.voiceId) ?? []), segment]);
                const tracks: Array<{ start: number; end: number; speaker: string; audioPath: string }> = [];
                for (const [index, [voiceId, group]] of [...groups.entries()].entries()) {
                  const audioPath = join(folder, `voice-${index}.mp3`);
                  videoQuotaUncertain=Boolean(videoReservation?.accountId);
                  const dub = await providers.dub({ companyId, segments: group.map(({ start, end, text }) => ({ start, end, text })), language, voiceId, outputPath: audioPath });
                  await recordCost({ key: `media:${job.id}:voice:${index}`, provider: dub.provider, biller: "elevenlabs", billingType: "metered_api", costStatus: dub.costStatus, pricingProvenance: receiptPricing(dub.pricingProvenance, dub.costStatus) ?? { source: "unknown", evidence: "no pricing provenance" }, model: "eleven_multilingual_v2", costCents: dub.costCents });
                  providerCents += dub.costCents;
                  providerName = dub.provider;
                  tracks.push({ start: 0, end: Math.max(...group.map(segment => segment.end)), speaker: [...new Set(group.map(segment => segment.speaker))].join(", "), audioPath });
                }
                await dubMultivoice({ sourcePath: inputPath, segments: tracks, outputPath });
                if(videoReservation){await entitlements.commit(videoReservation);videoQuotaSettled=true;videoQuotaUncertain=false;}
                await recordFfmpegCost(`media:${job.id}:compose`);
              } else {
                const duckingDb = typeof job.input.duckingDb === "number" ? job.input.duckingDb : -12;
                const voicePath = join(folder, "voice-track.mp3");
                if (typeof job.input.script === "string") {
                  // A single segment covering the source video; the provider fits it to the video length.
                  const sourceSeconds = await probeDuration(inputPath);
                  videoQuotaUncertain=Boolean(videoReservation?.accountId);
                  const dub = await providers.dub({ companyId, segments: [{ start: 0, end: sourceSeconds, text: job.input.script }], language: typeof job.input.language === "string" ? job.input.language : "es", voiceId: String(job.input.voiceId ?? ""), outputPath: voicePath });
                  await recordCost({ key: `media:${job.id}:tts`, provider: dub.provider, biller: "elevenlabs", billingType: "metered_api", costStatus: dub.costStatus, pricingProvenance: receiptPricing(dub.pricingProvenance, dub.costStatus) ?? { source: "unknown", evidence: "no pricing provenance" }, model: "eleven_multilingual_v2", costCents: dub.costCents });
                  providerCents += dub.costCents;
                  providerName = dub.provider;
                } else {
                  const [voice] = await db.select().from(assets).where(and(eq(assets.id, String(job.input.voiceAssetId ?? "")), eq(assets.companyId, companyId))).limit(1);
                  if (!voice) throw new Error("The voice asset no longer exists");
                  await downloadAsset(companyId, voice.objectKey, voicePath);
                }
                await voiceover({ sourcePath: inputPath, voicePath, outputPath, duckingDb });
                if(videoReservation&&!videoQuotaSettled){await entitlements.commit(videoReservation);videoQuotaSettled=true;videoQuotaUncertain=false;}
                await recordFfmpegCost(`media:${job.id}:compose`);
              }
              const label = job.kind === "stop_motion" ? "Stop motion" : job.kind === "dub_multivoice" ? "Multivoice dubbed" : "Voiceover";
              const outputAsset = await publishVideoOutput({ job, project, companyId, outputPath, label });
              await db.update(mediaJobs).set({ status: "done", outputAssetId: outputAsset.id, provider: providerName ?? "ffmpeg", costCents: providerCents, finishedAt: new Date(), updatedAt: new Date() }).where(eq(mediaJobs.id, job.id));
              await db.update(mediaProjects).set({ status: "ready", updatedAt: new Date() }).where(and(eq(mediaProjects.id, project.id), eq(mediaProjects.companyId, companyId)));
              continue;
            }
            let dubAudioPath: string | null = null;
            let dubResult: Awaited<ReturnType<typeof providers.dub>> | null = null;
            if (job.kind === "dub") {
              const block = await budgetBlock(companyId, project.createdByAgentId, typeof job.input.issueId === "string" ? job.input.issueId : null);
              if (block) throw new Error(block.reason);
              const segments = Array.isArray(job.input.translatedSegments) ? job.input.translatedSegments as Array<{ start: number; end: number; text: string }> : [];
              dubAudioPath = join(folder, "dub.mp3");
              videoQuotaUncertain=Boolean(videoReservation?.accountId);
              dubResult = await providers.dub({ companyId, segments, language: String(job.input.language ?? ""), voiceId: String(job.input.voiceId ?? ""), outputPath: dubAudioPath });
              await costService(db).createEvent(companyId, { agentId: project.createdByAgentId, responsibleUserId: project.createdByUserId, usageKind: "media", issueId: typeof job.input.issueId === "string" ? job.input.issueId : project.issueId, goalId: typeof job.input.goalId === "string" ? job.input.goalId : project.goalId, idempotencyKey: `media:${job.id}`, provider: dubResult.provider, biller: "elevenlabs", billingType: "metered_api", costStatus: dubResult.costStatus, pricingProvenance: receiptPricing(dubResult.pricingProvenance, dubResult.costStatus), model: "eleven_multilingual_v2", costCents: dubResult.costCents, occurredAt: new Date() });
            }
            let operations:MediaOperation[]=[...(Array.isArray(job.input.operationsSnapshot)?job.input.operationsSnapshot as MediaOperation[]:project.operations as MediaOperation[]),...(dubAudioPath?[{type:"replace_audio",assetId:"dub-audio"} as const]:[])];
            const needsTranscript=operations.some(op=>op.type==="remove_fillers"||op.type==="burn_subtitles");
            const transcriptId=Object.hasOwn(job.input,"transcriptDocumentId")?(typeof job.input.transcriptDocumentId==="string"?job.input.transcriptDocumentId:null):project.transcriptDocumentId;
            if(needsTranscript&&!transcriptId) throw new Error("Transcribe this media project before removing filler words or burning subtitles");
            if(transcriptId&&needsTranscript) {
              let transcriptBody = typeof job.input.transcriptBodySnapshot === "string" ? job.input.transcriptBodySnapshot : null;
              if (!transcriptBody) {
                const [transcriptRow]=await db.select().from(documents).where(and(eq(documents.id,transcriptId),eq(documents.companyId,companyId))).limit(1);
                transcriptBody = transcriptRow?.latestBody ?? null;
              }
              if(!transcriptBody) throw new Error("The transcript document is unavailable");
              const words=(JSON.parse(transcriptBody) as {words?:Array<{text:string;start:number;end:number}>}).words??[];
              const subtitleCues:Array<{start:number;end:number;text:string}>=[];
              for(let index=0;index<words.length;index+=7){const chunk=words.slice(index,index+7);if(chunk.length)subtitleCues.push({start:chunk[0]!.start,end:chunk[chunk.length-1]!.end,text:chunk.map(word=>word.text).join(" ")});}
              const fillerOps=operations.filter((op):op is Extract<MediaOperation,{type:"remove_fillers"}>=>op.type==="remove_fillers");
              const fillerWords = fillerOps.flatMap(op => op.words);
              const fillerCuts = findFillerRanges(words, fillerWords).map(({ start, end }) => ({ start, end }));
              operations=operations.filter(op=>op.type!=="remove_fillers").map(op=>op.type==="burn_subtitles"?{...op,subtitles:subtitleCues} as MediaOperation:op);
              if(fillerCuts.length) operations.push({type:"cut_ranges",ranges:fillerCuts});
            }
            await renderMedia({ sourcePath: inputPath, operations }, outputPath,{resolveAsset:async assetId=>{if(assetId!=="dub-audio"||!dubAudioPath)throw new Error("Unknown replacement audio asset");return dubAudioPath;}});
            if(videoReservation&&!videoQuotaSettled){await entitlements.commit(videoReservation);videoQuotaSettled=true;videoQuotaUncertain=false;}
            const bytes = await readFile(outputPath); const stored = await storage.putFile({ companyId, namespace: "media-studio", originalFilename: `render-${project.id}.mp4`, contentType: "video/mp4", body: bytes });
            const jobIssueId=typeof job.input.issueId==="string"?job.input.issueId:project.issueId;
            let attachment: Awaited<ReturnType<ReturnType<typeof issueService>["createAttachment"]>> | null = null;
            let outputAsset: typeof assets.$inferSelect;
            if (jobIssueId) {
              attachment = await issueService(db).createAttachment({ issueId: jobIssueId, provider: stored.provider, objectKey: stored.objectKey, contentType: stored.contentType, byteSize: stored.byteSize, sha256: stored.sha256, originalFilename: stored.originalFilename, createdByAgentId: project.createdByAgentId, createdByUserId: project.createdByUserId });
              const [attachedAsset] = await db.select().from(assets).where(and(eq(assets.id, attachment.assetId), eq(assets.companyId, companyId))).limit(1);
              if (!attachedAsset) throw new Error("Media output attachment asset is unavailable");
              outputAsset = attachedAsset;
            } else {
              const [asset] = await db.insert(assets).values({ companyId, provider: stored.provider, objectKey: stored.objectKey, contentType: stored.contentType, byteSize: stored.byteSize, sha256: stored.sha256, originalFilename: stored.originalFilename, createdByAgentId: project.createdByAgentId, createdByUserId: project.createdByUserId }).returning();
              outputAsset = asset;
            }
            if (jobIssueId) {
              if (!attachment) throw new Error("Media output attachment is unavailable");
              const contentPath = `/api/attachments/${attachment.id}/content`;
              await workProductService(db).createForIssue(jobIssueId, companyId, { type: "media", provider: "paperclip", externalId: outputAsset.id, title: `${job.kind === "dub" ? "Dubbed" : "Rendered"} video ${project.id}`, status: "ready_for_review", isPrimary: Boolean(job.input.primary), metadata: { attachmentId: attachment.id, assetId: outputAsset.id, mediaProjectId: project.id, contentType: outputAsset.contentType, byteSize: outputAsset.byteSize, contentPath, openPath: contentPath, downloadPath: `${contentPath}?download=1`, originalFilename: outputAsset.originalFilename } });
            }
            await db.update(mediaJobs).set({ status: "done", outputAssetId: outputAsset.id, ...(job.kind==="dub"?{provider:dubResult!.provider,costCents:dubResult!.costCents}:{}), finishedAt: new Date(), updatedAt: new Date() }).where(eq(mediaJobs.id, job.id));
            await db.update(mediaProjects).set({status:"ready",updatedAt:new Date()}).where(and(eq(mediaProjects.id,project.id),eq(mediaProjects.companyId,companyId)));
          } finally { await rm(folder, { recursive: true, force: true }); }
        } catch (error) {
          const wasCancelled = error instanceof MediaJobCancelledError || controller.signal.aborted;
          if(videoReservation&&!videoQuotaSettled) {
            try {
              if(videoQuotaUncertain && !wasCancelled) await entitlements.markUncertain(videoReservation);
              else await entitlements.releaseAfterConfirmedRollback(videoReservation);
            } catch (settlementError) {
              console.error("Media video quota settlement failed", { companyId, jobId: job.id, settlementError });
            }
          }
          if (wasCancelled) {
            await db.update(mediaJobs).set({ status: "cancelled", error: null, finishedAt: new Date(), updatedAt: new Date() })
              .where(and(eq(mediaJobs.id, job.id), eq(mediaJobs.companyId, companyId), inArray(mediaJobs.status, ["running", "cancel_requested"])));
            await markProjectCancelledIfIdle(companyId, job.projectId);
          } else {
            await db.update(mediaJobs).set({ status: "failed", error: error instanceof Error ? error.message : String(error), finishedAt: new Date(), updatedAt: new Date() })
              .where(and(eq(mediaJobs.id, job.id), eq(mediaJobs.companyId, companyId), inArray(mediaJobs.status, ["running", "finalizing"])));
            await db.update(mediaProjects).set({status:"failed",updatedAt:new Date()}).where(and(eq(mediaProjects.id,job.projectId),eq(mediaProjects.companyId,companyId)));
          }
        } finally {
          if (runningJobs.get(job.id) === controller) runningJobs.delete(job.id);
        }
      }
    } finally { runningCompanies.delete(companyId); }
  }
  if (!recoveryStarted.has(db as object)) {
    recoveryStarted.add(db as object);
    void (async () => {
      await db.update(mediaJobs).set({ status: "failed", error: "Server restarted while this job was running; provider work may have completed. Check provider and output state before starting a new job.", finishedAt: new Date(), updatedAt: new Date() }).where(inArray(mediaJobs.status, ["running", "finalizing"]));
      const cancelled = await db.update(mediaJobs).set({ status: "cancelled", error: null, finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(mediaJobs.status, "cancel_requested")).returning({ companyId: mediaJobs.companyId, projectId: mediaJobs.projectId });
      await Promise.all(cancelled.map(row => markProjectCancelledIfIdle(row.companyId, row.projectId)));
      const rows = await db.select({ companyId: mediaJobs.companyId }).from(mediaJobs).where(eq(mediaJobs.status, "queued")).groupBy(mediaJobs.companyId);
      await Promise.all(rows.map(row => runQueue(row.companyId)));
    })().catch(error => console.error("Media job recovery failed", error));
  }
  const service = {
    async requireProviderCredential(companyId: string, provider: "openai_whisper" | "elevenlabs") {
      await providers.ensureConfigured(companyId, provider);
    },
    async assertBudget(companyId: string, agentId: string | null, context: { issueId?: string | null }) {
      const block = await budgetBlock(companyId, agentId, context.issueId ?? null);
      if (block) throw unprocessable(block.reason);
    },
    async createProject(companyId: string, source: { assetId?: string; companyFileId?: string }, actor: { agentId?: string | null; userId?: string | null }, links: { goalId?: string; issueId?: string } = {}) {
      let linkedIssue: { id: string; goalId: string | null } | undefined;
      if (links.issueId) {
        const [row] = await db.select({ id: issues.id, goalId: issues.goalId }).from(issues).where(and(eq(issues.id, links.issueId), eq(issues.companyId, companyId))).limit(1);
        if (!row) return null;
        linkedIssue = row;
      }
      const effectiveGoalId = linkedIssue
        ? linkedIssue.goalId ?? await resolveGoalIdForIssue(db, companyId, linkedIssue.id) ?? undefined
        : links.goalId;
      if (effectiveGoalId) {
        const [goal] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, effectiveGoalId), eq(goals.companyId, companyId))).limit(1);
        if (!goal || (linkedIssue && effectiveGoalId !== goal.id)) return null;
      }
      if (linkedIssue && links.goalId && links.goalId !== effectiveGoalId) return null;
      let assetId=source.assetId;
      if(source.companyFileId) {
        const [file]=await db.select({assetId:companyFileVersions.assetId,audienceKind:companyFiles.audienceKind,audienceId:companyFiles.audienceId}).from(companyFiles).innerJoin(companyFileVersions,and(eq(companyFileVersions.id,companyFiles.currentVersionId!),eq(companyFileVersions.fileId,companyFiles.id),eq(companyFileVersions.companyId,companyId))).where(and(eq(companyFiles.id,source.companyFileId),eq(companyFiles.companyId,companyId),isNull(companyFiles.deletedAt))).limit(1);
        if(file?.audienceKind==="project") { const [issue]=await db.select({projectId:issues.projectId}).from(issues).where(and(eq(issues.id,links.issueId??""),eq(issues.companyId,companyId))).limit(1); if(issue?.projectId!==file.audienceId) return null; }
        if(file&&file.audienceKind!=="company"&&file.audienceKind!=="project") return null;
        assetId=file?.assetId??undefined;
      }
      if(!assetId) return null;
      const [asset] = await db.select({ id: assets.id, contentType: assets.contentType }).from(assets).where(and(eq(assets.id, assetId), eq(assets.companyId, companyId))).limit(1);
      if (!asset) return null;
      // Images are accepted so a stop motion project can use its first frame as the source asset.
      if (!asset.contentType.startsWith("audio/") && !asset.contentType.startsWith("video/") && !asset.contentType.startsWith("image/")) throw unprocessable("Media source must be an audio, video or image asset");
      const [row] = await db.insert(mediaProjects).values({ companyId, sourceAssetId: assetId, goalId: effectiveGoalId, issueId: links.issueId, createdByAgentId: actor.agentId ?? null, createdByUserId: actor.userId ?? null }).returning();
      return row;
    },
    async createVideoProject(companyId: string, actor: { agentId?: string | null; userId?: string | null }, links: { goalId?: string; issueId?: string } = {}) {
      let linkedIssue: { id: string; goalId: string | null } | undefined;
      if (links.issueId) {
        const [row] = await db.select({ id: issues.id, goalId: issues.goalId }).from(issues).where(and(eq(issues.id, links.issueId), eq(issues.companyId, companyId))).limit(1);
        if (!row) return null;
        linkedIssue = row;
      }
      const effectiveGoalId = linkedIssue
        ? linkedIssue.goalId ?? await resolveGoalIdForIssue(db, companyId, linkedIssue.id) ?? undefined
        : links.goalId;
      if (effectiveGoalId) {
        const [goal] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, effectiveGoalId), eq(goals.companyId, companyId))).limit(1);
        if (!goal || (linkedIssue && effectiveGoalId !== goal.id)) return null;
      }
      if (linkedIssue && links.goalId && links.goalId !== effectiveGoalId) return null;
      const [row] = await db.insert(mediaProjects).values({ companyId, sourceAssetId: null, creationType: "motor_video", goalId: effectiveGoalId, issueId: linkedIssue?.id, createdByAgentId: actor.agentId ?? null, createdByUserId: actor.userId ?? null }).returning();
      return row;
    },
    async getProject(id: string) {
      const [project] = await db.select().from(mediaProjects).where(eq(mediaProjects.id, id)).limit(1);
      if (!project) return null;
      const jobs = await db.select().from(mediaJobs).where(and(eq(mediaJobs.projectId, id), eq(mediaJobs.companyId, project.companyId))).orderBy(asc(mediaJobs.createdAt));
      const [transcriptRow] = project.transcriptDocumentId
        ? await db.select({ latestBody: documents.latestBody }).from(documents).where(and(eq(documents.id, project.transcriptDocumentId), eq(documents.companyId, project.companyId))).limit(1)
        : [];
      let transcript: MediaTranscriptSnapshot | null = null;
      if (transcriptRow) {
        try {
          const parsed = JSON.parse(transcriptRow.latestBody) as Partial<MediaTranscriptSnapshot>;
          transcript = { text: typeof parsed.text === "string" ? parsed.text : "", language: typeof parsed.language === "string" ? parsed.language : null, duration: typeof parsed.duration === "number" ? parsed.duration : null, words: Array.isArray(parsed.words) ? parsed.words : [] };
        } catch { transcript = null; }
      }
      return { ...project, jobs, transcript };
    },
    async enqueue(companyId: string, projectId: string, kind: "transcribe" | "render" | "dub" | "stop_motion" | "dub_multivoice" | "voiceover" | "motor_video_render", idempotencyKey: string, input: Record<string, unknown>) {
      const job = await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${companyId}), hashtext(${idempotencyKey}))`);
        const [prior] = await tx.select().from(mediaJobs).where(and(eq(mediaJobs.companyId, companyId), eq(mediaJobs.idempotencyKey, idempotencyKey))).limit(1);
        if (prior) {
          const matches = prior.projectId === projectId && prior.kind === kind && Object.entries(input).every(([key, value]) => JSON.stringify(prior.input[key]) === JSON.stringify(value));
          if (!matches) throw conflict("Media idempotency key was already used for a different job");
          return prior;
        }
        const [project] = await tx.select().from(mediaProjects).where(and(eq(mediaProjects.id, projectId), eq(mediaProjects.companyId, companyId))).for("update").limit(1);
        if (!project) return null;
        if ((kind === "motor_video_render") !== (project.creationType === "motor_video")) throw conflict("Media job kind does not match project type");
        if (kind === "motor_video_render") {
          if (!input.spec || typeof input.spec !== "object" || Array.isArray(input.spec)) throw unprocessable("A video specification is required");
          if (Buffer.byteLength(JSON.stringify(input.spec), "utf8") > 1_000_000) throw unprocessable("Video specification must be no larger than 1 MB");
          try {
            motorVideoAssetIds(input.spec);
            estimateMotorVideoDurationSeconds(input.spec);
          } catch (error) {
            throw unprocessable(error instanceof Error ? error.message : "Invalid video specification");
          }
        }
        let snapshot=project.operations as Array<Record<string,unknown>>;
        if(kind==="render") {
          const exportOp={type:"export",aspect:input.aspect==="16:9"?"16:9":"9:16",cropMode:"center"};
          snapshot=[...snapshot,exportOp];
          await tx.update(mediaProjects).set({operations:snapshot,updatedAt:new Date()}).where(and(eq(mediaProjects.id,projectId),eq(mediaProjects.companyId,companyId)));
        }
        await tx.update(mediaProjects).set({status:"processing",updatedAt:new Date()}).where(and(eq(mediaProjects.id,projectId),eq(mediaProjects.companyId,companyId)));
        const [transcript] = project.transcriptDocumentId
          ? await tx.select({ latestBody: documents.latestBody }).from(documents).where(and(eq(documents.id, project.transcriptDocumentId), eq(documents.companyId, companyId))).for("update").limit(1)
          : [];
        const [created]=await tx.insert(mediaJobs).values({companyId,projectId,kind,idempotencyKey,input:{...input,operationsSnapshot:snapshot,transcriptDocumentId:project.transcriptDocumentId,transcriptBodySnapshot:transcript?.latestBody??null,sourceAssetId:project.sourceAssetId,goalId:project.goalId,issueId:project.issueId},status:"queued"}).returning();
        return created??null;
      });
      if(job?.status==="queued") void runQueue(companyId).catch(error => console.error("Media queue stopped", { companyId, error }));
      return job;
    },
    async addOperations(companyId: string, projectId: string, operations: MediaOperation[]) {
      return db.transaction(async tx=>{
        const [project]=await tx.select().from(mediaProjects).where(and(eq(mediaProjects.id,projectId),eq(mediaProjects.companyId,companyId))).for("update").limit(1);
        if(!project)return null;
        const [updated]=await tx.update(mediaProjects).set({operations:[...(project.operations as MediaOperation[]),...operations],updatedAt:new Date()}).where(and(eq(mediaProjects.id,projectId),eq(mediaProjects.companyId,companyId))).returning();
        return updated??null;
      });
    },
    async detectProjectSilences(companyId: string, projectId: string, thresholdDb: number, minDurationMs: number) {
      const [project] = await db.select().from(mediaProjects).where(and(eq(mediaProjects.id, projectId), eq(mediaProjects.companyId, companyId))).limit(1);
      if (!project?.sourceAssetId) return null;
      const [source] = await db.select().from(assets).where(and(eq(assets.id, project.sourceAssetId), eq(assets.companyId, companyId))).limit(1);
      if (!source) return null;
      const folder = await mkdtemp(join(tmpdir(), "paperclip-media-detect-"));
      try { const path=join(folder,"source"); await pipeline((await getStorageService().getObject(companyId,source.objectKey)).stream,createWriteStream(path)); return await detectSilencesWithFfmpeg(path,{thresholdDb,minDurationMs}); }
      finally { await rm(folder,{recursive:true,force:true}); }
    },
    async detectProjectFillers(companyId: string, projectId: string, words: string[]) {
      const [project] = await db.select().from(mediaProjects).where(and(eq(mediaProjects.id, projectId), eq(mediaProjects.companyId, companyId))).limit(1);
      if (!project?.sourceAssetId) return null;
      if (!project.transcriptDocumentId) throw new Error("Transcribe this media project before detecting filler words");
      const [transcript] = await db.select().from(documents).where(and(eq(documents.id, project.transcriptDocumentId), eq(documents.companyId, companyId))).limit(1);
      if (!transcript) throw new Error("The transcript document is unavailable");
      const parsed = JSON.parse(transcript.latestBody) as { words?: Array<{ start:number;end:number;text:string }> };
      const segments = parsed.words ?? [];
      const fillers = words.map(word => word.trim().toLocaleLowerCase()).filter(Boolean);
      return { matches: findFillerRanges(segments, fillers), remaining: removeFillers(segments, fillers) };
    },
    async getJob(id: string) {
      const [job] = await db.select().from(mediaJobs).where(eq(mediaJobs.id, id)).limit(1);
      return job ?? null;
    },
    async cancelJob(companyId: string, jobId: string) {
      const result = await db.transaction(async tx => {
        const [current] = await tx.select().from(mediaJobs)
          .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.companyId, companyId))).for("update").limit(1);
        if (!current) return null;
        if (current.status === "queued") {
          const [cancelled] = await tx.update(mediaJobs).set({ status: "cancelled", error: null, finishedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.companyId, companyId), eq(mediaJobs.status, "queued"))).returning();
          return { job: cancelled ?? current, changed: Boolean(cancelled) };
        }
        if (current.kind === "motor_video_render" && current.status === "running") {
          const [requested] = await tx.update(mediaJobs).set({ status: "cancel_requested", updatedAt: new Date() })
            .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.companyId, companyId), eq(mediaJobs.status, "running"))).returning();
          return { job: requested ?? current, changed: Boolean(requested) };
        }
        if (current.status === "running") throw conflict("This media job cannot be cancelled after it starts");
        return { job: current, changed: false };
      });
      if (!result) return null;
      if (result.job.status === "cancel_requested") {
        runningJobs.get(jobId)?.abort(new MediaJobCancelledError());
      } else if (result.changed && result.job.status === "cancelled") {
        await markProjectCancelledIfIdle(companyId, result.job.projectId);
      }
      return result.job;
    },
    async getJobsForGoal(companyId: string, goalId: string, scope: { issueId?: string | null } = {}) {
      const conditions = [eq(mediaProjects.companyId, companyId), eq(mediaProjects.goalId, goalId)];
      if (scope.issueId) conditions.push(eq(mediaProjects.issueId, scope.issueId));
      const rows = await db.select({ job: mediaJobs }).from(mediaJobs)
        .innerJoin(mediaProjects, and(eq(mediaProjects.id, mediaJobs.projectId), eq(mediaProjects.companyId, mediaJobs.companyId)))
        .where(and(...conditions, eq(mediaJobs.companyId, companyId)))
        .orderBy(asc(mediaJobs.createdAt));
      return rows.map(row => row.job);
    },
    async listQueue(companyId: string, input: { limit: number; cursor?: { priority: number; createdAt: string; id: string } }) {
      const runningRows = await db.select({ job: mediaJobs, createdAtVersion: sql<string>`to_char(${mediaJobs.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, updatedAtVersion: sql<string>`to_char(${mediaJobs.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` }).from(mediaJobs)
        .where(and(eq(mediaJobs.companyId, companyId), inArray(mediaJobs.status, [...ACTIVE_MEDIA_JOB_STATUSES])))
        .orderBy(asc(mediaJobs.startedAt), asc(mediaJobs.id)).limit(1);
      const running = runningRows.map(row => ({ ...row.job, createdAt: row.createdAtVersion, updatedAt: row.updatedAtVersion }));
      const conditions = [eq(mediaJobs.companyId, companyId), eq(mediaJobs.status, "queued")];
      if (input.cursor) {
        const { priority, createdAt, id } = input.cursor;
        conditions.push(or(
          lt(mediaJobs.priority, priority),
          and(eq(mediaJobs.priority, priority), sql`${mediaJobs.createdAt} > ${createdAt}::timestamptz`),
          and(eq(mediaJobs.priority, priority), sql`${mediaJobs.createdAt} = ${createdAt}::timestamptz`, gt(mediaJobs.id, id)),
        )!);
      }
      const rows = await db.select({ job: mediaJobs, createdAtVersion: sql<string>`to_char(${mediaJobs.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, updatedAtVersion: sql<string>`to_char(${mediaJobs.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` }).from(mediaJobs).where(and(...conditions))
        .orderBy(desc(mediaJobs.priority), asc(mediaJobs.createdAt), asc(mediaJobs.id)).limit(input.limit + 1);
      const hasMore = rows.length > input.limit;
      const jobs = (hasMore ? rows.slice(0, input.limit) : rows).map(row => ({ ...row.job, createdAt: row.createdAtVersion, updatedAt: row.updatedAtVersion }));
      return { running, jobs, hasMore };
    },
    async reprioritizeQueuedJob(companyId: string, jobId: string, priority: number, expectedUpdatedAt: string) {
      return db.update(mediaJobs).set({ priority, updatedAt: sql`greatest(clock_timestamp(), ${mediaJobs.updatedAt} + interval '1 microsecond')` })
        .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.companyId, companyId), eq(mediaJobs.status, "queued"), sql`${mediaJobs.updatedAt} = ${expectedUpdatedAt}::timestamptz`))
        .returning();
    },
  };
  return service;
}
