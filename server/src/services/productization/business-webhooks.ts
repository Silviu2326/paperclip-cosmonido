import { and, asc, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { localEncryptedProvider } from "../../secrets/local-encrypted-provider.js";
import { eventFetch, postEvent } from "../public-mcp/event-webhooks.js";
import { businessWebhookDeliveries, businessWebhookOutbox, businessWebhookSubscriptions } from "@paperclipai/db";
import type { BusinessWebhookEventName, BusinessWebhookOutboxEvent } from "@paperclipai/shared/productization/public-api";

const EVENT_FOR_ACTIVITY:Readonly<Record<string,BusinessWebhookEventName>>={
  "lead.created":"lead.created",
  "lead.received":"lead.created",
  "proposal.accepted":"proposal.accepted",
  "deliverable.accepted":"deliverable.accepted",
  "conversation.created":"conversation.created",
};
/** Pure projection used by activity-log to insert the outbox row in the same transaction. */
export function businessWebhookEventForActivity(input:{activityId:string;companyId:string;action:string;entityId:string;occurredAt:Date|string}):BusinessWebhookOutboxEvent|null{
  const eventType=EVENT_FOR_ACTIVITY[input.action];if(!eventType)return null;
  return {eventId:input.activityId,companyId:input.companyId,eventType,occurredAt:input.occurredAt instanceof Date?input.occurredAt.toISOString():input.occurredAt,data:{companyId:input.companyId,entityId:input.entityId}};
}
const RETRY_MS=[30_000,120_000,600_000,1_800_000,7_200_000,21_600_000,43_200_000];
const MAX_ATTEMPTS=8;
const ERROR_CATEGORIES=new Set([
  "recipient_or_secret_unavailable","signing_secret_unavailable","invalid_destination",
  "timeout","recipient_server_error","delivery_failed","challenge_failed",
]);
function safeErrorCategory(value:string|undefined,status:number|undefined){
  if(status!==undefined)return `http_${Math.max(100,Math.min(599,Math.trunc(status)))}`;
  return value&&ERROR_CATEGORIES.has(value)?value:"delivery_failed";
}

export function businessWebhooksService(db:Db,options:{now?:()=>Date;fetch?:typeof eventFetch;batchSize?:number}={}){
  const now=options.now??(()=>new Date()),fetcher=options.fetch??eventFetch,batch=Math.max(1,Math.min(20,options.batchSize??10));
  async function fanOut(){
    const events=await db.select().from(businessWebhookOutbox).where(isNull(businessWebhookOutbox.fannedOutAt)).orderBy(asc(businessWebhookOutbox.occurredAt)).limit(batch);
    for(const event of events)await db.transaction(async tx=>{
      const [locked]=await tx.select().from(businessWebhookOutbox).where(and(eq(businessWebhookOutbox.eventId,event.eventId),isNull(businessWebhookOutbox.fannedOutAt))).for("update").limit(1);
      if(!locked)return;
      const subs=await tx.select({id:businessWebhookSubscriptions.id,events:businessWebhookSubscriptions.events,status:businessWebhookSubscriptions.status}).from(businessWebhookSubscriptions).where(and(eq(businessWebhookSubscriptions.companyId,locked.companyId),eq(businessWebhookSubscriptions.status,"active")));
      const targets=subs.filter(sub=>sub.events.includes(locked.eventType as BusinessWebhookEventName));
      for(const target of targets)await tx.insert(businessWebhookDeliveries).values({eventId:locked.eventId,subscriptionId:target.id}).onConflictDoNothing();
      await tx.update(businessWebhookOutbox).set({fannedOutAt:now()}).where(eq(businessWebhookOutbox.eventId,locked.eventId));
    });
    return events.length;
  }
  async function claim(){
    return db.transaction(async tx=>{
      const instant=now();
      const rows=await tx.select({delivery:businessWebhookDeliveries,subscription:businessWebhookSubscriptions,event:businessWebhookOutbox})
        .from(businessWebhookDeliveries).innerJoin(businessWebhookSubscriptions,eq(businessWebhookSubscriptions.id,businessWebhookDeliveries.subscriptionId)).innerJoin(businessWebhookOutbox,eq(businessWebhookOutbox.eventId,businessWebhookDeliveries.eventId))
        .where(and(inArray(businessWebhookDeliveries.status,["pending","delivering"]),or(and(eq(businessWebhookDeliveries.status,"pending"),lte(businessWebhookDeliveries.nextAttemptAt,instant)),and(eq(businessWebhookDeliveries.status,"delivering"),lt(businessWebhookDeliveries.lockedUntil!,instant))),eq(businessWebhookSubscriptions.status,"active")))
        .orderBy(asc(businessWebhookDeliveries.nextAttemptAt)).limit(batch);
      const claimed=[];
      for(const row of rows){
        const eligible=row.delivery.status==="pending"?and(eq(businessWebhookDeliveries.status,"pending"),lte(businessWebhookDeliveries.nextAttemptAt,instant)):and(eq(businessWebhookDeliveries.status,"delivering"),lt(businessWebhookDeliveries.lockedUntil!,instant));
        const [delivery]=await tx.update(businessWebhookDeliveries).set({status:"delivering",attempts:row.delivery.attempts+1,lockedUntil:new Date(instant.getTime()+45_000)}).where(and(eq(businessWebhookDeliveries.id,row.delivery.id),eligible)).returning();
        if(delivery)claimed.push({delivery,subscription:row.subscription,event:row.event});
      }
      return claimed;
    });
  }
  async function finish(row:Awaited<ReturnType<typeof claim>>[number],result:{status?:number;error?:string;blocked?:boolean}){
    const attempt=row.delivery.attempts,instant=now();
    const observedLease = row.delivery.lockedUntil;
    if (!observedLease) return;
    const claimFence=and(eq(businessWebhookDeliveries.id,row.delivery.id),eq(businessWebhookDeliveries.status,"delivering"),eq(businessWebhookDeliveries.attempts,attempt),eq(businessWebhookDeliveries.lockedUntil,observedLease),gt(businessWebhookDeliveries.lockedUntil,instant));
    if(result.status&&result.status>=200&&result.status<300){
      await db.transaction(async tx=>{
        const [updated]=await tx.update(businessWebhookDeliveries).set({status:"delivered",deliveredAt:instant,lockedUntil:null,lastHttpStatus:result.status,lastError:null}).where(claimFence).returning({id:businessWebhookDeliveries.id});
        if(!updated)return;
        await tx.update(businessWebhookSubscriptions).set({lastDeliveryAt:instant,lastError:null}).where(and(eq(businessWebhookSubscriptions.id,row.subscription.id),eq(businessWebhookSubscriptions.status,"active")));
      });return;
    }
    const blocked=Boolean(result.blocked)||attempt>=MAX_ATTEMPTS||Boolean(result.status&&result.status>=400&&result.status<500&&result.status!==429);
    const delay=RETRY_MS[Math.min(attempt-1,RETRY_MS.length-1)]!;
    const category=safeErrorCategory(result.error,result.status);
    await db.transaction(async tx=>{
      const [updated]=await tx.update(businessWebhookDeliveries).set({status:blocked?"blocked":"pending",nextAttemptAt:new Date(instant.getTime()+delay),lockedUntil:null,lastHttpStatus:result.status??null,lastError:category}).where(claimFence).returning({id:businessWebhookDeliveries.id});
      if(!updated)return;
      await tx.update(businessWebhookSubscriptions).set({status:blocked?"blocked":"active",lastError:category,updatedAt:instant}).where(and(eq(businessWebhookSubscriptions.id,row.subscription.id),eq(businessWebhookSubscriptions.status,"active")));
    });
  }
  async function deliverDue(){
    const fannedOut=await fanOut();const rows=await claim();
    await Promise.all(rows.map(async row=>{
      try{
        const [currentSubscription]=await db.select().from(businessWebhookSubscriptions).where(and(eq(businessWebhookSubscriptions.id,row.subscription.id),eq(businessWebhookSubscriptions.status,"active"))).limit(1);
        if(!currentSubscription||!currentSubscription.secretMaterial) {await finish(row,{blocked:true,error:"recipient_or_secret_unavailable"});return;}
        let parsed:{secret?:unknown};
        try{const material=JSON.parse(currentSubscription.secretMaterial) as Record<string,unknown>;const raw=await localEncryptedProvider.resolveVersion({material,externalRef:null,providerVersionRef:null});parsed=JSON.parse(raw) as {secret?:unknown};}
        catch{await finish(row,{blocked:true,error:"signing_secret_unavailable"});return;}
        if(typeof parsed.secret!=="string"||!parsed.secret) {await finish(row,{blocked:true,error:"signing_secret_unavailable"});return;}
        const event:BusinessWebhookOutboxEvent={eventId:row.event.eventId,companyId:row.event.companyId,eventType:row.event.eventType as BusinessWebhookEventName,occurredAt:row.event.occurredAt.toISOString(),data:row.event.data};
        const response=await postEvent(fetcher,currentSubscription.id,currentSubscription.url,[parsed.secret],event.eventId,event,now().getTime());
        await response.body?.cancel().catch(()=>{});
        await finish(row,{status:response.status,blocked:response.status===404||response.status===410,error:response.status>=500?"recipient_server_error":undefined});
      }catch(error){
        const rawReason=typeof error==="object"&&error!==null&&"reason" in error?String((error as {reason:unknown}).reason):"delivery_failed";
        const reason=safeErrorCategory(rawReason,undefined);
        await finish(row,{blocked:reason==="invalid_destination",error:reason});
      }
    }));
    return {fannedOut,attempted:rows.length};
  }
  return {deliverDue,fanOut};
}
