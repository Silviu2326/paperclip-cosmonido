import { z } from "zod";
import { badRequest } from "../errors.js";
import { CAPABILITY_SEMANTIC_TOOL_CATALOG } from "../vendor/paperclip-runner/index.js";
import {
  mediaProjectCreateSchema, mediaTranscribeSchema, mediaDetectSilencesSchema,
  mediaDetectFillersSchema, mediaOperationsSchema, mediaRenderSchema, mediaDubSchema,
  mediaStopMotionSchema, mediaDubMultivoiceSchema, mediaVoiceoverSchema,
} from "@paperclipai/shared";

const id = z.string().uuid();
export const MEDIA_TOOL_NAMES = ["media_ingest","media_transcribe","media_detect_silences","media_detect_fillers","media_cut","media_subtitle","media_export","media_dub","media_get_project","media_get_job","media_stop_motion","media_dub_multivoice","media_voiceover"];
const toolSchemas: Record<string, z.ZodTypeAny> = {
  media_stop_motion: mediaStopMotionSchema.and(z.object({ projectId: id })),
  media_dub_multivoice: mediaDubMultivoiceSchema.and(z.object({ projectId: id })),
  media_voiceover: mediaVoiceoverSchema.and(z.object({ projectId: id })),
  media_ingest: mediaProjectCreateSchema,
  media_transcribe: z.object({ projectId:id, idempotencyKey:z.string().min(1).max(200) }),
  media_detect_silences: z.object({ projectId:id }).merge(mediaDetectSilencesSchema.partial()),
  media_detect_fillers: z.object({ projectId:id }).merge(mediaDetectFillersSchema),
  media_cut: z.object({ projectId:id, ranges:z.array(z.object({start:z.number().nonnegative(),end:z.number().positive()}).refine(range=>range.end>range.start)).min(1).max(200) }),
  media_subtitle: z.object({ projectId:id, style:z.object({font:z.string().max(100).regex(/^[A-Za-z0-9 _-]*$/).optional(),size:z.number().positive().max(200),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),highlightColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),position:z.enum(["top","center","bottom"])}) }),
  media_export: z.object({ projectId:id, aspect:z.enum(["9:16","16:9"]), cropMode:z.literal("center").default("center"), idempotencyKey:z.string().min(1).max(200), primary:z.boolean().default(false) }),
  media_dub: z.object({ projectId:id }).merge(mediaDubSchema),
  media_get_project: z.object({ projectId:id }), media_get_job:z.object({jobId:id}),
};
export function mediaToolDefinitions(workMode:string) {
  const catalog=CAPABILITY_SEMANTIC_TOOL_CATALOG.filter(tool=>MEDIA_TOOL_NAMES.includes(tool.operationId) && tool.allowedModes.includes(workMode as "standard"));
  return catalog.map(tool=>({name:tool.operationId,description:tool.description,inputSchema:tool.inputSchema}));
}

/** Tool execution goes through the authenticated HTTP routes to preserve auth, validation and audit behavior. */
export async function callMediaTool(input: { name:string; arguments:Record<string,unknown>; apiUrl:string; token:string; companyId:string; issueId:string; agentId:string }) {
  const parsed=toolSchemas[input.name]?.safeParse(input.arguments); if(!parsed?.success) throw badRequest("Invalid media tool arguments",parsed?.error.issues);
  const args=parsed.data as Record<string,unknown>; let path="", method="GET", body:unknown;
  switch(input.name) {
    case "media_ingest": path=`/companies/${input.companyId}/media-projects`;method="POST";body={...args,issueId:input.issueId};break;
    case "media_transcribe": path=`/media-projects/${args.projectId}/transcribe`;method="POST";body={idempotencyKey:args.idempotencyKey};break;
    case "media_detect_silences": path=`/media-projects/${args.projectId}/detect-silences`;method="POST";body={thresholdDb:args.thresholdDb??-35,minDurationMs:args.minDurationMs??800};break;
    case "media_detect_fillers": path=`/media-projects/${args.projectId}/detect-fillers`;method="POST";body={words:args.words};break;
    case "media_cut": path=`/media-projects/${args.projectId}/operations`;method="POST";body={operations:[{type:"cut_ranges",ranges:args.ranges}]};break;
    case "media_subtitle": path=`/media-projects/${args.projectId}/operations`;method="POST";body={operations:[{type:"burn_subtitles",style:args.style}]};break;
    case "media_export": path=`/media-projects/${args.projectId}/render`;method="POST";body={idempotencyKey:args.idempotencyKey,primary:args.primary,aspect:args.aspect,cropMode:args.cropMode};break;
    case "media_dub": path=`/media-projects/${args.projectId}/dub`;method="POST";body={idempotencyKey:args.idempotencyKey,language:args.language,voiceId:args.voiceId,translatedSegments:args.translatedSegments};break;
    case "media_stop_motion": path=`/media-projects/${args.projectId}/stop-motion`;method="POST";body={idempotencyKey:args.idempotencyKey,frameAssetIds:args.frameAssetIds,frameDurationSeconds:args.frameDurationSeconds,cameraMotion:args.cameraMotion,aspect:args.aspect,primary:args.primary,...(args.goalId?{goalId:args.goalId}:{})};break;
    case "media_dub_multivoice": path=`/media-projects/${args.projectId}/dub-multivoice`;method="POST";body={idempotencyKey:args.idempotencyKey,language:args.language,segments:args.segments,primary:args.primary};break;
    case "media_voiceover": path=`/media-projects/${args.projectId}/voiceover`;method="POST";body={idempotencyKey:args.idempotencyKey,script:args.script,voiceAssetId:args.voiceAssetId,voiceId:args.voiceId,language:args.language,duckingDb:args.duckingDb,primary:args.primary};break;
    case "media_get_project": path=`/media-projects/${args.projectId}`;break;
    case "media_get_job": path=`/media-jobs/${args.jobId}`;break;
    default: throw badRequest("Unknown media tool");
  }
  const response=await fetch(`${input.apiUrl.replace(/\/+$/g,"").replace(/\/api$/g,"")}/api${path}`,{method,headers:{Authorization:`Bearer ${input.token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120_000)});
  const result=await response.json(); if(!response.ok) throw new Error(typeof result.error==="string"?result.error:`Media tool failed (${response.status})`); return result;
}
