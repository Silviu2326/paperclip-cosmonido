import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assets, costEvents, documents, mediaJobs, mediaProjects, productizationMediaPresets } from "@paperclipai/db";
import { mediaOperationsSchema } from "@paperclipai/shared";
import type { CreateMediaPresetInput, MediaPreset, MediaProductionMetrics, MediaTemplateKind } from "@paperclipai/shared/productization/media-presets";
import { forbidden, notFound, unprocessable } from "../../errors.js";

const KINDS: readonly MediaTemplateKind[] = ["clip", "demo", "testimonial", "tutorial", "advert"];
const mapPreset = (row: typeof productizationMediaPresets.$inferSelect): MediaPreset => ({ ...row, createdAt: row.createdAt.toISOString() });

export function mediaPresetService(db: Db) {
  return {
    async list(companyId: string): Promise<MediaPreset[]> {
      const rows = await db.select().from(productizationMediaPresets).where(eq(productizationMediaPresets.companyId, companyId)).orderBy(asc(productizationMediaPresets.presetKey), desc(productizationMediaPresets.version));
      return rows.map(mapPreset);
    },
    async create(companyId: string, input: CreateMediaPresetInput, userId: string): Promise<MediaPreset> {
      if (!KINDS.includes(input.kind)) throw unprocessable("Unknown media template kind");
      if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(input.presetKey)) throw unprocessable("Preset key must use lowercase letters, numbers, hyphens or underscores");
      if (!input.name.trim() || input.name.length > 120) throw unprocessable("Preset name must be 1 to 120 characters");
      if (input.operations.length > 20) throw unprocessable("A preset may include at most 20 media operations");
      const operations = mediaOperationsSchema.safeParse({ operations: input.operations });
      if (!operations.success) throw unprocessable("Preset contains unsupported media operations", operations.error.issues);
      const needsTranscript = operations.data.operations.some((operation) => operation.type === "burn_subtitles" || operation.type === "remove_fillers");
      if (needsTranscript && !input.inputCriteria.transcriptRequired) throw unprocessable("This template uses transcript data; mark transcription as required");
      if (!input.inputCriteria.acceptedContentTypes.length || input.inputCriteria.acceptedContentTypes.length > 5 || input.inputCriteria.notes.length > 10 || !input.inputCriteria.acceptedContentTypes.includes("video/*")) throw unprocessable("Input criteria are incomplete or unsupported; video/* is required for rendering");
      const refs = input.brandReferences ?? {};
      if (refs.musicLicenseReferenceUrl && !/^https:\/\//i.test(refs.musicLicenseReferenceUrl)) throw unprocessable("Music license reference must be an HTTPS URL supplied by the company");
      const assetIds = [refs.logoAssetId, refs.voiceAssetId, refs.musicAssetId].filter((id): id is string => Boolean(id));
      if (assetIds.length) {
        const rows = await db.select({ id: assets.id, contentType: assets.contentType }).from(assets).where(and(eq(assets.companyId, companyId), inArray(assets.id, assetIds)));
        const byId = new Map(rows.map((row) => [row.id, row]));
        for (const id of assetIds) if (!byId.has(id)) throw notFound("A brand media reference is unavailable");
        if (refs.logoAssetId && !byId.get(refs.logoAssetId)?.contentType.startsWith("image/")) throw unprocessable("Logo reference must point to an image asset");
        if (refs.voiceAssetId && !byId.get(refs.voiceAssetId)?.contentType.startsWith("audio/")) throw unprocessable("Voice reference must point to an audio asset");
        if (refs.musicAssetId && !byId.get(refs.musicAssetId)?.contentType.startsWith("audio/")) throw unprocessable("Music reference must point to an audio asset");
      }
      if (refs.musicAssetId && !refs.musicLicenseReferenceUrl) throw unprocessable("Add a company-supplied license reference URL for music assets; Paperclip does not verify licenses");
      const [row] = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`media-preset:${companyId}:${input.presetKey}`}, 0))`);
        const [latest] = await tx.select({ version: productizationMediaPresets.version }).from(productizationMediaPresets).where(and(eq(productizationMediaPresets.companyId, companyId), eq(productizationMediaPresets.presetKey, input.presetKey))).orderBy(desc(productizationMediaPresets.version)).limit(1);
        return tx.insert(productizationMediaPresets).values({ companyId, presetKey: input.presetKey, version: (latest?.version ?? 0) + 1, kind: input.kind, outputAspect: input.outputAspect, name: input.name.trim(), description: input.description?.trim() || null, inputCriteria: input.inputCriteria, operations: operations.data.operations, brandReferences: refs, createdByUserId: userId }).returning();
      });
      return mapPreset(row!);
    },
    async metrics(companyId: string, periodDays: 7 | 30 | 90): Promise<MediaProductionMetrics> {
      const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
      const jobs = await db.select({ id: mediaJobs.id, projectId: mediaJobs.projectId }).from(mediaJobs).innerJoin(mediaProjects, and(eq(mediaProjects.id, mediaJobs.projectId), eq(mediaProjects.companyId, mediaJobs.companyId))).where(and(eq(mediaJobs.companyId, companyId), eq(mediaJobs.status, "done"), gte(mediaJobs.createdAt, since))).orderBy(desc(mediaJobs.createdAt)).limit(5000);
      const events = await db.select({ idempotencyKey: costEvents.idempotencyKey, costStatus: costEvents.costStatus, costCents: costEvents.costCents }).from(costEvents).where(and(eq(costEvents.companyId, companyId), eq(costEvents.usageKind, "media"), gte(costEvents.createdAt, since)));
      const eventsByJob = new Map<string, typeof events>();
      for (const event of events) {
        const match = event.idempotencyKey?.match(/^media:([0-9a-f-]{36})(?::|$)/i);
        if (match) eventsByJob.set(match[1]!, [...(eventsByJob.get(match[1]!) ?? []), event]);
      }
      const projects = jobs.length ? await db.select({ id: mediaProjects.id, transcriptDocumentId: mediaProjects.transcriptDocumentId }).from(mediaProjects).where(and(eq(mediaProjects.companyId, companyId), inArray(mediaProjects.id, [...new Set(jobs.map((job) => job.projectId))]))) : [];
      const documentIds = projects.flatMap((project) => project.transcriptDocumentId ? [project.transcriptDocumentId] : []);
      const docs = documentIds.length ? await db.select({ id: documents.id, latestBody: documents.latestBody }).from(documents).where(and(eq(documents.companyId, companyId), inArray(documents.id, documentIds))) : [];
      const durationByProject = new Map<string, number>();
      const secondsByDocument = new Map<string, number>();
      for (const doc of docs) {
        try { const duration = (JSON.parse(doc.latestBody) as { duration?: unknown }).duration; if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) secondsByDocument.set(doc.id, duration); } catch { /* unavailable or malformed transcript is uncovered */ }
      }
      for (const project of projects) if (project.transcriptDocumentId) {
        const seconds = secondsByDocument.get(project.transcriptDocumentId);
        if (seconds) durationByProject.set(project.id, seconds);
      }
      let pricedCostCents = 0;
      let matchedCostCents = 0;
      let pricedMinutes = 0;
      let jobsWithCostEvidence = 0;
      let jobsWithDurationEvidence = 0;
      for (const job of jobs) {
        const related = eventsByJob.get(job.id) ?? [];
        const priced = related.filter((event) => event.costStatus === "reported" || event.costStatus === "estimated");
        if (related.length) jobsWithCostEvidence += 1;
        if (priced.length) pricedCostCents += priced.reduce((sum, event) => sum + Number(event.costCents), 0);
        const seconds = durationByProject.get(job.projectId);
        if (seconds) {
          jobsWithDurationEvidence += 1;
          if (priced.length) { pricedMinutes += seconds / 60; matchedCostCents += priced.reduce((sum, event) => sum + Number(event.costCents), 0); }
        }
      }
      return {
        periodDays, completedJobs: jobs.length, jobsWithCostEvidence, jobsWithDurationEvidence,
        pricedCostCents, pricedMinutes: Math.round(pricedMinutes * 100) / 100,
        centsPerMinute: pricedMinutes > 0 ? Math.round((matchedCostCents / pricedMinutes) * 100) / 100 : null,
        costCoveragePercent: jobs.length ? Math.round(jobsWithCostEvidence * 100 / jobs.length) : 0,
        durationCoveragePercent: jobs.length ? Math.round(jobsWithDurationEvidence * 100 / jobs.length) : 0,
        basis: "Latest 5,000 completed media jobs in period; priced cost sums reported/estimated cost_events and divides by transcript duration for jobs with cost and duration evidence. Unknown or unpriced work remains visible in coverage counts.",
      };
    },
  };
}
