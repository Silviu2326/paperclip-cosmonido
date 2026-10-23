import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { badRequest, forbidden } from "../errors.js";
import { CRM_SYNC_PROVIDERS, crmSyncService, type CrmConnectorInvoker, type CrmSyncProvider, type CrmSyncService } from "../services/crm-sync/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

// External CRM sync (pista L). Mount under /api. Reads are open to the company's agents (the
// `crm_sync_status` tool); configuring, starting and resolving are board-only.
//
//   GET  /companies/:companyId/crm/sync/status?provider        real state: config, connection, links, jobs, blockers
//   PUT  /companies/:companyId/crm/sync/:provider/config       { connectionId, direction, primarySystem, enabled, toolNames? }
//   POST /companies/:companyId/crm/sync/:provider/disconnect   stops syncing; keeps local data and links
//   POST /companies/:companyId/crm/sync/:provider/jobs         { idempotencyKey? } 201 done, 202 unfinished
//   GET  /companies/:companyId/crm/sync/jobs?provider          recent jobs
//   GET  /companies/:companyId/crm/sync/jobs/:jobId
//   POST /companies/:companyId/crm/sync/jobs/:jobId/resume     continue an unfinished job
//   GET  /companies/:companyId/crm/sync/attention              conflicts, unconfirmed creates, errors
//   POST /companies/:companyId/crm/sync/links/:linkId/resolve  { resolution, externalId? }

const providerSchema = z.enum(CRM_SYNC_PROVIDERS);
const toolNamesSchema = z
  .partialRecord(z.enum(["listCustomer", "createCustomer", "updateCustomer", "listContact", "createContact", "updateContact"]), z.string().trim().min(1).max(120))
  .optional();

const configSchema = z
  .object({
    connectionId: z.string().uuid(),
    direction: z.enum(["import", "export", "both"]),
    primarySystem: z.enum(["paperclip", "external", "manual"]),
    enabled: z.boolean(),
    toolNames: toolNamesSchema,
  })
  .strict();

const jobSchema = z.object({ idempotencyKey: z.string().min(8).max(200).optional() }).strict();
const resolveSchema = z
  .object({
    resolution: z.enum(["keep_local", "keep_external", "retry_create", "link_external"]),
    externalId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

function parse<T extends z.ZodType>(schema: T, value: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw badRequest(message, parsed.error.issues);
  return parsed.data;
}

export interface CrmSyncRoutesOptions {
  /** Calls a tool of the company's HubSpot/Pipedrive connection. Without it, jobs are refused with a clear message. */
  invoke?: CrmConnectorInvoker;
  /** Share one service with the scheduler (`tick`). Defaults to a service built from `invoke`. */
  service?: CrmSyncService;
}

export function crmSyncRoutes(db: Db, options: CrmSyncRoutesOptions = {}) {
  const router = Router();
  const service = options.service ?? crmSyncService(db, { invoke: options.invoke });

  function board(req: import("express").Request, action: string) {
    const actor = getActorInfo(req);
    if (actor.actorType !== "user") throw forbidden(`Only board users can ${action}`);
    return actor;
  }

  function companyOf(req: import("express").Request) {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    return companyId;
  }

  function providerOf(req: import("express").Request): CrmSyncProvider {
    return parse(providerSchema, req.params.provider, "Unknown CRM provider");
  }

  router.get("/companies/:companyId/crm/sync/status", async (req, res) => {
    const companyId = companyOf(req);
    const only = req.query.provider === undefined ? undefined : parse(providerSchema, req.query.provider, "Unknown CRM provider");
    res.json({ providers: await service.status(companyId, only) });
  });

  router.get("/companies/:companyId/crm/sync/connections", async (req, res) => {
    const companyId = companyOf(req);
    const provider = parse(providerSchema, req.query.provider, "Unknown CRM provider");
    res.json(await service.listConnections(companyId, provider));
  });

  router.put("/companies/:companyId/crm/sync/:provider/config", async (req, res) => {
    const companyId = companyOf(req);
    const actor = board(req, "configure CRM sync");
    const input = parse(configSchema, req.body, "Invalid CRM sync settings");
    await service.saveConfig(companyId, providerOf(req), { ...input, toolNames: input.toolNames as Record<string, string> | undefined }, actor.actorId);
    res.json({ providers: await service.status(companyId, providerOf(req)) });
  });

  router.post("/companies/:companyId/crm/sync/:provider/disconnect", async (req, res) => {
    const companyId = companyOf(req);
    const actor = board(req, "disconnect CRM sync");
    await service.disconnect(companyId, providerOf(req), actor.actorId);
    res.json({ providers: await service.status(companyId, providerOf(req)) });
  });

  router.post("/companies/:companyId/crm/sync/:provider/jobs", async (req, res) => {
    const companyId = companyOf(req);
    const actor = board(req, "start a CRM sync");
    const input = parse(jobSchema, req.body ?? {}, "Invalid CRM sync request");
    const job = await service.startJob(companyId, providerOf(req), actor.actorId, input.idempotencyKey ?? randomUUID());
    res.status(job.status === "queued" || job.status === "running" ? 202 : 201).json(job);
  });

  router.get("/companies/:companyId/crm/sync/jobs", async (req, res) => {
    const companyId = companyOf(req);
    const only = req.query.provider === undefined ? undefined : parse(providerSchema, req.query.provider, "Unknown CRM provider");
    res.json(await service.listJobs(companyId, only));
  });

  router.get("/companies/:companyId/crm/sync/jobs/:jobId", async (req, res) => {
    res.json(await service.getJob(companyOf(req), req.params.jobId as string));
  });

  router.post("/companies/:companyId/crm/sync/jobs/:jobId/resume", async (req, res) => {
    const companyId = companyOf(req);
    board(req, "continue a CRM sync");
    const job = await service.resumeJob(companyId, req.params.jobId as string);
    res.status(job.status === "queued" || job.status === "running" ? 202 : 200).json(job);
  });

  router.get("/companies/:companyId/crm/sync/attention", async (req, res) => {
    const companyId = companyOf(req);
    board(req, "review CRM sync conflicts");
    const only = req.query.provider === undefined ? undefined : parse(providerSchema, req.query.provider, "Unknown CRM provider");
    res.json(await service.listAttention(companyId, only));
  });

  router.post("/companies/:companyId/crm/sync/links/:linkId/resolve", async (req, res) => {
    const companyId = companyOf(req);
    const actor = board(req, "resolve CRM sync conflicts");
    const input = parse(resolveSchema, req.body, "Invalid resolution");
    res.json(await service.resolveLink(companyId, req.params.linkId as string, input, actor.actorId));
  });

  return router;
}
