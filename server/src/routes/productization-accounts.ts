import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertBoard, assertCompanyAccess, assertInstanceAdmin } from "./authz.js";
import { productizationAccountsService } from "../services/productization/accounts.js";
import { productAccountCompanyGrantSchema, productAccountCreateSchema, productAccountMemberSchema, productPlanSchema } from "@paperclipai/shared/productization/accounts";
import { validate } from "../middleware/validate.js";
import { forbidden, badRequest } from "../errors.js";
import { accessService } from "../services/access.js";
export function productizationAccountRoutes(db:Db){
 const r=Router(),svc=productizationAccountsService(db),access=accessService(db);
 const user=(req:import("express").Request)=>{if(req.actor.type!=="board"||!req.actor.userId) throw forbidden("Signed-in account user required");return req.actor.userId;};
 r.get("/productization/accounts",async(req,res)=>{assertBoard(req);res.json(await svc.list(user(req)));});
 r.post("/productization/accounts",validate(productAccountCreateSchema),async(req,res)=>{assertBoard(req);res.status(201).json(await svc.create(user(req),req.body));});
 r.get("/productization/accounts/:accountId",async(req,res)=>{assertBoard(req);res.json(await svc.snapshot(req.params.accountId as string,user(req)));});
 r.get("/productization/accounts/:accountId/members",async(req,res)=>{assertBoard(req);res.json(await svc.members(req.params.accountId as string,user(req)));});
 r.post("/productization/accounts/:accountId/members",validate(productAccountMemberSchema),async(req,res)=>{assertBoard(req);res.status(201).json(await svc.addMember(req.params.accountId as string,user(req),req.body.userId,req.body.role));});
 r.post("/productization/accounts/:accountId/companies",validate(productAccountCompanyGrantSchema),async(req,res)=>{assertBoard(req);const id=req.body.companyId as string;assertCompanyAccess(req,id);const actor=user(req);if(!await access.canUser(id,actor,"users:manage_permissions"))throw forbidden("Company permission management authority is required to link billing.");res.status(201).json(await svc.grantCompany(req.params.accountId as string,actor,id));});
 r.get("/productization/plans",async(_req,res)=>res.json(await svc.plans()));
 r.put("/productization/plans/:planId",async(req,res)=>{assertInstanceAdmin(req);const parsed=productPlanSchema.safeParse({...req.body,id:req.params.planId});if(!parsed.success)throw badRequest("Plan fields or capacity limits are invalid.",{issues:parsed.error.issues});const {id,name,limits,stripePriceId,enabled}=parsed.data;res.json(await svc.setPlan(user(req),id,name,limits,stripePriceId,enabled));});
 r.post("/productization/accounts/:accountId/billing/checkout",async(req,res)=>{assertBoard(req);res.json(await svc.checkout(req.params.accountId as string,user(req),String(req.body.planId??""),String(req.body.successUrl??""),String(req.body.cancelUrl??"")));});
 r.post("/productization/accounts/:accountId/billing/portal",async(req,res)=>{assertBoard(req);res.json(await svc.portal(req.params.accountId as string,user(req),String(req.body.returnUrl??"")));});
 r.get("/productization/accounts/:accountId/billing",async(req,res)=>{assertBoard(req);res.json(await svc.billingStatus(req.params.accountId as string,user(req)));});
 r.post("/public/productization/stripe/webhook",async(req,res)=>{const raw=(req as unknown as {rawBody?:Buffer}).rawBody;if(!Buffer.isBuffer(raw))throw badRequest("Webhook body missing");res.json(await svc.webhook(raw,req.get("stripe-signature")??undefined));});
 return r;
}

