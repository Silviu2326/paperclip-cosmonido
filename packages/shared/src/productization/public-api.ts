import { z } from "zod";

export const PUBLIC_API_SCOPES = ["customers:read", "leads:read", "assignments:read", "proposals:read", "results:read", "conversations:read"] as const;
export type PublicApiScope = typeof PUBLIC_API_SCOPES[number];
export const BUSINESS_WEBHOOK_EVENTS = ["lead.created", "proposal.accepted", "deliverable.accepted", "conversation.created"] as const;
export type BusinessWebhookEventName = typeof BUSINESS_WEBHOOK_EVENTS[number];

const uuid = z.uuid();
export const publicApiKeyCreateSchema = z.object({ companyId: uuid, name: z.string().trim().min(1).max(100), scopes: z.array(z.enum(PUBLIC_API_SCOPES)).min(1).max(PUBLIC_API_SCOPES.length), expiresInDays: z.number().int().min(1).max(365).default(30) }).strict();
export const businessWebhookCreateSchema = z.object({ companyId: uuid, url: z.string().url().max(2048), events: z.array(z.enum(BUSINESS_WEBHOOK_EVENTS)).min(1).max(BUSINESS_WEBHOOK_EVENTS.length) }).strict();
export const publicApiPageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(10_000).default(0) }).strict();

export interface PublicApiKeySummary { id:string; name:string; companyId:string; scopes:PublicApiScope[]; createdAt:string; expiresAt:string|null; revokedAt:string|null }
export interface BusinessWebhookSummary { id:string; companyId:string; url:string; events:BusinessWebhookEventName[]; status:"active"|"blocked"|"revoked"; secretConfigured:boolean; createdAt:string; updatedAt:string; lastDeliveryAt:string|null; lastError:string|null }
export interface BusinessWebhookSecretResponse { subscription:BusinessWebhookSummary; signingSecret:string }
export interface BusinessWebhookOutboxEvent { eventId:string; companyId:string; eventType:BusinessWebhookEventName; occurredAt:string; data:{companyId:string;entityId:string} }
