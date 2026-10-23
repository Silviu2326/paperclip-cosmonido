import { and, count, eq, inArray, lte, ne, sql, sum } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, productAccounts, productAccountCompanyGrants, productAccountUsageNotifications, productPlans, productUsageMeters, productUsageEvents, productUsageReservations, toolConnections } from "@paperclipai/db";
import { evaluatePlanGate, type PlanGateMetric, type PlanGatePeriod } from "@paperclipai/shared/productization/plan-gate";
import { conflict, unprocessable } from "../../errors.js";

export type ProductEntitlementMetric = PlanGateMetric;
export interface ProductReservationRef { accountId:string|null; reservationId:string|null; idempotencyKey:string; state:"unbound"|"reserved"|"committed"|"uncertain"; duplicate:boolean }
const CAPACITY_METRICS = new Set<ProductEntitlementMetric>(["companies","agents","connections"]);
function currentPeriod(metric:ProductEntitlementMetric, now:Date):PlanGatePeriod {
  if(CAPACITY_METRICS.has(metric)) return {kind:"current_capacity",observedAt:now.toISOString()};
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
  const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
  return {kind:"calendar_month",start:start.toISOString(),end:end.toISOString()};
}
function periodKey(period:PlanGatePeriod){return period.kind==="calendar_month"?period.start.slice(0,7):"current_capacity";}

/** Company-bound commercial entitlement admission. Unbound legacy/self-hosted companies remain unmetered. */
export function productizationEntitlementsService(db:Db){
  async function reserveForAccount(input:{accountId:string;companyId:string;metric:ProductEntitlementMetric;quantity:number;idempotencyKey:string;requestFingerprint:string}):Promise<ProductReservationRef>{
    if(!Number.isFinite(input.quantity)||input.quantity<=0||!input.idempotencyKey.trim()) throw unprocessable("Invalid product entitlement reservation.",{code:"invalid_entitlement_reservation"});
    const now=new Date(), period=currentPeriod(input.metric,now), key=periodKey(period);
    return db.transaction(async tx=>{
      // Every admission for an account serializes on this row. All cooperating writers
      // see in-flight reservations before evaluating the shared plan gate.
      const [account]=await tx.select().from(productAccounts).where(eq(productAccounts.id,input.accountId)).for("update").limit(1);
      if(!account) throw unprocessable("Commercial account binding is incomplete.",{code:"plan_gate_data_incomplete"});
      const trialExpired=account.access==="trial_eligible"&&Boolean(account.trialExpiresAt&&account.trialExpiresAt<=now);
      if(trialExpired) await tx.update(productAccounts).set({access:"inactive",updatedAt:now}).where(and(eq(productAccounts.id,account.id),eq(productAccounts.access,"trial_eligible"),lte(productAccounts.trialExpiresAt,now)));
      const [prior]=await tx.select().from(productUsageReservations).where(and(eq(productUsageReservations.accountId,account.id),eq(productUsageReservations.idempotencyKey,input.idempotencyKey))).limit(1);
      if(prior&&prior.requestFingerprint!==input.requestFingerprint) throw conflict("Entitlement idempotency key was reused for a different operation.",{code:"entitlement_idempotency_conflict"});
      if(prior&&prior.state!=="released") return {accountId:account.id,reservationId:prior.id,idempotencyKey:input.idempotencyKey,state:prior.state as ProductReservationRef["state"],duplicate:true};
      const [plan]=await tx.select().from(productPlans).where(eq(productPlans.id,account.planId)).limit(1);
      const grants=await tx.select({companyId:productAccountCompanyGrants.companyId}).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.accountId,account.id));
      const ids=grants.map(row=>row.companyId);
      const [meter]=await tx.select().from(productUsageMeters).where(and(eq(productUsageMeters.accountId,account.id),eq(productUsageMeters.metric,input.metric),eq(productUsageMeters.periodKey,key))).limit(1);
      let consumed=meter?.consumed??0;
      if(CAPACITY_METRICS.has(input.metric)){
        if(input.metric==="companies") consumed=ids.length;
        else if(ids.length&&input.metric==="agents"){const [row]=await tx.select({value:count()}).from(agents).where(and(inArray(agents.companyId,ids),ne(agents.status,"terminated")));consumed=row?.value??0;}
        else if(ids.length&&input.metric==="connections"){const [row]=await tx.select({value:count()}).from(toolConnections).where(inArray(toolConnections.companyId,ids));consumed=row?.value??0;}
      }
      const [pending]=await tx.select({value:sum(productUsageReservations.quantity)}).from(productUsageReservations).where(and(eq(productUsageReservations.accountId,account.id),eq(productUsageReservations.metric,input.metric),eq(productUsageReservations.periodKey,key),inArray(productUsageReservations.state,["reserved","uncertain"])));
      consumed+=Number(pending?.value??0);
      if(!plan) throw unprocessable("The bound account has no configured product plan.",{code:"plan_gate_data_incomplete"});
      const result=evaluatePlanGate({account:{id:account.id,planId:account.planId,access:trialExpired?"inactive":account.access,companyIds:ids},plan:{id:plan.id,name:plan.name,limits:plan.limits},usage:{accountId:account.id,metric:input.metric,period,consumed},request:{metric:input.metric,companyId:input.metric==="companies"?null:input.companyId,requested:input.quantity,period},evaluation:{now:now.toISOString(),maxCapacitySnapshotAgeMs:60_000}});
      if(!result.allowed) throw unprocessable("Paperclip product limit prevents this operation.",{code:result.code,metric:result.metric,limit:result.limit,consumed:result.consumed,requested:result.requested,projected:result.projected,upgradePath:result.upgradePath});
      const values={accountId:account.id,companyId:input.companyId,metric:input.metric,periodKey:key,idempotencyKey:input.idempotencyKey,requestFingerprint:input.requestFingerprint,quantity:input.quantity,state:"reserved"};
      const [reservation]=prior
        ? await tx.update(productUsageReservations).set({...values,updatedAt:now}).where(eq(productUsageReservations.id,prior.id)).returning()
        : await tx.insert(productUsageReservations).values(values).returning();
      if(!reservation) throw conflict("Entitlement reservation could not be recorded.",{code:"entitlement_reservation_conflict"});
      return {accountId:account.id,reservationId:reservation.id,idempotencyKey:input.idempotencyKey,state:"reserved",duplicate:false};
    });
  }
  async function finish(ref:ProductReservationRef,outcome:"committed"|"uncertain"|"released",allowDuplicateRelease=false){
    if(!ref.accountId||!ref.reservationId)return;
    // A duplicate admission shares the canonical reservation. It may confirm
    // an outcome, but it does not own rollback authority: another caller may
    // still be performing the effect under that key. Keep capacity reserved
    // until the canonical caller or a reconciliation path settles it.
    if(outcome==="released"&&ref.duplicate&&!allowDuplicateRelease)return;
    return db.transaction(async tx=>{
      // Writers acquire the account row before reservation rows in both reserve
      // and settle paths. This makes usage increments and notices account-atomic.
      const [account]=await tx.select().from(productAccounts).where(eq(productAccounts.id,ref.accountId!)).for("update").limit(1);
      const [reservation]=await tx.select().from(productUsageReservations).where(and(eq(productUsageReservations.id,ref.reservationId!),eq(productUsageReservations.accountId,ref.accountId!))).for("update").limit(1);
      if(!account||!reservation||reservation.state==="committed"||reservation.state==="released")return;
      if(outcome==="committed"&&reservation.metric!=="companies"&&reservation.metric!=="agents"&&reservation.metric!=="connections"){
        const [event]=await tx.insert(productUsageEvents).values({accountId:reservation.accountId,metric:reservation.metric,periodKey:reservation.periodKey,idempotencyKey:reservation.idempotencyKey,quantity:reservation.quantity,source:`admission:${reservation.metric}`}).onConflictDoNothing().returning({id:productUsageEvents.id});
        if(event) await tx.insert(productUsageMeters).values({accountId:reservation.accountId,metric:reservation.metric,periodKey:reservation.periodKey,consumed:reservation.quantity}).onConflictDoUpdate({target:[productUsageMeters.accountId,productUsageMeters.metric,productUsageMeters.periodKey],set:{consumed:sql`${productUsageMeters.consumed} + ${reservation.quantity}`,updatedAt:new Date()}});
      }
      await tx.update(productUsageReservations).set({state:outcome,updatedAt:new Date()}).where(eq(productUsageReservations.id,reservation.id));
      if(outcome!=="committed")return;
      const [plan]=await tx.select({limits:productPlans.limits}).from(productPlans).where(eq(productPlans.id,account.planId)).limit(1);
      const rawLimit=plan?.limits && typeof plan.limits==="object" ? (plan.limits as Record<string,unknown>)[reservation.metric] : null;
      if(typeof rawLimit!=="number"||!Number.isFinite(rawLimit)||rawLimit<=0)return;
      let consumed=0;
      if(reservation.metric==="companies"){
        const [row]=await tx.select({value:count()}).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.accountId,account.id)); consumed=row?.value??0;
      } else if(reservation.metric==="agents"||reservation.metric==="connections") {
        const grants=await tx.select({companyId:productAccountCompanyGrants.companyId}).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.accountId,account.id));
        const ids=grants.map(g=>g.companyId);
        if(ids.length&&reservation.metric==="agents") { const [row]=await tx.select({value:count()}).from(agents).where(and(inArray(agents.companyId,ids),ne(agents.status,"terminated"))); consumed=row?.value??0; }
        else if(ids.length) { const [row]=await tx.select({value:count()}).from(toolConnections).where(inArray(toolConnections.companyId,ids)); consumed=row?.value??0; }
      } else {
        const [meter]=await tx.select({consumed:productUsageMeters.consumed}).from(productUsageMeters).where(and(eq(productUsageMeters.accountId,account.id),eq(productUsageMeters.metric,reservation.metric),eq(productUsageMeters.periodKey,reservation.periodKey))).limit(1);
        consumed=meter?.consumed??0;
      }
      const reached: Array<80|100> = [];
      if(consumed/rawLimit>=0.8) reached.push(80);
      if(consumed>=rawLimit) reached.push(100);
      const noticePeriod = ["companies", "agents", "connections"].includes(reservation.metric) ? "current_capacity" : reservation.periodKey;
      for(const threshold of reached) await tx.insert(productAccountUsageNotifications).values({accountId:account.id,metric:reservation.metric,periodKey:noticePeriod,threshold,consumed,limit:rawLimit}).onConflictDoNothing();
    });
  }
  async function reserveForCompany(input:{companyId:string;metric:ProductEntitlementMetric;quantity:number;idempotencyKey:string;requestFingerprint:string}):Promise<ProductReservationRef>{
    const [grant]=await db.select({accountId:productAccountCompanyGrants.accountId}).from(productAccountCompanyGrants).where(eq(productAccountCompanyGrants.companyId,input.companyId)).limit(1);
    if(!grant)return {accountId:null,reservationId:null,idempotencyKey:input.idempotencyKey,state:"unbound",duplicate:false};
    return reserveForAccount({...input,accountId:grant.accountId});
  }
  return {
    reserveForCompany,
    reserveForAccount,
    commit:(ref:ProductReservationRef)=>finish(ref,"committed"),
    markUncertain:(ref:ProductReservationRef)=>finish(ref,"uncertain"),
    releaseAfterConfirmedRollback:(ref:ProductReservationRef)=>finish(ref,"released"),
    // Reconciliation owns explicit evidence that the ambiguous effect did not
    // occur, so it may settle a shared uncertain reservation despite duplicate.
    releaseAfterConfirmedReconciliation:(ref:ProductReservationRef)=>finish(ref,"released",true),
  };
}

