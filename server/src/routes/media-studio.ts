import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assets, companyFileVersions } from "@paperclipai/db";
import { mediaProjectCreateSchema, mediaTranscribeSchema, mediaDetectSilencesSchema, mediaDetectFillersSchema, mediaOperationsSchema, mediaRenderSchema, mediaDubSchema, mediaStopMotionSchema, mediaDubMultivoiceSchema, mediaVoiceoverSchema, mediaQueueQuerySchema, mediaPriorityUpdateSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { mediaStudioService } from "../services/media-studio.js";
import { resolveGoalIdForIssue } from "../services/assignment-costs.js";
import { projectToolContext } from "../services/project-tool-context.js";
import { companyFilesService } from "../services/company-files.js";
import { getStorageService } from "../storage/index.js";
import { canActorReadAssetContent } from "../services/asset-content-access.js";
import { assertBoard, assertCompanyAccess, getAccessibleResource, getActorInfo } from "./authz.js";

export function mediaStudioRoutes(db: Db) {
  const router = Router(); const service = mediaStudioService(db);
  async function getProject(req: any, res: any, id: string, write = false) {
    const project = await getAccessibleResource(req, res, service.getProject(id), "Media project not found");
    if (!project) return null;
    if (req.actor.type === "agent") {
      const context = await projectToolContext(db, req.actor, write, "Media");
      if (context.run.companyId !== project.companyId || context.issue.id !== project.issueId) {
        res.status(404).json({ error: "Media project not found" });
        return null;
      }
    }
    return project;
  }
  async function audit(req: any, companyId: string, action: string, entityType: string, entityId: string, details?: Record<string, unknown>) {
    const actor = getActorInfo(req);
    await logActivity(db, { companyId, actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId, action, entityType, entityId, details });
  }
  router.post("/companies/:companyId/media-projects", validate(mediaProjectCreateSchema), async (req, res) => {
    const companyId = req.params.companyId as string; assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const runContext = req.actor.type === "agent" ? await projectToolContext(db, req.actor, true, "Media") : null;
    const runGoalId = runContext ? runContext.issue.goalId ?? await resolveGoalIdForIssue(db, companyId, runContext.issue.id) ?? undefined : undefined;
    if (runContext && runContext.run.companyId !== companyId) { res.status(404).json({ error: "Source asset not found" }); return; }
    if (runContext && ((req.body.issueId && req.body.issueId !== runContext.issue.id)
      || (req.body.goalId && req.body.goalId !== runGoalId))) {
      res.status(403).json({ error: "Media projects must use the active run's issue and goal" }); return;
    }
    if (runContext && req.body.companyFileId) {
      const files = companyFilesService(db, getStorageService());
      const file = await files.getRow(req.body.companyFileId);
      if (!file || file.companyId !== companyId || file.deletedAt || !(await files.isAgentVisible(companyId, file.folderId))
        || (file.audienceKind === "project" && file.audienceId !== runContext.issue.projectId)
        || (file.audienceKind !== "company" && file.audienceKind !== "project")) {
        res.status(404).json({ error: "Source asset not found" }); return;
      }
      const [version] = file.currentVersionId
        ? await db.select({ assetId: companyFileVersions.assetId }).from(companyFileVersions).where(and(eq(companyFileVersions.id, file.currentVersionId), eq(companyFileVersions.fileId, file.id), eq(companyFileVersions.companyId, companyId))).limit(1)
        : [];
      const [asset] = version?.assetId
        ? await db.select().from(assets).where(and(eq(assets.id, version.assetId), eq(assets.companyId, companyId))).limit(1)
        : [];
      if (!asset || !(await canActorReadAssetContent(db, req.actor, asset))) { res.status(404).json({ error: "Source asset not found" }); return; }
    }
    if (runContext && req.body.assetId) {
      const [asset] = await db.select().from(assets).where(and(eq(assets.id, req.body.assetId), eq(assets.companyId, companyId))).limit(1);
      if (!asset || !(await canActorReadAssetContent(db, req.actor, asset))) { res.status(404).json({ error: "Source asset not found" }); return; }
    }
    const row = await service.createProject(companyId, {assetId:req.body.assetId,companyFileId:req.body.companyFileId}, { agentId: actor.agentId, userId: actor.actorType === "user" ? actor.actorId : null }, { goalId: runContext ? runGoalId : req.body.goalId, issueId: runContext ? runContext.issue.id : req.body.issueId });
    if (!row) { res.status(404).json({ error: "Source asset not found" }); return; }
    await audit(req, companyId, "media.project_created", "media_project", row.id, { sourceAssetId: row.sourceAssetId }); res.status(201).json(row);
  });
  router.get("/media-projects/:id", async (req,res) => { const row=await getProject(req,res,req.params.id as string); if(row) res.json(row); });
  router.get("/companies/:companyId/media-jobs", async (req,res) => {
    const companyId=req.params.companyId as string;
    assertCompanyAccess(req,companyId);
    const parsed=z.string().uuid().safeParse(req.query.goalId);
    if(!parsed.success) { res.status(400).json({error:"A valid goalId is required"}); return; }
    let issueId: string | undefined;
    if(req.actor.type==="agent") {
      const context=await projectToolContext(db,req.actor,false,"Media");
      const effectiveGoalId=context.issue.goalId??await resolveGoalIdForIssue(db,companyId,context.issue.id);
      if(context.run.companyId!==companyId||effectiveGoalId!==parsed.data) { res.status(404).json({error:"Media jobs not found"}); return; }
      issueId=context.issue.id;
    }
    res.json({jobs:await service.getJobsForGoal(companyId,parsed.data,{issueId})});
  });
  router.get("/companies/:companyId/media-queue", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const query = mediaQueueQuerySchema.safeParse(req.query);
    if (!query.success) { res.status(400).json({ error: "Invalid media queue cursor or page size" }); return; }
    let cursor: { priority: number; createdAt: string; id: string } | undefined;
    if (query.data.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(query.data.cursor, "base64url").toString("utf8")) as { priority?: unknown; createdAt?: unknown; id?: unknown };
        if (typeof decoded.priority !== "number" || !Number.isInteger(decoded.priority) || decoded.priority < 0 || decoded.priority > 100
          || typeof decoded.createdAt !== "string" || Number.isNaN(Date.parse(decoded.createdAt))
          || typeof decoded.id !== "string" || !z.string().uuid().safeParse(decoded.id).success) throw new Error("bad cursor");
        cursor = { priority: decoded.priority, createdAt: decoded.createdAt, id: decoded.id };
      } catch { res.status(400).json({ error: "Invalid media queue cursor" }); return; }
    }
    const result = await service.listQueue(companyId, { limit: query.data.limit, cursor });
    const last = result.jobs.at(-1);
    const nextCursor = result.hasMore && last
      ? Buffer.from(JSON.stringify({ priority: last.priority, createdAt: last.createdAt, id: last.id })).toString("base64url")
      : null;
    res.json({ running: result.running, jobs: result.jobs, nextCursor });
  });
  router.patch("/companies/:companyId/media-jobs/:jobId/priority", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const parsed = mediaPriorityUpdateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Provide a priority from 0 to 100 and the job version" }); return; }
    const jobId = req.params.jobId as string;
    const [updated] = await service.reprioritizeQueuedJob(companyId, jobId, parsed.data.priority, parsed.data.expectedUpdatedAt);
    if (!updated) {
      const current = await service.getJob(jobId);
      if (!current || current.companyId !== companyId) { res.status(404).json({ error: "Queued media job not found" }); return; }
      res.status(409).json({ error: current.status === "queued" ? "Media job changed; reload the queue before retrying" : "Only queued media jobs can be reprioritized", current });
      return;
    }
    await audit(req, companyId, "media.job_priority_changed", "media_job", updated.id, { priority: updated.priority });
    res.json(updated);
  });
  router.post("/media-projects/:id/transcribe", validate(mediaTranscribeSchema), async (req,res) => {
    const project=await getProject(req,res,req.params.id as string,true); if(!project) return;
    await service.requireProviderCredential(project.companyId,"openai_whisper");
    await service.assertBudget(project.companyId,getActorInfo(req).agentId,{issueId:project.issueId});
    const job=await service.enqueue(project.companyId,project.id,"transcribe",req.body.idempotencyKey,{}); if(!job){res.status(404).json({error:"Media project not found"});return;}
    await audit(req,project.companyId,"media.transcription_queued","media_job",job.id);res.status(202).json(job);
  });
  router.post("/media-projects/:id/detect-silences", validate(mediaDetectSilencesSchema), async(req,res)=>{
    const project=await getProject(req,res,req.params.id as string);if(!project)return;
    const silences=await service.detectProjectSilences(project.companyId,project.id,req.body.thresholdDb,req.body.minDurationMs);
    if(!silences){res.status(404).json({error:"Media project not found"});return;}
    res.json({projectId:project.id,silences});
  });
  router.post("/media-projects/:id/detect-fillers", validate(mediaDetectFillersSchema), async(req,res)=>{
    const project=await getProject(req,res,req.params.id as string);if(!project)return;
    try { res.json({projectId:project.id,...await service.detectProjectFillers(project.companyId,project.id,req.body.words)}); }
    catch(error) { res.status(422).json({error:error instanceof Error?error.message:"Unable to inspect transcript"}); }
  });
  router.post("/media-projects/:id/operations", validate(mediaOperationsSchema), async(req,res)=>{
    const project=await getProject(req,res,req.params.id as string,true);if(!project)return;
    const updated=await service.addOperations(project.companyId,project.id,req.body.operations);if(!updated){res.status(404).json({error:"Media project not found"});return;}
    await audit(req,project.companyId,"media.operations_updated","media_project",project.id,{count:req.body.operations.length});res.json(updated);
  });
  router.post("/media-projects/:id/render", validate(mediaRenderSchema), async(req,res)=>{
    const project=await getProject(req,res,req.params.id as string,true);if(!project)return;
    const job=await service.enqueue(project.companyId,project.id,"render",req.body.idempotencyKey,{primary:req.body.primary,aspect:req.body.aspect,cropMode:req.body.cropMode});if(!job){res.status(404).json({error:"Media project not found"});return;}
    await audit(req,project.companyId,"media.render_queued","media_job",job.id);res.status(202).json(job);
  });
  router.post("/media-projects/:id/dub", validate(mediaDubSchema), async(req,res)=>{
    const project=await getProject(req,res,req.params.id as string,true);if(!project)return;
    await service.requireProviderCredential(project.companyId,"elevenlabs");
    await service.assertBudget(project.companyId,getActorInfo(req).agentId,{issueId:project.issueId});
    const job=await service.enqueue(project.companyId,project.id,"dub",req.body.idempotencyKey,req.body);if(!job){res.status(404).json({error:"Media project not found"});return;}
    await audit(req,project.companyId,"media.dub_queued","media_job",job.id);res.status(202).json(job);
  });
  /** Loads same-company input assets and checks their type and the actor's content access. Sends the error response and returns null on failure. */
  async function loadInputAssets(req: any, res: any, companyId: string, ids: string[], accepts: (contentType: string) => boolean, expected: string) {
    const unique = [...new Set(ids)];
    const rows = await db.select().from(assets).where(and(eq(assets.companyId, companyId), inArray(assets.id, unique)));
    if (rows.length !== unique.length) { res.status(404).json({ error: "Input asset not found" }); return null; }
    for (const row of rows) {
      if (!(await canActorReadAssetContent(db, req.actor, row))) { res.status(404).json({ error: "Input asset not found" }); return null; }
      if (!accepts(row.contentType)) { res.status(422).json({ error: `Input asset ${row.id} must be ${expected}` }); return null; }
    }
    return new Map(rows.map(row => [row.id, row] as const));
  }
  router.post("/media-projects/:id/stop-motion", validate(mediaStopMotionSchema), async(req,res)=>{
    const project=await getProject(req,res,req.params.id as string,true);if(!project)return;
    if(req.body.goalId&&req.body.goalId!==project.goalId){res.status(422).json({error:"goalId must match the media project goal"});return;}
    const frames=await loadInputAssets(req,res,project.companyId,req.body.frameAssetIds,type=>["image/png","image/jpeg","image/webp"].includes(type),"a PNG, JPEG or WebP image");if(!frames)return;
    await service.assertBudget(project.companyId,getActorInfo(req).agentId,{issueId:project.issueId});
    const job=await service.enqueue(project.companyId,project.id,"stop_motion",req.body.idempotencyKey,{frameAssetIds:req.body.frameAssetIds,frameDurationSeconds:req.body.frameDurationSeconds,cameraMotion:req.body.cameraMotion,aspect:req.body.aspect,primary:req.body.primary});if(!job){res.status(404).json({error:"Media project not found"});return;}
    await audit(req,project.companyId,"media.stop_motion_queued","media_job",job.id);res.status(202).json(job);
  });
  router.post("/media-projects/:id/dub-multivoice", validate(mediaDubMultivoiceSchema), async(req,res)=>{
    const project=await getProject(req,res,req.params.id as string,true);if(!project)return;
    await service.requireProviderCredential(project.companyId,"elevenlabs");
    await service.assertBudget(project.companyId,getActorInfo(req).agentId,{issueId:project.issueId});
    const job=await service.enqueue(project.companyId,project.id,"dub_multivoice",req.body.idempotencyKey,{language:req.body.language,segments:req.body.segments,primary:req.body.primary});if(!job){res.status(404).json({error:"Media project not found"});return;}
    await audit(req,project.companyId,"media.dub_multivoice_queued","media_job",job.id);res.status(202).json(job);
  });
  router.post("/media-projects/:id/voiceover", validate(mediaVoiceoverSchema), async(req,res)=>{
    const project=await getProject(req,res,req.params.id as string,true);if(!project)return;
    if(req.body.script) {
      if(req.body.script.length>5000){res.status(422).json({error:"A voiceover script must not exceed 5000 characters; split longer scripts into dub_multivoice segments"});return;}
      await service.requireProviderCredential(project.companyId,"elevenlabs");
    }
    if(req.body.voiceAssetId){const voice=await loadInputAssets(req,res,project.companyId,[req.body.voiceAssetId],type=>type.startsWith("audio/"),"an audio asset");if(!voice)return;}
    await service.assertBudget(project.companyId,getActorInfo(req).agentId,{issueId:project.issueId});
    const job=await service.enqueue(project.companyId,project.id,"voiceover",req.body.idempotencyKey,{script:req.body.script,voiceAssetId:req.body.voiceAssetId,voiceId:req.body.voiceId,language:req.body.language,duckingDb:req.body.duckingDb,primary:req.body.primary});if(!job){res.status(404).json({error:"Media project not found"});return;}
    await audit(req,project.companyId,"media.voiceover_queued","media_job",job.id);res.status(202).json(job);
  });
  router.get("/media-jobs/:id", async(req,res)=>{
    const row=await getAccessibleResource(req,res,service.getJob(req.params.id as string),"Media job not found");
    if(!row)return;
    if(req.actor.type==="agent") {
      const project=await service.getProject(row.projectId);
      if(!project) { res.status(404).json({error:"Media job not found"}); return; }
      const context=await projectToolContext(db,req.actor,false,"Media");
      if(context.run.companyId!==row.companyId||context.issue.id!==project.issueId) { res.status(404).json({error:"Media job not found"}); return; }
    }
    res.json(row);
  });
  return router;
}

