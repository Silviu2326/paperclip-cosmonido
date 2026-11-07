import { and, asc, count, desc, eq, gt, isNull, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { authUsers, boardApiKeys, companyMemberships, companies, customers, leads, goals, proposals, deliverableReviews, conversations } from "@paperclipai/db";
import { productPublicApiKeys, businessWebhookSubscriptions } from "@paperclipai/db";
import { businessWebhookCreateSchema, publicApiKeyCreateSchema, publicApiPageSchema, type PublicApiScope } from "@paperclipai/shared/productization/public-api";
import { accessService } from "../access.js";
import { localEncryptedProvider } from "../../secrets/local-encrypted-provider.js";
import { hashBearerToken } from "../board-auth.js";
import { callbackUrl, signingKey } from "../public-mcp/event-webhooks.js";
import { badRequest, conflict, forbidden, notFound, unauthorized, unprocessable } from "../../errors.js";

export type PublicApiPrincipal = { keyId:string; userId:string; companyId:string; scopes:PublicApiScope[] };
const uuidSchema=z.uuid();
function entityId(value:string){if(!uuidSchema.safeParse(value).success)throw notFound("Resource not found.");return value;}
function requestedCompanyId(value:string){if(!uuidSchema.safeParse(value).success)throw badRequest("A valid companyId is required.");return value;}
export function productizationPublicApiService(db:Db){
  const access=accessService(db);
  async function authorizeToken(token:string, required:PublicApiScope):Promise<PublicApiPrincipal>{
    if(!token.startsWith("pcp_public_"))throw unauthorized("Public API key is invalid.");
    const now=new Date();
    const [row]=await db.select({keyId:boardApiKeys.id,userId:boardApiKeys.userId,companyId:productPublicApiKeys.companyId,scopes:productPublicApiKeys.scopes})
      .from(boardApiKeys).innerJoin(productPublicApiKeys,and(eq(productPublicApiKeys.boardApiKeyId,boardApiKeys.id),eq(productPublicApiKeys.createdByUserId,boardApiKeys.userId))).innerJoin(authUsers,eq(authUsers.id,boardApiKeys.userId))
      .where(and(eq(boardApiKeys.keyHash,hashBearerToken(token)),isNull(boardApiKeys.revokedAt),or(isNull(boardApiKeys.expiresAt),gt(boardApiKeys.expiresAt,now)))).limit(1);
    if(!row)throw unauthorized("Public API key is invalid or expired.");
    const [membership]=await db.select({companyId:companyMemberships.companyId}).from(companyMemberships).where(and(eq(companyMemberships.companyId,row.companyId),eq(companyMemberships.principalType,"user"),eq(companyMemberships.principalId,row.userId),eq(companyMemberships.status,"active"))).limit(1);
    if(!membership)throw forbidden("The API key owner no longer has active company access.");
    if(!row.scopes.includes(required))throw forbidden("This key does not include the requested API scope.");
    return {keyId:row.keyId,userId:row.userId,companyId:row.companyId,scopes:row.scopes};
  }
  const page = (raw:{limit?:unknown;offset?:unknown})=>publicApiPageSchema.parse(raw);
  async function listRows<T>(rowsPromise:PromiseLike<T[]>,p:{limit:number;offset:number}){const rows=await rowsPromise;const hasMore=rows.length>p.limit;return {data:hasMore?rows.slice(0,p.limit):rows,page:{limit:p.limit,offset:p.offset,nextOffset:hasMore?p.offset+p.limit:null}};}
  async function createKey(userId:string,raw:unknown){
    const input=publicApiKeyCreateSchema.parse(raw);
    if(!await access.canUser(input.companyId,userId,"users:manage_permissions"))throw forbidden("Company permission management authority is required.");
    const token=`pcp_public_${randomBytes(32).toString("hex")}`;
    const expiresAt=new Date(Date.now()+input.expiresInDays*86_400_000);
    const result=await db.transaction(async tx=>{
      const [company]=await tx.select({id:companies.id}).from(companies).where(eq(companies.id,input.companyId)).for("update").limit(1);
      if(!company)throw notFound("Company not found.");
      const [active]=await tx.select({value:count()}).from(productPublicApiKeys).innerJoin(boardApiKeys,eq(boardApiKeys.id,productPublicApiKeys.boardApiKeyId)).where(and(eq(productPublicApiKeys.companyId,input.companyId),isNull(boardApiKeys.revokedAt),or(isNull(boardApiKeys.expiresAt),gt(boardApiKeys.expiresAt,new Date()))));
      if((active?.value??0)>=50)throw conflict("This company has reached the 50 active Public API key limit.",{code:"public_api_key_limit"});
      const [key]=await tx.insert(boardApiKeys).values({userId,name:input.name,keyHash:hashBearerToken(token),expiresAt}).returning({id:boardApiKeys.id,name:boardApiKeys.name,createdAt:boardApiKeys.createdAt,expiresAt:boardApiKeys.expiresAt});
      if(!key)throw conflict("Public API key could not be created.");
      await tx.insert(productPublicApiKeys).values({boardApiKeyId:key.id,companyId:input.companyId,createdByUserId:userId,scopes:input.scopes});
      return key;
    });
    return {key:{id:result.id,name:result.name,companyId:input.companyId,scopes:input.scopes,createdAt:result.createdAt.toISOString(),expiresAt:result.expiresAt?.toISOString()??null,revokedAt:null},token};
  }
  async function listKeys(userId:string,companyId:string){
    companyId=requestedCompanyId(companyId);
    if(!await access.canUser(companyId,userId,"users:manage_permissions"))throw forbidden("Company permission management authority is required.");
    return db.select({id:boardApiKeys.id,name:boardApiKeys.name,companyId:productPublicApiKeys.companyId,scopes:productPublicApiKeys.scopes,createdAt:boardApiKeys.createdAt,expiresAt:boardApiKeys.expiresAt,revokedAt:boardApiKeys.revokedAt}).from(productPublicApiKeys).innerJoin(boardApiKeys,eq(boardApiKeys.id,productPublicApiKeys.boardApiKeyId)).where(eq(productPublicApiKeys.companyId,companyId)).orderBy(desc(boardApiKeys.createdAt));
  }
  async function revokeKey(userId:string,companyId:string,keyId:string){
    companyId=requestedCompanyId(companyId);keyId=entityId(keyId);
    if(!await access.canUser(companyId,userId,"users:manage_permissions"))throw forbidden("Company permission management authority is required.");
    return db.transaction(async tx=>{
      const [key]=await tx.select({id:boardApiKeys.id}).from(productPublicApiKeys).innerJoin(boardApiKeys,eq(boardApiKeys.id,productPublicApiKeys.boardApiKeyId)).where(and(eq(productPublicApiKeys.companyId,companyId),eq(boardApiKeys.id,keyId))).limit(1);
      if(!key)throw notFound("Public API key not found.");
      await tx.update(boardApiKeys).set({revokedAt:new Date()}).where(and(eq(boardApiKeys.id,key.id),isNull(boardApiKeys.revokedAt)));
      return {revoked:true};
    });
  }
  function safeWebhook(row:typeof businessWebhookSubscriptions.$inferSelect){return {id:row.id,companyId:row.companyId,url:row.url,events:row.events,status:row.status as "active"|"blocked"|"revoked",secretConfigured:Boolean(row.secretMaterial),createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),lastDeliveryAt:row.lastDeliveryAt?.toISOString()??null,lastError:row.lastError};}
  async function createWebhook(userId:string,raw:unknown){
    const input=businessWebhookCreateSchema.parse(raw);
    if(!await access.canUser(input.companyId,userId,"users:manage_permissions"))throw forbidden("Company permission management authority is required.");
    let url:string;try{url=callbackUrl(input.url);}catch{throw unprocessable("Webhook recipient must be a valid HTTPS URL.",{code:"webhook_recipient_invalid"});}
    const signingSecret=`whsec_${randomBytes(32).toString("base64")}`;signingKey(signingSecret);
    const secretMaterial=JSON.stringify((await localEncryptedProvider.createSecret({value:JSON.stringify({secret:signingSecret})})).material);
    const row=await db.transaction(async tx=>{
      const [company]=await tx.select({id:companies.id}).from(companies).where(eq(companies.id,input.companyId)).for("update").limit(1);if(!company)throw notFound("Company not found.");
      const [active]=await tx.select({value:count()}).from(businessWebhookSubscriptions).where(and(eq(businessWebhookSubscriptions.companyId,input.companyId),eq(businessWebhookSubscriptions.status,"active")));
      if((active?.value??0)>=20)throw conflict("This company has reached the 20 active business webhook limit.",{code:"business_webhook_limit"});
      const [created]=await tx.insert(businessWebhookSubscriptions).values({companyId:input.companyId,createdByUserId:userId,url,events:input.events,secretMaterial,status:"active"}).returning();return created;
    });
    if(!row)throw conflict("Webhook subscription could not be created.");
    return {subscription:safeWebhook(row),signingSecret};
  }
  async function listWebhooks(userId:string,companyId:string){companyId=requestedCompanyId(companyId);if(!await access.canUser(companyId,userId,"users:manage_permissions"))throw forbidden("Company permission management authority is required.");const rows=await db.select().from(businessWebhookSubscriptions).where(eq(businessWebhookSubscriptions.companyId,companyId)).orderBy(desc(businessWebhookSubscriptions.createdAt));return rows.map(safeWebhook);}
  async function rotateWebhook(userId:string,id:string){
    id=entityId(id);
    const [old]=await db.select().from(businessWebhookSubscriptions).where(eq(businessWebhookSubscriptions.id,id)).limit(1);if(!old)throw notFound("Webhook subscription not found.");
    if(!await access.canUser(old.companyId,userId,"users:manage_permissions"))throw forbidden("Company permission management authority is required.");
    const signingSecret=`whsec_${randomBytes(32).toString("base64")}`;signingKey(signingSecret);
    const secretMaterial=JSON.stringify((await localEncryptedProvider.createSecret({value:JSON.stringify({secret:signingSecret})})).material);
    const [row]=await db.update(businessWebhookSubscriptions).set({secretMaterial,status:"active",lastError:null,updatedAt:new Date()}).where(eq(businessWebhookSubscriptions.id,id)).returning();
    return {subscription:safeWebhook(row!),signingSecret};
  }
  async function revokeWebhook(userId:string,id:string){id=entityId(id);const [old]=await db.select().from(businessWebhookSubscriptions).where(eq(businessWebhookSubscriptions.id,id)).limit(1);if(!old)throw notFound("Webhook subscription not found.");if(!await access.canUser(old.companyId,userId,"users:manage_permissions"))throw forbidden("Company permission management authority is required.");await db.update(businessWebhookSubscriptions).set({status:"revoked",updatedAt:new Date()}).where(eq(businessWebhookSubscriptions.id,id));return {companyId:old.companyId,revoked:true};}
  async function listCustomers(principal:PublicApiPrincipal,q:{limit?:unknown;offset?:unknown}){const p=page(q);return listRows(db.select({id:customers.id,name:customers.name,kind:customers.kind,domain:customers.domain,status:customers.status,createdAt:customers.createdAt,updatedAt:customers.updatedAt}).from(customers).where(eq(customers.companyId,principal.companyId)).orderBy(asc(customers.createdAt),asc(customers.id)).limit(p.limit+1).offset(p.offset),p);}
  async function getCustomer(principal:PublicApiPrincipal,id:string){id=entityId(id);const [row]=await db.select({id:customers.id,name:customers.name,kind:customers.kind,domain:customers.domain,status:customers.status,createdAt:customers.createdAt,updatedAt:customers.updatedAt}).from(customers).where(and(eq(customers.companyId,principal.companyId),eq(customers.id,id))).limit(1);if(!row)throw notFound("Customer not found.");return {data:row};}
  async function listLeads(principal:PublicApiPrincipal,q:{limit?:unknown;offset?:unknown}){const p=page(q);return listRows(db.select({id:leads.id,source:leads.source,status:leads.status,priority:leads.priority,customerId:leads.customerId,createdAt:leads.createdAt,updatedAt:leads.updatedAt}).from(leads).where(eq(leads.companyId,principal.companyId)).orderBy(asc(leads.createdAt),asc(leads.id)).limit(p.limit+1).offset(p.offset),p);}
  async function getLead(principal:PublicApiPrincipal,id:string){id=entityId(id);const [row]=await db.select({id:leads.id,source:leads.source,status:leads.status,priority:leads.priority,customerId:leads.customerId,createdAt:leads.createdAt,updatedAt:leads.updatedAt}).from(leads).where(and(eq(leads.companyId,principal.companyId),eq(leads.id,id))).limit(1);if(!row)throw notFound("Lead not found.");return {data:row};}
  async function listAssignments(principal:PublicApiPrincipal,q:{limit?:unknown;offset?:unknown}){const p=page(q);return listRows(db.select({id:goals.id,title:goals.title,status:goals.status,budgetCents:goals.budgetCents,projectId:goals.projectId,rootIssueId:goals.rootIssueId,createdAt:goals.createdAt,updatedAt:goals.updatedAt}).from(goals).where(and(eq(goals.companyId,principal.companyId),eq(goals.kind,"assignment"))).orderBy(asc(goals.createdAt),asc(goals.id)).limit(p.limit+1).offset(p.offset),p);}
  async function getAssignment(principal:PublicApiPrincipal,id:string){id=entityId(id);const [row]=await db.select({id:goals.id,title:goals.title,status:goals.status,budgetCents:goals.budgetCents,projectId:goals.projectId,rootIssueId:goals.rootIssueId,createdAt:goals.createdAt,updatedAt:goals.updatedAt}).from(goals).where(and(eq(goals.companyId,principal.companyId),eq(goals.kind,"assignment"),eq(goals.id,id))).limit(1);if(!row)throw notFound("Assignment not found.");return {data:row};}
  async function listProposals(principal:PublicApiPrincipal,q:{limit?:unknown;offset?:unknown}){const p=page(q);return listRows(db.select({id:proposals.id,proposalKey:proposals.proposalKey,revision:proposals.revision,title:proposals.title,status:proposals.status,currency:proposals.currency,priceCents:proposals.priceCents,acceptedAt:proposals.acceptedAt,createdAt:proposals.createdAt,updatedAt:proposals.updatedAt}).from(proposals).where(eq(proposals.companyId,principal.companyId)).orderBy(asc(proposals.createdAt),asc(proposals.id)).limit(p.limit+1).offset(p.offset),p);}
  async function getProposal(principal:PublicApiPrincipal,id:string){id=entityId(id);const [row]=await db.select({id:proposals.id,proposalKey:proposals.proposalKey,revision:proposals.revision,title:proposals.title,status:proposals.status,currency:proposals.currency,priceCents:proposals.priceCents,acceptedAt:proposals.acceptedAt,createdAt:proposals.createdAt,updatedAt:proposals.updatedAt}).from(proposals).where(and(eq(proposals.companyId,principal.companyId),eq(proposals.id,id))).limit(1);if(!row)throw notFound("Proposal not found.");return {data:row};}
  async function listResults(principal:PublicApiPrincipal,q:{limit?:unknown;offset?:unknown}){const p=page(q);return listRows(db.select({id:deliverableReviews.id,targetKind:deliverableReviews.targetKind,targetId:deliverableReviews.targetId,state:deliverableReviews.state,reviewedAt:deliverableReviews.reviewedAt,createdAt:deliverableReviews.createdAt}).from(deliverableReviews).where(and(eq(deliverableReviews.companyId,principal.companyId),eq(deliverableReviews.state,"accepted"))).orderBy(asc(deliverableReviews.createdAt),asc(deliverableReviews.id)).limit(p.limit+1).offset(p.offset),p);}
  async function getResult(principal:PublicApiPrincipal,id:string){id=entityId(id);const [row]=await db.select({id:deliverableReviews.id,targetKind:deliverableReviews.targetKind,targetId:deliverableReviews.targetId,state:deliverableReviews.state,reviewedAt:deliverableReviews.reviewedAt,createdAt:deliverableReviews.createdAt}).from(deliverableReviews).where(and(eq(deliverableReviews.companyId,principal.companyId),eq(deliverableReviews.id,id),eq(deliverableReviews.state,"accepted"))).limit(1);if(!row)throw notFound("Accepted result not found.");return {data:row};}
  async function listConversations(principal:PublicApiPrincipal,q:{limit?:unknown;offset?:unknown}){const p=page(q);return listRows(db.select({id:conversations.id,channel:conversations.channel,status:conversations.status,customerId:conversations.customerId,leadId:conversations.leadId,createdAt:conversations.createdAt,updatedAt:conversations.updatedAt}).from(conversations).where(eq(conversations.companyId,principal.companyId)).orderBy(asc(conversations.createdAt),asc(conversations.id)).limit(p.limit+1).offset(p.offset),p);}
  async function getConversation(principal:PublicApiPrincipal,id:string){id=entityId(id);const [row]=await db.select({id:conversations.id,channel:conversations.channel,status:conversations.status,customerId:conversations.customerId,leadId:conversations.leadId,createdAt:conversations.createdAt,updatedAt:conversations.updatedAt}).from(conversations).where(and(eq(conversations.companyId,principal.companyId),eq(conversations.id,id))).limit(1);if(!row)throw notFound("Conversation not found.");return {data:row};}
  return {authorizeToken,createKey,listKeys,revokeKey,createWebhook,listWebhooks,rotateWebhook,revokeWebhook,listCustomers,getCustomer,listLeads,getLead,listAssignments,getAssignment,listProposals,getProposal,listResults,getResult,listConversations,getConversation};
}
