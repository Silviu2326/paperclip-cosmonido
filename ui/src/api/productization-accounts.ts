import { api } from "./client";
export type ProductAccount = { id:string; name:string; planId:string; access:"active"|"trial_eligible"|"inactive"; trialStartedAt:string|null; trialExpiresAt:string|null; createdAt:string; updatedAt:string };
export type ProductAccountListItem = { account:ProductAccount; role:"owner"|"admin"|"member" };
export type ProductAccountUsageNotice = { id:string; metric:string; periodKey:string; threshold:80|100; consumed:number; limit:number; createdAt:string };
export type ProductAccountSnapshot = { account:ProductAccount; plan:{id:string;name:string;limits:Record<string,number|null>;enabled:boolean;checkoutAvailable:boolean}|null; companies:Array<{companyId:string;companyName:string}>; capacity:{companies:number;agents:number;connections:number}; usage:Array<{metric:string;periodKey:string;consumed:number}>; notices:ProductAccountUsageNotice[]; billingConfigured:boolean };
export type ProductBillingStatus = { confirmation:"awaiting_checkout"|"awaiting_subscription"|"unconfirmed"; access:string; portalAvailable:boolean; checkoutAvailable:boolean; subscription:null; invoices:[] } | { confirmation:"confirmed"; access:"active"|"inactive"; portalAvailable:true; checkoutAvailable:false; confirmedAt:string; subscription:{id:string;status:string;planId:string;planName:string;cancelAtPeriodEnd:boolean;currentPeriodEnd:string|null}; invoices:Array<{id:string;status:string;currency:string|null;amountDue:number|null;amountPaid:number|null;createdAt:string|null;pdfUrl:string|null;hostedUrl:string|null}> };
export const productizationAccountsApi = {
 list:()=>api.get<ProductAccountListItem[]>("/productization/accounts"),
 create:(name:string)=>api.post<ProductAccount>("/productization/accounts",{name}),
 get:(id:string)=>api.get<ProductAccountSnapshot>(`/productization/accounts/${id}`),
 grantCompany:(id:string,companyId:string)=>api.post(`/productization/accounts/${id}/companies`,{companyId}),
 members:(id:string)=>api.get<Array<{userId:string;role:string}>>(`/productization/accounts/${id}/members`),
 addMember:(id:string,userId:string,role:"admin"|"member")=>api.post(`/productization/accounts/${id}/members`,{userId,role}),
 plans:()=>api.get<Array<{id:string;name:string;limits:Record<string,number|null>;enabled:boolean;checkoutAvailable:boolean;trialAvailable:boolean;trialDays:number|null}>>("/productization/plans"),
 prepareSignupPlan:(planId:string)=>api.post<{accountId:string;planId:string;access:string;trialExpiresAt:string|null;status:"plan_prepared"|"trial_already_started"}>("/productization/signup/plan",{planId}),
 startTrial:(accountId:string)=>api.post<{accountId:string;planId:string;access:string;trialStartedAt:string|null;trialExpiresAt:string|null;status:"started"|"already_started"}>("/productization/signup/trial",{accountId}),
 checkout:(id:string,planId:string)=>api.post<{url:string}>(`/productization/accounts/${id}/billing/checkout`,{planId,successUrl:window.location.href,cancelUrl:window.location.href}),
 portal:(id:string)=>api.post<{url:string}>(`/productization/accounts/${id}/billing/portal`,{returnUrl:window.location.href}),
 billingStatus:(id:string)=>api.get<ProductBillingStatus>(`/productization/accounts/${id}/billing`),
};

