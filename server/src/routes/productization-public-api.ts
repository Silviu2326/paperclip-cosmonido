import { Router, type RequestHandler } from "express";
import type { Db } from "@paperclipai/db";
import { assertBoard } from "./authz.js";
import { badRequest, forbidden, unauthorized } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { productizationPublicApiService, type PublicApiPrincipal } from "../services/productization/public-api.js";
import { businessWebhookCreateSchema, publicApiKeyCreateSchema, PUBLIC_API_SCOPES, type PublicApiScope } from "@paperclipai/shared/productization/public-api";

function boardUser(req:import("express").Request){if(req.actor.type!=="board"||!req.actor.userId||req.actor.userId==="local-board")throw forbidden("A signed-in company administrator is required.");return req.actor.userId;}
function scoped(scope:PublicApiScope,svc:ReturnType<typeof productizationPublicApiService>):RequestHandler{return async(req,res,next)=>{try{const header=req.get("authorization")??"";const match=header.match(/^Bearer\s+(\S+)$/i);if(!match)throw unauthorized("A scoped Public API bearer key is required.");res.locals.publicApiPrincipal=await svc.authorizeToken(match[1]!,scope);next();}catch(error){next(error);}};}
function principal(res:import("express").Response){return res.locals.publicApiPrincipal as PublicApiPrincipal;}

/** Mount at /api/v1 before actorMiddleware: these credentials are never ambient board actors. */
export function productizationPublicApiV1Routes(db:Db){
  const router=Router(),svc=productizationPublicApiService(db);
  router.get("/customers",scoped("customers:read",svc),async(req,res)=>res.json(await svc.listCustomers(principal(res),req.query)));
  router.get("/customers/:id",scoped("customers:read",svc),async(req,res)=>res.json(await svc.getCustomer(principal(res),req.params.id as string)));
  router.get("/leads",scoped("leads:read",svc),async(req,res)=>res.json(await svc.listLeads(principal(res),req.query)));
  router.get("/leads/:id",scoped("leads:read",svc),async(req,res)=>res.json(await svc.getLead(principal(res),req.params.id as string)));
  router.get("/assignments",scoped("assignments:read",svc),async(req,res)=>res.json(await svc.listAssignments(principal(res),req.query)));
  router.get("/assignments/:id",scoped("assignments:read",svc),async(req,res)=>res.json(await svc.getAssignment(principal(res),req.params.id as string)));
  router.get("/proposals",scoped("proposals:read",svc),async(req,res)=>res.json(await svc.listProposals(principal(res),req.query)));
  router.get("/proposals/:id",scoped("proposals:read",svc),async(req,res)=>res.json(await svc.getProposal(principal(res),req.params.id as string)));
  router.get("/results",scoped("results:read",svc),async(req,res)=>res.json(await svc.listResults(principal(res),req.query)));
  router.get("/results/:id",scoped("results:read",svc),async(req,res)=>res.json(await svc.getResult(principal(res),req.params.id as string)));
  router.get("/conversations",scoped("conversations:read",svc),async(req,res)=>res.json(await svc.listConversations(principal(res),req.query)));
  router.get("/conversations/:id",scoped("conversations:read",svc),async(req,res)=>res.json(await svc.getConversation(principal(res),req.params.id as string)));
  return router;
}

/** Mount below the authenticated /api router for key and webhook administration. */
export function productizationPublicApiManagementRoutes(db:Db){
  const router=Router(),svc=productizationPublicApiService(db);
  router.get("/productization/public-api/scopes",(_req,res)=>res.json({scopes:PUBLIC_API_SCOPES}));
  router.get("/productization/public-api/keys",async(req,res)=>{assertBoard(req);res.json(await svc.listKeys(boardUser(req),String(req.query.companyId??"")));});
  router.post("/productization/public-api/keys",validate(publicApiKeyCreateSchema),async(req,res)=>{assertBoard(req);const userId=boardUser(req);const created=await svc.createKey(userId,req.body);await logActivity(db,{companyId:created.key.companyId,actorType:"user",actorId:userId,action:"product_public_api_key.created",entityType:"product_public_api_key",entityId:created.key.id,details:{scopes:created.key.scopes,expiresAt:created.key.expiresAt}});res.status(201).json(created);});
  router.delete("/productization/public-api/keys/:id",async(req,res)=>{assertBoard(req);const userId=boardUser(req),companyId=String(req.query.companyId??"");if(!companyId)throw badRequest("companyId is required.");const result=await svc.revokeKey(userId,companyId,req.params.id as string);await logActivity(db,{companyId,actorType:"user",actorId:userId,action:"product_public_api_key.revoked",entityType:"product_public_api_key",entityId:req.params.id as string});res.json(result);});
  router.get("/productization/public-api/webhooks",async(req,res)=>{assertBoard(req);res.json(await svc.listWebhooks(boardUser(req),String(req.query.companyId??"")));});
  router.post("/productization/public-api/webhooks",validate(businessWebhookCreateSchema),async(req,res)=>{assertBoard(req);const userId=boardUser(req);const created=await svc.createWebhook(userId,req.body);await logActivity(db,{companyId:created.subscription.companyId,actorType:"user",actorId:userId,action:"business_webhook.created",entityType:"business_webhook_subscription",entityId:created.subscription.id,details:{events:created.subscription.events}});res.status(201).json(created);});
  router.post("/productization/public-api/webhooks/:id/rotate",async(req,res)=>{assertBoard(req);const userId=boardUser(req);const result=await svc.rotateWebhook(userId,req.params.id as string);await logActivity(db,{companyId:result.subscription.companyId,actorType:"user",actorId:userId,action:"business_webhook.secret_rotated",entityType:"business_webhook_subscription",entityId:result.subscription.id});res.json(result);});
  router.delete("/productization/public-api/webhooks/:id",async(req,res)=>{assertBoard(req);const userId=boardUser(req);const result=await svc.revokeWebhook(userId,req.params.id as string);await logActivity(db,{companyId:result.companyId,actorType:"user",actorId:userId,action:"business_webhook.revoked",entityType:"business_webhook_subscription",entityId:req.params.id as string});res.json(result);});
  return router;
}
