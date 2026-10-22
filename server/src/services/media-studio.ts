import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Db } from "@paperclipai/db";
import { assets, companyFiles, companyFileVersions, documentRevisions, documents, goals, issues, mediaJobs, mediaProjects } from "@paperclipai/db";
import type { MediaOperation } from "@paperclipai/shared";
import { detectSilences as detectSilencesWithFfmpeg, dubMultivoice, findFillerRanges, probeDuration, removeFillers, renderMedia, stopMotion, voiceover } from "@paperclipai/media-studio";
import { getStorageService } from "../storage/index.js";
import { workProductService } from "./work-products.js";
import { issueService } from "./issues.js";
import { costService } from "./costs.js";
import { budgetService } from "./budgets.js";
import { resolveGoalIdForIssue } from "./assignment-costs.js";
import { mediaStudioProviders } from "./media-studio-providers.js";
import { conflict, unprocessable } from "../errors.js";

const activeCompanies = new WeakMap<object, Set<string>>();
const recoveryStarted = new WeakSet<object>();
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
  const providers = mediaStudioProviders(db);
  function receiptPricing(value: { source: string; unit: string; units: number; centsPerUnit: number | null; estimatedCents: number | null; coverage: string } | undefined, status: "reported" | "estimated" | "unpriced") {
    if (!value) return undefined;
    return {
      source: status === "estimated" ? "rate_card" as const : status === "reported" ? "provider_reported" as const : "unknown" as const,
      evidence: `${value.source}; ${value.units} ${value.unit}; rate ${value.centsPerUnit ?? "unknown"} cents/unit; estimate ${value.estimatedCents ?? "unknown"} cents; ${value.coverage}`.slice(0, 1000),
    };
  }
  activeCompanies.set(db as object, runningCompanies);
  async function budgetBlock(companyId: string, agentId: string | null, issueId: string | null) {
    let projectId: string | null = null;
    if (issueId) {
      const [issue] = await db.select({ projectId: issues.projectId }).from(issues).where(and(eq(issues.id, issueId), eq(issues.companyId, companyId))).limit(1);
      projectId = issue?.projectId ?? null;
    }
    return budgetService(db).getInvocationBlock(companyId, agentId, { issueId, projectId });
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
  async function runQueue(companyId: string): Promise<void> {
    if (runningCompanies.has(companyId)) return;
    runningCompanies.add(companyId);
    try {
      for (;;) {
        const [candidate] = await db.select().from(mediaJobs).where(and(eq(mediaJobs.companyId, companyId), eq(mediaJobs.status, "queued"), sql`not exists (select 1 from media_jobs running where running.company_id = ${companyId} and running.status = 'running')`)).orderBy(asc(mediaJobs.createdAt)).limit(1);
        if (!candidate) return;
        const [job] = await db.update(mediaJobs).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(and(eq(mediaJobs.id, candidate.id), eq(mediaJobs.status, "queued"))).returning();
        if (!job) continue;
        try {
          const [project] = await db.select().from(mediaProjects).where(and(eq(mediaProjects.id, job.projectId), eq(mediaProjects.companyId, companyId))).limit(1);
          if (!project) throw new Error("Media project no longer exists");
          const [source] = await db.select().from(assets).where(and(eq(assets.id, typeof job.input.sourceAssetId==="string"?job.input.sourceAssetId:project.sourceAssetId), eq(assets.companyId, companyId))).limit(1);
          if (!source) throw new Error("Source asset no longer exists");
          const storage = getStorageService(); const folder = await mkdtemp(join(tmpdir(), "paperclip-media-job-"));
          try {
            const inputPath = join(folder, "input"), outputPath = join(folder, "render.mp4");
            await pipeline((await storage.getObject(companyId, source.objectKey)).stream, createWriteStream(inputPath));
            if (job.kind === "transcribe") {
              const block = await budgetBlock(companyId, project.createdByAgentId, typeof job.input.issueId === "string" ? job.input.issueId : null);
              if (block) throw new Error(block.reason);
              const result = await providers.transcribe({ companyId, sourcePath: inputPath });
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
                  const dub = await providers.dub({ companyId, segments: group.map(({ start, end, text }) => ({ start, end, text })), language, voiceId, outputPath: audioPath });
                  await recordCost({ key: `media:${job.id}:voice:${index}`, provider: dub.provider, biller: "elevenlabs", billingType: "metered_api", costStatus: dub.costStatus, pricingProvenance: receiptPricing(dub.pricingProvenance, dub.costStatus) ?? { source: "unknown", evidence: "no pricing provenance" }, model: "eleven_multilingual_v2", costCents: dub.costCents });
                  providerCents += dub.costCents;
                  providerName = dub.provider;
                  tracks.push({ start: 0, end: Math.max(...group.map(segment => segment.end)), speaker: [...new Set(group.map(segment => segment.speaker))].join(", "), audioPath });
                }
                await dubMultivoice({ sourcePath: inputPath, segments: tracks, outputPath });
                await recordFfmpegCost(`media:${job.id}:compose`);
              } else {
                const duckingDb = typeof job.input.duckingDb === "number" ? job.input.duckingDb : -12;
                const voicePath = join(folder, "voice-track.mp3");
                if (typeof job.input.script === "string") {
                  // A single segment covering the source video; the provider fits it to the video length.
                  const sourceSeconds = await probeDuration(inputPath);
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
          await db.update(mediaJobs).set({ status: "failed", error: error instanceof Error ? error.message : String(error), finishedAt: new Date(), updatedAt: new Date() }).where(eq(mediaJobs.id, job.id));
          await db.update(mediaProjects).set({status:"failed",updatedAt:new Date()}).where(and(eq(mediaProjects.id,job.projectId),eq(mediaProjects.companyId,companyId)));
        }
      }
    } finally { runningCompanies.delete(companyId); }
  }
  if (!recoveryStarted.has(db as object)) {
    recoveryStarted.add(db as object);
    void (async () => {
      await db.update(mediaJobs).set({ status: "failed", error: "Server restarted while this job was running; provider work may have completed. Check provider and output state before starting a new job.", finishedAt: new Date(), updatedAt: new Date() }).where(eq(mediaJobs.status, "running"));
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
    async enqueue(companyId: string, projectId: string, kind: "transcribe" | "render" | "dub" | "stop_motion" | "dub_multivoice" | "voiceover", idempotencyKey: string, input: Record<string, unknown>) {
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
      if (!project) return null;
      const [source] = await db.select().from(assets).where(and(eq(assets.id, project.sourceAssetId), eq(assets.companyId, companyId))).limit(1);
      if (!source) return null;
      const folder = await mkdtemp(join(tmpdir(), "paperclip-media-detect-"));
      try { const path=join(folder,"source"); await pipeline((await getStorageService().getObject(companyId,source.objectKey)).stream,createWriteStream(path)); return await detectSilencesWithFfmpeg(path,{thresholdDb,minDurationMs}); }
      finally { await rm(folder,{recursive:true,force:true}); }
    },
    async detectProjectFillers(companyId: string, projectId: string, words: string[]) {
      const [project] = await db.select().from(mediaProjects).where(and(eq(mediaProjects.id, projectId), eq(mediaProjects.companyId, companyId))).limit(1);
      if (!project) return null;
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
    async getJobsForGoal(companyId: string, goalId: string, scope: { issueId?: string | null } = {}) {
      const conditions = [eq(mediaProjects.companyId, companyId), eq(mediaProjects.goalId, goalId)];
      if (scope.issueId) conditions.push(eq(mediaProjects.issueId, scope.issueId));
      const rows = await db.select({ job: mediaJobs }).from(mediaJobs)
        .innerJoin(mediaProjects, and(eq(mediaProjects.id, mediaJobs.projectId), eq(mediaProjects.companyId, mediaJobs.companyId)))
        .where(and(...conditions, eq(mediaJobs.companyId, companyId)))
        .orderBy(asc(mediaJobs.createdAt));
      return rows.map(row => row.job);
    },
  };
  return service;
}
