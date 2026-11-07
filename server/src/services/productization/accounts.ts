import { and, count, eq, inArray, lte, ne, sql, sum } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers, productAccounts, productAccountMembers, productAccountCompanyGrants, productAccountUsageNotifications, productPlans, productUsageMeters, productUsageEvents, productBillingEvents, productAccountAuditEvents, companies, agents, toolConnections, productUsageReservations } from "@paperclipai/db";
import { evaluatePlanGate, type PlanGateMetric, type PlanGatePeriod } from "@paperclipai/shared/productization/plan-gate";
import { productAccountCreateSchema, productUsageRecordSchema } from "@paperclipai/shared/productization/accounts";
import { productSignupPlanIntentSchema, productTrialDaysSchema, productTrialStartSchema } from "@paperclipai/shared/productization/trial";
import { forbidden, notFound, unprocessable, conflict } from "../../errors.js";
import { verifyStripeSignature } from "../stripe-payment-links.js";
import { productizationEntitlementsService } from "./entitlements.js";

function configuredTrialDays(): number | null {
  const raw = process.env.PAPERCLIP_PRODUCT_TRIAL_DAYS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = productTrialDaysSchema.safeParse(Number(raw));
  return parsed.success ? parsed.data : null;
}

const STRIPE = "https://api.stripe.com";
const STRIPE_API_VERSION = "2026-09-30.endive";
function assertAllowedReturnUrl(value:string){
  const configured=(process.env.PAPERCLIP_BILLING_RETURN_ORIGINS??"").split(",").map(origin=>origin.trim()).filter(Boolean);
  if(!configured.length)throw unprocessable("Paperclip billing return origins are not configured.",{code:"billing_return_origins_not_configured"});
  let url:URL;try{url=new URL(value);}catch{throw unprocessable("Billing return URL is invalid.",{code:"billing_return_url_invalid"});}
  if(url.protocol!=="https:"&&url.hostname!=="localhost")throw unprocessable("Billing return URL must use HTTPS.",{code:"billing_return_url_invalid"});
  if(!configured.includes(url.origin))throw unprocessable("Billing return URL origin is not allowed.",{code:"billing_return_origin_not_allowed"});
  return url.toString();
}
async function stripePost(path: string, secret: string, fields: Record<string,string>, idempotencyKey:string) {
  const body = new URLSearchParams(fields);
  const response = await fetch(`${STRIPE}${path}`, { method: "POST", signal:AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version":STRIPE_API_VERSION, "Idempotency-Key":idempotencyKey }, body });
  const json = await response.json() as Record<string, any>;
  if (!response.ok) throw new Error(`Stripe request failed (${response.status})`);
  return json;
}
async function stripeGet(path:string,secret:string){
  const response=await fetch(`${STRIPE}${path}`,{signal:AbortSignal.timeout(10_000),headers:{Authorization:`Bearer ${secret}`,"Stripe-Version":STRIPE_API_VERSION}});
  const json=await response.json() as Record<string,any>;
  if(!response.ok)throw new Error(`Stripe request failed (${response.status})`);
  return json;
}

export function productizationAccountsService(db: Db) {
  const entitlements=productizationEntitlementsService(db);
  const audit=async(tx:Parameters<Parameters<Db["transaction"]>[0]>[0],accountId:string|null,actorId:string,action:string,entityType:string,entityId:string,details:Record<string,unknown>={})=>{
    await tx.insert(productAccountAuditEvents).values({accountId,actorId,actorType:"user",action,entityType,entityId,details});
  };
  const self = async (accountId: string, userId: string) => {
    const [membership] = await db.select({role: productAccountMembers.role}).from(productAccountMembers).where(and(eq(productAccountMembers.accountId, accountId), eq(productAccountMembers.userId, userId))).limit(1);
    if (!membership) throw forbidden("Commercial account membership required");
    return membership;
  };
  return {
    create: async (userId: string, input: unknown) => {
      const {name} = productAccountCreateSchema.parse(input);
      const [defaultPlan] = await db.select({id: productPlans.id}).from(productPlans).where(eq(productPlans.enabled, 1)).limit(1);

      return db.transaction(async tx => {
        const [account] = await tx.insert(productAccounts).values({ownerUserId:userId,name,planId:defaultPlan?.id??"unconfigured",access:"inactive"}).returning();
        await tx.insert(productAccountMembers).values({accountId:account!.id,userId,role:"owner"});
        await audit(tx,account!.id,userId,"account.created","product_account",account!.id);
        await audit(tx,account!.id,userId,"member.added","product_account_member",userId,{role:"owner"});
        return {id:account!.id,name:account!.name,planId:account!.planId,access:account!.access,trialStartedAt:null,trialExpiresAt:null,createdAt:account!.createdAt,updatedAt:account!.updatedAt};
      });
    },
    /** Prepare a selected plan for a signed-up user without claiming access or inventing a price. */
    prepareSignupPlan: async (userId: string, input: unknown) => {
      const parsed = productSignupPlanIntentSchema.safeParse(input);
      if (!parsed.success) throw unprocessable("Choose an available Paperclip plan.", { code: "signup_plan_invalid" });
      return db.transaction(async (tx) => {
        const [user] = await tx.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email }).from(authUsers)
          .where(eq(authUsers.id, userId)).for("update").limit(1);
        if (!user) throw forbidden("Signed-in account user required");
        const [plan] = await tx.select({ id: productPlans.id }).from(productPlans)
          .where(and(eq(productPlans.id, parsed.data.planId), eq(productPlans.enabled, 1))).limit(1);
        if (!plan) throw notFound("Selected Paperclip plan is unavailable");
        const [prior] = await tx.select().from(productAccounts).where(and(
          eq(productAccounts.ownerUserId, userId), eq(productAccounts.planId, plan.id),
          sql`${productAccounts.stripeCustomerId} is null`, sql`${productAccounts.stripeSubscriptionId} is null`,
        )).orderBy(sql`${productAccounts.trialStartedAt} desc nulls last`, sql`${productAccounts.createdAt} desc`).for("update").limit(1);
        if (prior) return { accountId: prior.id, planId: prior.planId, access: prior.access, trialExpiresAt: prior.trialExpiresAt?.toISOString() ?? null, status: prior.trialStartedAt ? "trial_already_started" as const : "plan_prepared" as const };
        const now = new Date();
        const [account] = await tx.insert(productAccounts).values({ ownerUserId: userId, name: user.name.trim() || user.email, planId: plan.id, access: "inactive" }).returning();
        if (!account) throw conflict("Could not prepare the selected plan.", { code: "signup_plan_prepare_conflict" });
        await tx.insert(productAccountMembers).values({ accountId: account.id, userId, role: "owner" });
        await audit(tx, account.id, userId, "account.signup_plan_selected", "product_account", account.id, { planId: plan.id });
        return { accountId: account.id, planId: plan.id, access: account.access, trialExpiresAt: null, status: "plan_prepared" as const };
      });
    },
    /** Create one durable, account-wide trial for a freshly verified user. Operator config supplies duration. */
    startTrial: async (userId: string, input: unknown) => {
      const parsed = productTrialStartSchema.safeParse(input);
      if (!parsed.success) throw unprocessable("Choose a prepared Paperclip account.", { code: "trial_account_invalid" });
      const trialDays = configuredTrialDays();
      if (!trialDays) throw unprocessable("Free trials are not configured on this Paperclip instance.", { code: "trial_not_configured" });
      return db.transaction(async (tx) => {
        const [user] = await tx.select({ id: authUsers.id, emailVerified: authUsers.emailVerified })
          .from(authUsers).where(eq(authUsers.id, userId)).for("update").limit(1);
        if (!user) throw forbidden("Signed-in user required");
        if (!user.emailVerified) throw unprocessable("Verify your email before starting a free trial.", { code: "trial_email_verification_required" });
        const [prepared] = await tx.select().from(productAccounts).where(and(eq(productAccounts.id, parsed.data.accountId), eq(productAccounts.ownerUserId, userId))).for("update").limit(1);
        if (!prepared) throw forbidden("Only the account owner can start its trial.");
        const [plan] = await tx.select().from(productPlans).where(and(eq(productPlans.id, prepared.planId), eq(productPlans.enabled, 1))).limit(1);
        if (!plan) throw notFound("Selected Paperclip plan is unavailable");
        const [prior] = await tx.select().from(productAccounts).where(and(eq(productAccounts.ownerUserId, userId), sql`${productAccounts.trialStartedAt} is not null`)).for("update").limit(1);
        if (prior) {
          if (prior.id !== prepared.id) throw conflict("This user already used their one available account trial.", { code: "trial_already_claimed", accountId: prior.id });
          return { accountId: prior.id, planId: prior.planId, access: prior.trialExpiresAt && prior.trialExpiresAt.getTime() <= Date.now() ? "inactive" as const : prior.access as "trial_eligible" | "active" | "inactive", trialStartedAt: prior.trialStartedAt?.toISOString() ?? null, trialExpiresAt: prior.trialExpiresAt?.toISOString() ?? null, status: "already_started" as const };
        }
        const now = new Date();
        const expiresAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
        if (prepared.access !== "inactive" || prepared.stripeCustomerId || prepared.stripeSubscriptionId || prepared.trialStartedAt) throw conflict("This account is not eligible for a trial.", { code: "trial_account_ineligible" });
        const [updated] = await tx.update(productAccounts).set({ access: "trial_eligible", trialStartedAt: now, trialExpiresAt: expiresAt, updatedAt: now })
          .where(and(eq(productAccounts.id, prepared.id), eq(productAccounts.ownerUserId, userId), eq(productAccounts.access, "inactive"), sql`${productAccounts.trialStartedAt} is null`, sql`${productAccounts.stripeCustomerId} is null`, sql`${productAccounts.stripeSubscriptionId} is null`)).returning();
        if (!updated) throw conflict("Trial account changed concurrently.", { code: "trial_creation_conflict" });
        await audit(tx, updated.id, userId, "account.trial_started", "product_account", updated.id, { planId: plan.id, trialDays });
        return { accountId: updated.id, planId: updated.planId, access: "trial_eligible" as const, trialStartedAt: now.toISOString(), trialExpiresAt: expiresAt.toISOString(), status: "started" as const };
      });
    },
    list: async (userId: string) => (await db.select({id:productAccounts.id,name:productAccounts.name,planId:productAccounts.planId,access:productAccounts.access,trialStartedAt:productAccounts.trialStartedAt,trialExpiresAt:productAccounts.trialExpiresAt,createdAt:productAccounts.createdAt,updatedAt:productAccounts.updatedAt,role:productAccountMembers.role}).from(productAccountMembers).innerJoin(productAccounts,eq(productAccounts.id,productAccountMembers.accountId)).where(eq(productAccountMembers.userId,userId))).map(({role,...account})=>({account,role})),
    members: async (accountId:string,userId:string) => { await self(accountId,userId); return db.select({userId:productAccountMembers.userId,role:productAccountMembers.role,createdAt:productAccountMembers.createdAt}).from(productAccountMembers).where(eq(productAccountMembers.accountId,accountId)); },
    addMember: async (accountId:string,actorId:string,targetUserId:string,role:"admin"|"member") => {
      const member=await self(accountId,actorId); if(member.role!=="owner"&&member.role!=="admin") throw forbidden("Account admin access required");
      await db.transaction(async tx=>{const [row]=await tx.insert(productAccountMembers).values({accountId,userId:targetUserId,role}).onConflictDoNothing().returning({id:productAccountMembers.id});if(row)await audit(tx,accountId,actorId,"member.added","product_account_member",targetUserId,{role});});
      return {accountId,userId:targetUserId,role};
    },
    grantCompany: async (accountId:string,userId:string,companyId:string) => {
      const member=await self(accountId,userId);
      if(member.role!=="owner"&&member.role!=="admin") throw forbidden("Account admin access required");
      const [company]=await db.select({id:companies.id}).from(companies).where(eq(companies.id,companyId)).limit(1);
      if(!company) throw notFound("Company not found");
      const [existing]=await db.select({accountId:productAccountCompanyGrants.accountId}).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.companyId,companyId)).limit(1);
      if(existing&&existing.accountId!==accountId) throw conflict("Company already belongs to another billing account.",{code:"company_already_granted"});
      if(existing?.accountId===accountId) return {accountId,companyId};
      const reservation=await entitlements.reserveForAccount({accountId,companyId,metric:"companies",quantity:1,idempotencyKey:`company-grant:${accountId}:${companyId}`,requestFingerprint:`${accountId}:${companyId}`});
      const [inserted]=await db.transaction(async tx=>{const [row]=await tx.insert(productAccountCompanyGrants).values({accountId,companyId,grantedByUserId:userId}).onConflictDoNothing().returning({accountId:productAccountCompanyGrants.accountId});if(row)await audit(tx,accountId,userId,"company.granted","product_account_company_grant",companyId);return [row] as const;});
      if(!inserted) {
        const [current]=await db.select({accountId:productAccountCompanyGrants.accountId}).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.companyId,companyId)).limit(1);
        if(current?.accountId===accountId){await entitlements.commit(reservation);return {accountId,companyId};}
        await entitlements.releaseAfterConfirmedRollback(reservation);
        if(current?.accountId!==accountId) throw conflict("Company already belongs to another billing account.",{code:"company_already_granted"});
      }
      await entitlements.commit(reservation);
      return {accountId,companyId};
    },
    snapshot: async(accountId:string,userId:string) => {
      await self(accountId,userId);
      const [account]=await db.select().from(productAccounts).where(eq(productAccounts.id,accountId)).limit(1);
      if(!account) throw notFound("Commercial account not found");
      const [plan]=await db.select().from(productPlans).where(eq(productPlans.id,account.planId)).limit(1);
      const grants=await db.select({companyId:productAccountCompanyGrants.companyId,companyName:companies.name}).from(productAccountCompanyGrants).innerJoin(companies,eq(companies.id,productAccountCompanyGrants.companyId)).where(eq(productAccountCompanyGrants.accountId,accountId));
      const meters=await db.select().from(productUsageMeters).where(eq(productUsageMeters.accountId,accountId));
      const notices=await db.select().from(productAccountUsageNotifications).where(eq(productAccountUsageNotifications.accountId,accountId)).orderBy(sql`${productAccountUsageNotifications.createdAt} desc`).limit(25);
      const ids=grants.map(g=>g.companyId);
      const [agentCount]=ids.length?await db.select({value:count()}).from(agents).where(and(inArray(agents.companyId,ids),ne(agents.status,"terminated"))):[{value:0}];
      const [connectionCount]=ids.length?await db.select({value:count()}).from(toolConnections).where(inArray(toolConnections.companyId,ids)):[{value:0}];
      const effectiveAccess = account.access === "trial_eligible" && account.trialExpiresAt && account.trialExpiresAt <= new Date() ? "inactive" : account.access;
      return {account:{id:account.id,name:account.name,planId:account.planId,access:effectiveAccess,trialStartedAt:account.trialStartedAt,trialExpiresAt:account.trialExpiresAt,createdAt:account.createdAt,updatedAt:account.updatedAt},plan:plan?{id:plan.id,name:plan.name,limits:plan.limits,enabled:plan.enabled===1,checkoutAvailable:Boolean(plan.stripePriceId)}:null,companies:grants,capacity:{companies:grants.length,agents:agentCount?.value??0,connections:connectionCount?.value??0},usage:meters,notices,billingConfigured:Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.PAPERCLIP_BILLING_RETURN_ORIGINS?.trim())};
    },
    plans: async()=>{const rows=await db.select({id:productPlans.id,name:productPlans.name,limits:productPlans.limits,enabled:productPlans.enabled,hasStripePrice:productPlans.stripePriceId}).from(productPlans).where(eq(productPlans.enabled,1));const trialDays=configuredTrialDays();return rows.map(({hasStripePrice,...row})=>({...row,enabled:row.enabled===1,checkoutAvailable:Boolean(hasStripePrice),trialAvailable:Boolean(trialDays),trialDays}));},
    setPlan: async(actorId:string,id:string,name:string,limits:unknown,stripePriceId:string|null,enabled:boolean)=>db.transaction(async tx=>{const [row]=await tx.insert(productPlans).values({id,name,limits,stripePriceId,enabled:enabled?1:0}).onConflictDoUpdate({target:productPlans.id,set:{name,limits,stripePriceId,enabled:enabled?1:0,updatedAt:new Date()}}).returning({id:productPlans.id,name:productPlans.name,limits:productPlans.limits,enabled:productPlans.enabled});await audit(tx,null,actorId,"plan.configured","product_plan",id,{enabled});return row?{...row,enabled:row.enabled===1}:null;}),
    recordUsage: async(accountId:string,actorId:string,input:unknown)=>{
      const member=await self(accountId,actorId); if(member.role==="member") throw forbidden("Account admin access required");
      const data=productUsageRecordSchema.parse(input);
      return db.transaction(async tx=>{
        const [event]=await tx.insert(productUsageEvents).values({accountId,metric:data.metric,periodKey:data.periodKey,idempotencyKey:data.idempotencyKey,quantity:data.quantity,source:data.source}).onConflictDoNothing().returning();
        if(event) await tx.insert(productUsageMeters).values({accountId,metric:data.metric,periodKey:data.periodKey,consumed:data.quantity}).onConflictDoUpdate({target:[productUsageMeters.accountId,productUsageMeters.metric,productUsageMeters.periodKey],set:{consumed:sql`${productUsageMeters.consumed} + ${data.quantity}`,updatedAt:new Date()}});
        const [meter]=await tx.select().from(productUsageMeters).where(and(eq(productUsageMeters.accountId,accountId),eq(productUsageMeters.metric,data.metric),eq(productUsageMeters.periodKey,data.periodKey))).limit(1);
        return {recorded:Boolean(event),usage:meter};
      });
    },
    gate: async(accountId:string,userId:string,request:{metric:PlanGateMetric;companyId:string|null;requested:number;period:PlanGatePeriod})=>{
      await self(accountId,userId);
      const [account]=await db.select().from(productAccounts).where(eq(productAccounts.id,accountId)).limit(1);
      const [plan]=await db.select().from(productPlans).where(eq(productPlans.id,account?.planId??"")).limit(1);
      const grants=await db.select({companyId:productAccountCompanyGrants.companyId}).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.accountId,accountId));
      if(!account||!plan) return evaluatePlanGate(null);
      const key=request.period.kind==="calendar_month"?request.period.start.slice(0,7):"current_capacity";
      const [meter]=await db.select().from(productUsageMeters).where(and(eq(productUsageMeters.accountId,accountId),eq(productUsageMeters.metric,request.metric),eq(productUsageMeters.periodKey,key))).limit(1);
      let consumed=meter?.consumed??0;
      if(request.period.kind==="current_capacity") {
        const ids=grants.map(g=>g.companyId);
        if(request.metric==="companies") consumed=ids.length;
        else if(request.metric==="agents"&&ids.length) { const [row]=await db.select({value:count()}).from(agents).where(and(inArray(agents.companyId,ids),ne(agents.status,"terminated"))); consumed=row?.value??0; }
        else if(request.metric==="connections"&&ids.length) { const [row]=await db.select({value:count()}).from(toolConnections).where(inArray(toolConnections.companyId,ids)); consumed=row?.value??0; }
      }
      const [pending]=await db.select({value:sum(productUsageReservations.quantity)}).from(productUsageReservations).where(and(eq(productUsageReservations.accountId,accountId),eq(productUsageReservations.metric,request.metric),eq(productUsageReservations.periodKey,key),inArray(productUsageReservations.state,["reserved","uncertain"])));
      consumed+=Number(pending?.value??0);
      const now=new Date();
      const expiredTrial=account.access==="trial_eligible"&&Boolean(account.trialExpiresAt&&account.trialExpiresAt<=now);
      if(expiredTrial) await db.update(productAccounts).set({access:"inactive",updatedAt:now}).where(and(eq(productAccounts.id,account.id),eq(productAccounts.access,"trial_eligible"),lte(productAccounts.trialExpiresAt,now)));
      return evaluatePlanGate({account:{id:account.id,planId:account.planId,access:expiredTrial?"inactive":account.access,companyIds:grants.map(g=>g.companyId)},plan:{id:plan.id,name:plan.name,limits:plan.limits},usage:{accountId,metric:request.metric,period:request.period,consumed},request,evaluation:{now:now.toISOString(),maxCapacitySnapshotAgeMs:60_000}});
    },
    checkout: async(accountId:string,userId:string,planId:string,successUrl:string,cancelUrl:string)=>{
      const role=await self(accountId,userId); if(role.role==="member") throw forbidden("Account admin access required");
      const secret=process.env.STRIPE_SECRET_KEY; if(!secret) throw unprocessable("Paperclip billing is not configured.",{code:"billing_not_configured"});
      const [account]=await db.select().from(productAccounts).where(eq(productAccounts.id,accountId)).limit(1);
      const [plan]=await db.select().from(productPlans).where(and(eq(productPlans.id,planId),eq(productPlans.enabled,1))).limit(1);
      if(!account||!plan) throw notFound("Account plan not found");
      if(!plan.stripePriceId) throw unprocessable("This plan has no configured Stripe Price.",{code:"billing_plan_unpriced"});
      const fields:Record<string,string>={mode:"subscription","line_items[0][price]":plan.stripePriceId,"line_items[0][quantity]":"1",success_url:assertAllowedReturnUrl(successUrl),cancel_url:assertAllowedReturnUrl(cancelUrl),"client_reference_id":accountId,"metadata[productAccountId]":accountId,"metadata[planId]":plan.id,"subscription_data[metadata][productAccountId]":accountId,"subscription_data[metadata][planId]":plan.id};
      if(account.stripeCustomerId) fields.customer=account.stripeCustomerId;
      const session=await stripePost("/v1/checkout/sessions",secret,fields,`product-checkout:${accountId}:${planId}:${Math.floor(Date.now()/300_000)}`);
      if(typeof session.url!=="string") throw new Error("Stripe did not return Checkout URL");
      return {url:session.url};
    },
    portal: async(accountId:string,userId:string,returnUrl:string)=>{
      const role=await self(accountId,userId); if(role.role==="member") throw forbidden("Account admin access required");
      const secret=process.env.STRIPE_SECRET_KEY; if(!secret) throw unprocessable("Paperclip billing is not configured.",{code:"billing_not_configured"});
      const [account]=await db.select().from(productAccounts).where(eq(productAccounts.id,accountId)).limit(1);
      if(!account?.stripeCustomerId) throw unprocessable("No Stripe customer is linked to this account.",{code:"billing_customer_unlinked"});
      const session=await stripePost("/v1/billing_portal/sessions",secret,{customer:account.stripeCustomerId,return_url:assertAllowedReturnUrl(returnUrl)},`product-portal:${accountId}:${Math.floor(Date.now()/60_000)}`);
      if(typeof session.url!=="string") throw new Error("Stripe did not return Portal URL"); return {url:session.url};
    },
    billingStatus: async(accountId:string,userId:string)=>{
      await self(accountId,userId);
      const secret=process.env.STRIPE_SECRET_KEY;
      if(!secret) throw unprocessable("Paperclip billing is not configured.",{code:"billing_not_configured"});
      const [account]=await db.select().from(productAccounts).where(eq(productAccounts.id,accountId)).limit(1);
      if(!account) throw notFound("Commercial account not found");
      if(!account.stripeCustomerId) {
        const [priced]=await db.select({id:productPlans.id}).from(productPlans).where(and(eq(productPlans.enabled,1),sql`${productPlans.stripePriceId} is not null`)).limit(1);
        return {confirmation:"awaiting_checkout" as const,access:account.access,portalAvailable:false,checkoutAvailable:Boolean(priced),subscription:null,invoices:[]};
      }
      if(!account.stripeSubscriptionId) return {confirmation:"awaiting_subscription" as const,access:account.access,portalAvailable:true,checkoutAvailable:false,subscription:null,invoices:[]};
      const [subscription,invoicePage]=await Promise.all([
        stripeGet(`/v1/subscriptions/${encodeURIComponent(account.stripeSubscriptionId)}`,secret),
        stripeGet(`/v1/invoices?customer=${encodeURIComponent(account.stripeCustomerId)}&limit=10`,secret),
      ]);
      const currentCustomer=String(subscription.customer??"");
      const metadataAccount=String(subscription.metadata?.productAccountId??"");
      const subscriptionId=String(subscription.id??"");
      const status=String(subscription.status??"");
      const priceIds=(subscription.items?.data??[]).map((item:any)=>String(item.price?.id??""));
      const plans=priceIds.length?await db.select().from(productPlans).where(inArray(productPlans.stripePriceId,priceIds)):[];
      const confirmedPlan=plans.find(plan=>plan.id===String(subscription.metadata?.planId??""))??plans.find(plan=>priceIds.includes(plan.stripePriceId??""));
      const confirmed=subscriptionId===account.stripeSubscriptionId&&currentCustomer===account.stripeCustomerId&&metadataAccount===accountId&&Boolean(confirmedPlan);
      if(!confirmed || !confirmedPlan) return {confirmation:"unconfirmed" as const,access:account.access,portalAvailable:true,checkoutAvailable:false,subscription:null,invoices:[]};
      const invoices=Array.isArray(invoicePage.data)?invoicePage.data.map((invoice:any)=>({id:String(invoice.id??""),status:typeof invoice.status==="string"?invoice.status:"unknown",currency:typeof invoice.currency==="string"?invoice.currency:null,amountDue:typeof invoice.amount_due==="number"?invoice.amount_due:null,amountPaid:typeof invoice.amount_paid==="number"?invoice.amount_paid:null,createdAt:typeof invoice.created==="number"?new Date(invoice.created*1000).toISOString():null,pdfUrl:typeof invoice.invoice_pdf==="string"?invoice.invoice_pdf:null,hostedUrl:typeof invoice.hosted_invoice_url==="string"?invoice.hosted_invoice_url:null})):[];
      return {confirmation:"confirmed" as const,access:status==="active"||status==="trialing"?"active" as const:"inactive" as const,portalAvailable:true,checkoutAvailable:false,confirmedAt:new Date().toISOString(),subscription:{id:subscriptionId,status,planId:confirmedPlan.id,planName:confirmedPlan.name,cancelAtPeriodEnd:subscription.cancel_at_period_end===true,currentPeriodEnd:typeof subscription.current_period_end==="number"?new Date(subscription.current_period_end*1000).toISOString():null},invoices};
    },
    webhook: async(rawBody:Buffer,signature:string|undefined)=>{
      if(rawBody.length>256*1024)throw unprocessable("Stripe webhook body exceeds the size limit.",{code:"billing_webhook_too_large"});
      const secret=process.env.STRIPE_WEBHOOK_SECRET; if(!secret||!signature||!verifyStripeSignature({rawBody,header:signature,secret})) throw unprocessable("Stripe billing webhook is not configured or signature is invalid.",{code:"billing_webhook_unavailable"});
      const event=JSON.parse(rawBody.toString("utf8")) as {id?:string;type?:string;created?:number;data?:{object?:Record<string,any>}};
      if(!event.id||!event.type) throw unprocessable("Invalid Stripe billing event");
      const obj=event.data?.object??{}; const accountId=String(obj.metadata?.productAccountId??obj.client_reference_id??"");
      if(!accountId) return {received:true,ignored:true};
      const supported=["checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"];
      if(!supported.includes(event.type))return {received:true,ignored:true};
      const secretKey=process.env.STRIPE_SECRET_KEY;if(!secretKey)throw unprocessable("Paperclip billing is not configured.",{code:"billing_not_configured"});
      let subscription:Record<string,any>|null=null;
      let subscriptionId=String(event.type==="checkout.session.completed"?obj.subscription??"":obj.id??"");
      // Treat the signed event as a notification, never as authoritative current
      // state. If Stripe cannot confirm the subscription (including deleted
      // events), let delivery retry instead of applying a potentially stale body.
      if(subscriptionId) subscription=await stripeGet(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,secretKey);
      const resolvedAccountId=String(subscription?.metadata?.productAccountId??accountId);
      if(resolvedAccountId!==accountId)return {received:true,ignored:true};
      const customerId=String(subscription?.customer??obj.customer??"");
      if(!customerId)return {received:true,ignored:true};
      const [target]=await db.select().from(productAccounts).where(eq(productAccounts.id,accountId)).limit(1);
      if(!target)return {received:true,ignored:true};
      const [customerOwner]=await db.select({id:productAccounts.id}).from(productAccounts).where(eq(productAccounts.stripeCustomerId,customerId)).limit(1);
      if(customerOwner&&customerOwner.id!==accountId)return {received:true,ignored:true};
      const planId=String(subscription?.metadata?.planId??obj.metadata?.planId??"");
      const [plan]=planId?await db.select().from(productPlans).where(eq(productPlans.id,planId)).limit(1):[];
      const priceIds=(subscription?.items?.data??[]).map((item:any)=>String(item.price?.id??""));
      if(subscription&&(!plan||!plan.stripePriceId||!priceIds.includes(plan.stripePriceId)))return {received:true,ignored:true};
      if(target.stripeCustomerId&&target.stripeCustomerId!==customerId)return {received:true,ignored:true};
      if(target.stripeSubscriptionId&&subscriptionId&&target.stripeSubscriptionId!==subscriptionId)return {received:true,ignored:true};
      const status=String(subscription?.status??"");
      const access=status==="active"||status==="trialing"?"active":"inactive";
      return db.transaction(async tx=>{
        const [prior]=await tx.insert(productBillingEvents).values({eventId:event.id!,eventType:event.type!}).onConflictDoNothing().returning({eventId:productBillingEvents.eventId});
        if(!prior) return {received:true,duplicate:true};
        const [current]=await tx.select().from(productAccounts).where(eq(productAccounts.id,accountId)).for("update").limit(1);
        if(!current||(current.stripeCustomerId&&current.stripeCustomerId!==customerId)||(current.stripeSubscriptionId&&subscriptionId&&current.stripeSubscriptionId!==subscriptionId))return {received:true,ignored:true};
        await tx.update(productAccounts).set({access,stripeCustomerId:customerId,stripeSubscriptionId:subscriptionId||current.stripeSubscriptionId,...(plan?{planId:plan.id}:{}),updatedAt:new Date()}).where(eq(productAccounts.id,accountId));
        await tx.insert(productAccountAuditEvents).values({accountId,actorId:"stripe",actorType:"system",action:"billing.subscription_updated",entityType:"product_subscription",entityId:subscriptionId||customerId,details:{eventType:event.type,status,planId:plan?.id??null}});
        return {received:true};
      });
    },
  };
}




