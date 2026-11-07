import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { assets, companies, costEvents, createDb, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS, goals, issueAttachments, issueWorkProducts, issues, mediaJobs, mediaProjects, documents } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "../__tests__/helpers/embedded-postgres.js";
import { mediaStudioService } from "./media-studio.js";
import { costService } from "./costs.js";
import { mediaStudioRoutes } from "../routes/media-studio.js";
import { errorHandler } from "../middleware/error-handler.js";
import { getStorageService } from "../storage/index.js";

describe("media studio durable jobs",()=>{
  let temporary:Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db:ReturnType<typeof createDb>;
  beforeAll(async()=>{temporary=await startEmbeddedPostgresTestDatabase("media-studio-");db=createDb(temporary.connectionString);},EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
  afterAll(async()=>{await temporary?.cleanup();});

  it("deduplicates concurrent exports and freezes the accepted operations",async()=>{
    const companyId=randomUUID(),assetId=randomUUID(),projectId=randomUUID();
    await db.insert(companies).values({id:companyId,name:"Media tests",issuePrefix:"MED"});
    await db.insert(assets).values({id:assetId,companyId,provider:"local",objectKey:`${companyId}/media/source.mp4`,contentType:"video/mp4",byteSize:128,sha256:"a".repeat(64)});
    await db.insert(mediaProjects).values({id:projectId,companyId,sourceAssetId:assetId,operations:[{type:"remove_silences",thresholdDb:-35,minDurationMs:800}]});
    const service=mediaStudioService(db);
    const [first,second]=await Promise.all([
      service.enqueue(companyId,projectId,"render","export:stable-key",{aspect:"9:16",primary:true}),
      service.enqueue(companyId,projectId,"render","export:stable-key",{aspect:"9:16",primary:true}),
    ]);
    expect(first?.id).toBeTruthy();expect(second?.id).toBe(first?.id);
    expect(first?.input.operationsSnapshot).toEqual([{type:"remove_silences",thresholdDb:-35,minDurationMs:800},{type:"export",aspect:"9:16",cropMode:"center"}]);
    await expect(service.enqueue(companyId,projectId,"render","export:stable-key",{aspect:"16:9",primary:true})).rejects.toThrow(/idempotency key/i);
    const secondExport=await service.enqueue(companyId,projectId,"render","export:second-key",{aspect:"16:9",primary:false});
    expect(secondExport?.input.operationsSnapshot).toEqual([
      {type:"remove_silences",thresholdDb:-35,minDurationMs:800},
      {type:"export",aspect:"9:16",cropMode:"center"},
      {type:"export",aspect:"16:9",cropMode:"center"},
    ]);
    const rows=await db.select().from(mediaJobs).where(and(eq(mediaJobs.companyId,companyId),eq(mediaJobs.idempotencyKey,"export:stable-key")));
    expect(rows).toHaveLength(1);
    const [project]=await db.select().from(mediaProjects).where(eq(mediaProjects.id,projectId));
    expect(project?.operations).toEqual(secondExport?.input.operationsSnapshot);
    expect(first?.input.operationsSnapshot).toEqual([{type:"remove_silences",thresholdDb:-35,minDurationMs:800},{type:"export",aspect:"9:16",cropMode:"center"}]);
    for(let attempt=0;attempt<100;attempt++) {
      const [job]=await db.select().from(mediaJobs).where(eq(mediaJobs.id,first!.id));
      if(job?.status==="failed"||job?.status==="done") break;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
  });

  it("returns an actionable missing-provider credential error",async()=>{
    const companyId=randomUUID();
    await db.insert(companies).values({id:companyId,name:"Media credential tests",issuePrefix:"MCR"});
    await expect(mediaStudioService(db).requireProviderCredential(companyId,"openai_whisper"))
      .rejects.toMatchObject({status:422});
  });

  it("records media provider receipts against the accepted goal",async()=>{
    const companyId=randomUUID(),goalId=randomUUID();
    await db.insert(companies).values({id:companyId,name:"Media cost tests",issuePrefix:"MCT"});
    await db.insert(goals).values({id:goalId,companyId,title:"Publish the edited clip"});
    const event=await costService(db).createEvent(companyId,{
      agentId:null,responsibleUserId:null,usageKind:"media",goalId,issueId:null,idempotencyKey:"media:test-goal-receipt",
      provider:"openai_whisper",biller:"openai",billingType:"metered_api",costStatus:"estimated",model:"whisper-1",
      pricingProvenance:{source:"rate_card",evidence:"fixture estimate for 10 audio seconds"},
      costCents:0.1,occurredAt:new Date(),
    });
    const [saved]=await db.select().from(costEvents).where(eq(costEvents.id,event.id));
    expect(saved?.goalId).toBe(goalId);
    expect(saved?.usageKind).toBe("media");
  },Math.max(EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,60_000));

  it("returns 404 for a media project in another company",async()=>{
    const allowedCompanyId=randomUUID(),otherCompanyId=randomUUID(),assetId=randomUUID(),projectId=randomUUID();
    await db.insert(companies).values([
      {id:allowedCompanyId,name:"Allowed media company",issuePrefix:"AMC"},
      {id:otherCompanyId,name:"Other media company",issuePrefix:"OMC"},
    ]);
    await db.insert(assets).values({id:assetId,companyId:otherCompanyId,provider:"local",objectKey:`${otherCompanyId}/media/private.mp4`,contentType:"video/mp4",byteSize:128,sha256:"b".repeat(64)});
    await db.insert(mediaProjects).values({id:projectId,companyId:otherCompanyId,sourceAssetId:assetId});
    const app=express();
    app.use((req,_res,next)=>{req.actor={type:"board",source:"session",userId:"media-test-user",companyIds:[allowedCompanyId]};next();});
    app.use("/api",mediaStudioRoutes(db));
    app.use(errorHandler);
    await request(app).get(`/api/media-projects/${projectId}`).expect(404);
  });

  it("inherits the assignment goal for a descendant task",async()=>{
    const companyId=randomUUID(),rootIssueId=randomUUID(),childIssueId=randomUUID(),goalId=randomUUID(),assetId=randomUUID();
    await db.insert(companies).values({id:companyId,name:"Media assignment goal tests",issuePrefix:"MAG"});
    await db.insert(issues).values([
      {id:rootIssueId,companyId,title:"Assignment root"},
      {id:childIssueId,companyId,parentId:rootIssueId,goalId:null,title:"Descendant task"},
    ]);
    await db.insert(goals).values({id:goalId,companyId,title:"Assignment goal",kind:"assignment",rootIssueId});
    await db.insert(assets).values({id:assetId,companyId,provider:"local",objectKey:`${companyId}/media/assignment-source.mp4`,contentType:"video/mp4",byteSize:128,sha256:"c".repeat(64)});
    const project=await mediaStudioService(db).createProject(companyId,{assetId},{userId:"media-test-user"},{issueId:childIssueId});
    expect(project?.goalId).toBe(goalId);
  });

  it("renders from transcript and records a private issue attachment work product",async()=>{
    const previousStorageDir=process.env.PAPERCLIP_STORAGE_LOCAL_DIR;
    const previousStorageProvider=process.env.PAPERCLIP_STORAGE_PROVIDER;
    const storageDir=await mkdtemp(join(tmpdir(),"paperclip-media-output-test-"));
    const fixtureDir=await mkdtemp(join(tmpdir(),"paperclip-media-source-test-"));
    const runFfmpeg=(args:string[])=>new Promise<void>((resolve,reject)=>{
      const child=spawn(process.env.FFMPEG_PATH??"ffmpeg",args,{windowsHide:true,stdio:["ignore","ignore","pipe"]});
      let stderr="";child.stderr.setEncoding("utf8").on("data",chunk=>{stderr=(stderr+chunk).slice(-8000);});
      child.once("error",reject);child.once("close",code=>code===0?resolve():reject(new Error(`ffmpeg exited ${code}: ${stderr}`)));
    });
    try {
      process.env.PAPERCLIP_STORAGE_PROVIDER="local_disk";
      process.env.PAPERCLIP_STORAGE_LOCAL_DIR=storageDir;
      const companyId=randomUUID(),goalId=randomUUID(),issueId=randomUUID(),assetId=randomUUID();
      await db.insert(companies).values({id:companyId,name:"Media render tests",issuePrefix:"MRT"});
      await db.insert(goals).values({id:goalId,companyId,title:"Publish edited media"});
      await db.insert(issues).values({id:issueId,companyId,goalId,title:"Edit the video"});
      const sourcePath=join(fixtureDir,"source.mp4");
      await runFfmpeg(["-y","-f","lavfi","-i","color=c=blue:s=320x240:r=15:d=1.6","-f","lavfi","-i","sine=frequency=500:sample_rate=44100:duration=1.6","-map","0:v","-map","1:a","-c:v","libx264","-c:a","aac",sourcePath]);
      const stored=await getStorageService().putFile({companyId,namespace:"media-test-source",originalFilename:"source.mp4",contentType:"video/mp4",body:await readFile(sourcePath)});
      await db.insert(assets).values({id:assetId,companyId,provider:stored.provider,objectKey:stored.objectKey,contentType:stored.contentType,byteSize:stored.byteSize,sha256:stored.sha256,originalFilename:stored.originalFilename});
      const project=await mediaStudioService(db).createProject(companyId,{assetId},{userId:"media-test-user"},{goalId,issueId});
      expect(project).not.toBeNull();
      const transcriptBody=JSON.stringify({text:"hello media",language:"en",duration:1.6,words:[{text:"hello",start:0.7,end:1.0},{text:"media",start:1.05,end:1.4}]});
      const [transcript]=await db.insert(documents).values({companyId,title:"Fixture transcript",format:"json",latestBody:transcriptBody}).returning();
      await db.update(mediaProjects).set({transcriptDocumentId:transcript.id}).where(eq(mediaProjects.id,project!.id));
      await mediaStudioService(db).addOperations(companyId,project!.id,[
        {type:"cut_ranges",ranges:[{start:0.2,end:0.35}]},
        {type:"burn_subtitles",style:{size:18,color:"#FFFFFF",position:"bottom"}},
      ]);
      const job=await mediaStudioService(db).enqueue(companyId,project!.id,"render","render:private-output",{aspect:"9:16",primary:true});
      expect(job).not.toBeNull();
      let finished:typeof job | undefined;
      for(let attempt=0;attempt<300;attempt++) {
        const [current]=await db.select().from(mediaJobs).where(eq(mediaJobs.id,job!.id));
        if(current?.status==="done"||current?.status==="failed") { finished=current; break; }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      expect(finished?.status,finished?.error??"worker did not finish").toBe("done");
      expect(finished?.outputAssetId).toBeTruthy();
      const [product]=await db.select().from(issueWorkProducts).where(and(eq(issueWorkProducts.issueId,issueId),eq(issueWorkProducts.type,"media"))).limit(1);
      expect(product?.isPrimary).toBe(true);
      const metadata=product?.metadata as Record<string,unknown>;
      expect(metadata.mediaProjectId).toBe(project!.id);
      expect(metadata.attachmentId).toBeTruthy();
      expect(metadata.contentPath).toBe(`/api/attachments/${metadata.attachmentId}/content`);
      const [attachment]=await db.select().from(issueAttachments).where(eq(issueAttachments.id,String(metadata.attachmentId))).limit(1);
      expect(attachment?.issueId).toBe(issueId);
      expect(attachment?.assetId).toBe(finished!.outputAssetId);
      const [transcriptAfter]=await db.select().from(documents).where(eq(documents.id,transcript.id));
      expect(transcriptAfter?.latestBody).toBe(transcriptBody);
    } finally {
      if(previousStorageDir===undefined) delete process.env.PAPERCLIP_STORAGE_LOCAL_DIR; else process.env.PAPERCLIP_STORAGE_LOCAL_DIR=previousStorageDir;
      if(previousStorageProvider===undefined) delete process.env.PAPERCLIP_STORAGE_PROVIDER; else process.env.PAPERCLIP_STORAGE_PROVIDER=previousStorageProvider;
      await Promise.all([rm(storageDir,{recursive:true,force:true}),rm(fixtureDir,{recursive:true,force:true})]);
    }
  },Math.max(EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,90_000));
});
