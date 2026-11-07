import { api } from "./client";
import type { BusinessWebhookEventName, BusinessWebhookSummary, PublicApiKeySummary, PublicApiScope } from "@paperclipai/shared/productization/public-api";

export const productPublicApi = {
  scopes:()=>api.get<{scopes:PublicApiScope[] }>("/productization/public-api/scopes"),
  keys:(companyId:string)=>api.get<PublicApiKeySummary[]>(`/productization/public-api/keys?companyId=${encodeURIComponent(companyId)}`),
  createKey:(input:{companyId:string;name:string;scopes:PublicApiScope[];expiresInDays:number})=>api.post<{key:PublicApiKeySummary;token:string}>("/productization/public-api/keys",input),
  revokeKey:(companyId:string,id:string)=>api.delete<{revoked:boolean}>(`/productization/public-api/keys/${id}?companyId=${encodeURIComponent(companyId)}`),
  webhooks:(companyId:string)=>api.get<BusinessWebhookSummary[]>(`/productization/public-api/webhooks?companyId=${encodeURIComponent(companyId)}`),
  createWebhook:(input:{companyId:string;url:string;events:BusinessWebhookEventName[]})=>api.post<{subscription:BusinessWebhookSummary;signingSecret:string}>("/productization/public-api/webhooks",input),
  rotateWebhook:(id:string)=>api.post<{subscription:BusinessWebhookSummary;signingSecret:string}>(`/productization/public-api/webhooks/${id}/rotate`,{}),
  revokeWebhook:(id:string)=>api.delete<{revoked:boolean}>(`/productization/public-api/webhooks/${id}`),
};
