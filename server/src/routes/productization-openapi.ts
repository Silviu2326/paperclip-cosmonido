import { z } from "zod";
import { mediaOperationsSchema, mediaQueueQuerySchema, mediaPriorityUpdateSchema, createLeadFormSchema, updateLeadFormSchema, leadFormListQuerySchema, leadFormLifecycleSchema } from "@paperclipai/shared";
import { portablePackageSchema, portablePackageStatusActionSchema, createPackageInstallationSchema } from "@paperclipai/shared/productization/portable-package";
import { onboardingPutSchema, onboardingEventRequestSchema, onboardingTeamSelectionRequestSchema, onboardingActivationRequestSchema, onboardingFirstJobRequestSchema, onboardingSnapshotSchema, onboardingMutationResponseSchema } from "@paperclipai/shared/productization/onboarding-api";
import { builderDraftRequestSchema, builderCloneRequestSchema, builderConfigurationPreviewRequestSchema } from "@paperclipai/shared/productization/description-builder";
import { productAccountCreateSchema, productAccountMemberSchema, productAccountCompanyGrantSchema, productPlanSchema } from "@paperclipai/shared/productization/accounts";
import { publicApiKeyCreateSchema, businessWebhookCreateSchema, publicApiPageSchema } from "@paperclipai/shared/productization/public-api";
import { outcomeMetricsQuerySchema, outcomeMetricsSchema } from "@paperclipai/shared/productization/outcome-metrics";
import { companyRetentionPolicyInputSchema } from "@paperclipai/shared/productization/security";
import { s90OpenApiRoutes } from "./s90-openapi.js";
import { sprintsOpenApiRoutes } from "./sprints-openapi.js";
import { sprintsOperationsOpenApiRoutes } from "./sprints-operations-openapi.js";
import { s95OpenApiRoutes } from "./s95-openapi.js";

const uuid = z.string().uuid();
const catalogBase = "/api/companies/{companyId}/productization/catalog";
const notificationBase = "/api/companies/{companyId}/product-notifications";

export type ProductizationApiAuth = "board" | "instance_admin" | "authenticated" | "public" | "customer_portal" | "external_review" | "agent_run" | "scoped_api" | "stripe_webhook";
export type ProductizationOpenApiRoute = {
  method: string; path: string; summary: string; description: string; auth: ProductizationApiAuth;
  body?: z.ZodTypeAny; bodyContentTypes?: string[]; query?: z.ZodTypeAny; response?: z.ZodTypeAny; status?: number; noContent?: boolean;
};

const companyIdQuery = z.object({ companyId: uuid });
const publicPageQuery = publicApiPageSchema;
const portalCreate = z.object({ customerId: uuid, contactId: uuid.nullable().optional(), expiresAt: z.string().datetime(), resourceKinds: z.array(z.enum(["deliverables", "proposals", "meetings", "conversations", "commitments", "files"])).min(1).max(6).optional(), allowDeliverableFeedback: z.boolean().optional(), allowFileUploads: z.boolean().optional() }).strict();
const portalComment = z.object({ conversationRef: z.string().length(43), body: z.string().trim().min(1).max(4000) }).strict();
const portalAccept = z.object({ proposalReference: z.string().length(43), revision: z.number().int().positive(), name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(320) }).strict();
const portalFeedback = z.object({ reference: z.string().length(43), decision: z.enum(["accept", "changes_requested"]), comment: z.string().trim().max(4000), idempotencyKey: uuid }).strict();
const notificationPreferences = z.object({ categories: z.array(z.enum(["decisions", "reviews", "tasks"])).max(3), browserEnabled: z.boolean() }).strict();
const pushSubscription = z.object({ endpoint: z.string().url().max(4096), expirationTime: z.number().positive().nullable(), keys: z.object({ p256dh: z.string().min(60).max(120), auth: z.string().min(20).max(100) }).strict() }).strict();
const mediaPreset = z.object({ presetKey: z.string().trim().min(2).max(80), kind: z.enum(["clip", "demo", "testimonial", "tutorial", "advert"]), outputAspect: z.enum(["9:16", "16:9"]), name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).nullable().optional(), inputCriteria: z.object({ acceptedContentTypes: z.array(z.string().min(1).max(100)).min(1).max(5), transcriptRequired: z.boolean(), notes: z.array(z.string().trim().min(1).max(300)).max(10) }).strict(), operations: mediaOperationsSchema.shape.operations, brandReferences: z.object({ logoAssetId: uuid.nullable().optional(), voiceAssetId: uuid.nullable().optional(), voiceProviderReference: z.string().trim().max(128).nullable().optional(), musicAssetId: uuid.nullable().optional(), musicLicenseReferenceUrl: z.string().url().max(1000).nullable().optional() }).strict().optional() }).strict();
const publicFormSubmission = z.record(z.string(), z.unknown());
const billingCheckoutBody = z.object({ planId: z.unknown().optional(), successUrl: z.unknown().optional(), cancelUrl: z.unknown().optional() }).passthrough();
const billingPortalBody = z.object({ returnUrl: z.unknown().optional() }).passthrough();
const v1ListRoutes = ["customers", "leads", "assignments", "proposals", "results", "conversations"] as const;

export const productizationOpenApiRoutes: ProductizationOpenApiRoute[] = [
  ...s90OpenApiRoutes,
  ...sprintsOpenApiRoutes,
  ...sprintsOperationsOpenApiRoutes,
  ...s95OpenApiRoutes,
  { method: "get", path: "/api/companies/{companyId}/productization/onboarding", summary: "Read the company's business setup journey", description: "Board only; company-scoped. Journey evidence is server-derived.", response: onboardingSnapshotSchema, auth: "board" },
  { method: "put", path: "/api/companies/{companyId}/productization/onboarding", summary: "Create or select a business setup path", description: "Board only; expectedRevision prevents stale writes.", body: onboardingPutSchema, response: onboardingMutationResponseSchema, auth: "board" },
  { method: "post", path: "/api/companies/{companyId}/productization/onboarding/events", summary: "Confirm business setup inputs", description: "Board only; client submits user facts, not technical milestone evidence.", body: onboardingEventRequestSchema, response: onboardingMutationResponseSchema, auth: "board" },
  { method: "post", path: "/api/companies/{companyId}/productization/onboarding/team", summary: "Select company agents for onboarding", description: "Board only; only real eligible agents can satisfy readiness.", body: onboardingTeamSelectionRequestSchema, response: onboardingMutationResponseSchema, auth: "board" },
  { method: "post", path: "/api/companies/{companyId}/productization/onboarding/activate", summary: "Confirm the selected onboarding team", description: "Board only; does not start an assignment or prove a model run.", body: onboardingActivationRequestSchema, response: onboardingMutationResponseSchema, auth: "board" },
  { method: "post", path: "/api/companies/{companyId}/productization/onboarding/first-job", summary: "Link a started assignment to onboarding", description: "Board only; server checks the actual assignment start and accepted deliverable evidence.", body: onboardingFirstJobRequestSchema, response: onboardingMutationResponseSchema, auth: "board" },

  { method: "post", path: `${catalogBase}/preview`, summary: "Preview a portable package", description: "Board only; requires agents:create. Bounded inline package preview; installs nothing.", body: portablePackageSchema, auth: "board" },
  { method: "get", path: `${catalogBase}/packages`, summary: "List private portable packages", description: "Board only and company scoped.", auth: "board" },
  { method: "post", path: `${catalogBase}/packages`, summary: "Create a private package draft", description: "Board only; requires agents:create.", body: portablePackageSchema, status: 201, auth: "board" },
  { method: "get", path: `${catalogBase}/packages/{packageId}`, summary: "Read a private package", description: "Board only and company scoped.", auth: "board" },
  { method: "put", path: `${catalogBase}/packages/{packageId}`, summary: "Replace a package draft", description: "Board only; requires agents:create.", body: portablePackageSchema, auth: "board" },
  { method: "delete", path: `${catalogBase}/packages/{packageId}`, summary: "Delete a package draft", description: "Board only; requires agents:create.", status: 204, noContent: true, auth: "board" },
  ...(["request-review", "return-to-draft", "publish", "withdraw"] as const).map((action) => ({ method: "post", path: `${catalogBase}/packages/{packageId}/${action}`, summary: `${action} a package`, description: `Board only; requires agents:create. ${action === "publish" ? "Publishing requires an explicit privacy attestation." : ""}`, ...(action === "publish" ? { body: portablePackageStatusActionSchema } : {}), auth: "board" as const })),
  { method: "get", path: `${catalogBase}/packages/{packageId}/export`, summary: "Export a published package", description: "Board only; excludes unsupported resources and authority-bearing data.", auth: "board" },
  { method: "get", path: `${catalogBase}/packages/{packageId}/install-plan`, summary: "Preview a package installation plan", description: "Board only; previews unsupported sections and exact skill availability; installs nothing.", auth: "board" },
  { method: "post", path: `${catalogBase}/packages/{packageId}/installations`, summary: "Create a reviewed installation receipt", description: "Board only; requires agents:create. Items are not hired until explicitly claimed through existing hire workflow.", body: createPackageInstallationSchema, status: 201, auth: "board" },
  { method: "get", path: `${catalogBase}/installations`, summary: "List installation receipts", description: "Board only and company scoped.", auth: "board" },
  { method: "get", path: `${catalogBase}/installations/{installationId}`, summary: "Read an installation receipt", description: "Board only and company scoped.", auth: "board" },
  { method: "delete", path: `${catalogBase}/installations/{installationId}`, summary: "Discard an installation receipt", description: "Board only; requires agents:create.", status: 204, noContent: true, auth: "board" },
  ...(["claim", "reconcile", "cancel"] as const).map((action) => ({ method: "post", path: `${catalogBase}/installations/{installationId}/items/{itemId}/${action}`, summary: `${action} an installation item`, description: `Board only; requires agents:create. Claim returns data for existing hire approval; cancel only affects unclaimed items.`, auth: "board" as const })),

  { method: "get", path: "/api/companies/{companyId}/productization/builder/connections", summary: "Read verified connection health for the builder", description: "Board only; reports registered connection and verification evidence.", auth: "board" },
  { method: "get", path: "/api/companies/{companyId}/productization/builder/url-extraction", summary: "Check authorized URL extraction availability", description: "Board only; reports configured connector availability and does not fetch a URL itself.", auth: "board" },
  { method: "post", path: "/api/companies/{companyId}/productization/builder/drafts", summary: "Save a versioned builder draft", description: "Board only; deterministic human-supplied configuration, not an LLM-generated proposal.", body: builderDraftRequestSchema, auth: "board" },
  { method: "post", path: "/api/companies/{companyId}/productization/builder/drafts/{draftId}/clone", summary: "Clone a builder draft version", description: "Board only; copies declarative fields, not credentials or execution authority.", body: builderCloneRequestSchema, auth: "board" },
  { method: "get", path: "/api/companies/{companyId}/productization/builder/compare", summary: "Compare two saved builder versions", description: "Board only; both versions must belong to the same company.", query: z.object({ leftDraftId: uuid, leftVersion: z.coerce.number().int().positive(), rightDraftId: uuid, rightVersion: z.coerce.number().int().positive() }).strict(), auth: "board" },
  { method: "post", path: "/api/companies/{companyId}/productization/builder/configuration-preview", summary: "Validate a saved builder configuration", description: "Board only; validation preview is not an execution sandbox.", body: builderConfigurationPreviewRequestSchema, auth: "board" },

  { method: "get", path: "/api/productization/accounts", summary: "List billing accounts", description: "Board signed-in user; account membership controls returned scope.", auth: "board" },
  { method: "post", path: "/api/productization/accounts", summary: "Create a billing account", description: "Board signed-in user.", body: productAccountCreateSchema, status: 201, auth: "board" },
  { method: "get", path: "/api/productization/accounts/{accountId}", summary: "Read a billing account", description: "Board signed-in member of the account.", auth: "board" },
  { method: "get", path: "/api/productization/accounts/{accountId}/members", summary: "List billing account members", description: "Board signed-in member of the account.", auth: "board" },
  { method: "post", path: "/api/productization/accounts/{accountId}/members", summary: "Add a billing account member", description: "Board signed-in account admin.", body: productAccountMemberSchema, status: 201, auth: "board" },
  { method: "post", path: "/api/productization/accounts/{accountId}/companies", summary: "Grant a company to an account", description: "Board user with users:manage_permissions on the company. Account membership does not grant company permissions.", body: productAccountCompanyGrantSchema, status: 201, auth: "board" },
  { method: "get", path: "/api/productization/plans", summary: "List configured product plans", description: "Public plan catalog; empty/unconfigured prices remain absent.", auth: "public" },
  { method: "put", path: "/api/productization/plans/{planId}", summary: "Update a product plan", description: "Instance administrator only.", body: productPlanSchema.omit({ id: true }), auth: "instance_admin" },
  { method: "post", path: "/api/productization/accounts/{accountId}/billing/checkout", summary: "Start configured Stripe checkout", description: "Board signed-in account member. The handler coerces planId, successUrl and cancelUrl to strings; service validates the plan and return URLs. This mirrors the route contract; it is not a shared Zod validator.", body: billingCheckoutBody, auth: "board" },
  { method: "post", path: "/api/productization/accounts/{accountId}/billing/portal", summary: "Open configured Stripe customer portal", description: "Board signed-in account member. The handler coerces returnUrl to a string; service validates the URL and provider configuration. This mirrors the route contract; it is not a shared Zod validator.", body: billingPortalBody, auth: "board" },
  { method: "post", path: "/api/public/productization/stripe/webhook", summary: "Receive signed Stripe billing events", description: "Stripe only; requires a valid `stripe-signature` over the raw request body. Not a board or anonymous business endpoint.", body: z.unknown(), auth: "stripe_webhook" },

  { method: "get", path: "/api/companies/{companyId}/lead-forms", summary: "List company lead forms", description: "Company access required; supports status, search and cursor pagination.", query: leadFormListQuerySchema, auth: "authenticated" },
  { method: "post", path: "/api/companies/{companyId}/lead-forms", summary: "Create a lead form", description: "Board only; company scoped.", body: createLeadFormSchema, status: 201, auth: "board" },
  { method: "get", path: "/api/lead-forms/{id}", summary: "Read a lead form and embed snippet", description: "Company access required.", auth: "authenticated" },
  { method: "patch", path: "/api/lead-forms/{id}", summary: "Update a lead form", description: "Board only; expectedUpdatedAt provides optimistic concurrency.", body: updateLeadFormSchema, auth: "board" },
  ...(["publish", "unpublish", "archive", "restore"] as const).map((action) => ({ method: "post", path: `/api/lead-forms/{id}/${action}`, summary: `${action} a lead form`, description: "Board only; expectedUpdatedAt prevents overwriting a newer version.", body: leadFormLifecycleSchema, auth: "board" as const })),
  { method: "post", path: "/api/p/{companySlug}/form/{formSlug}", summary: "Submit a published public lead form", description: "Public rate-limited intake; body fields depend on the published form. Accepts JSON or URL-encoded fields and silently ignores bot honeypot submissions.", body: publicFormSubmission, bodyContentTypes: ["application/json", "application/x-www-form-urlencoded"], status: 201, auth: "public" },

  { method: "post", path: "/api/companies/{companyId}/customer-portals", summary: "Create an expiring customer portal link", description: "Company access; board user only. Token is returned once and must be sent as X-Paperclip-Customer-Portal on public requests.", body: portalCreate, status: 201, auth: "board" },
  { method: "get", path: "/api/companies/{companyId}/customers/{customerId}/customer-portals", summary: "List customer portal links", description: "Company scoped.", auth: "authenticated" },
  { method: "post", path: "/api/companies/{companyId}/customer-portals/{portalId}/revoke", summary: "Revoke a customer portal link", description: "Company access; board user only.", auth: "board" },
  { method: "get", path: "/api/companies/{companyId}/customer-portals/{portalId}/feedback", summary: "List customer portal feedback", description: "Company access; board user only.", auth: "board" },
  { method: "get", path: "/api/public/customer-portals/{portalId}", summary: "Read a customer portal view", description: "Requires the unexpired, unrevoked token in the X-Paperclip-Customer-Portal header; responses are no-store and no-referrer.", auth: "customer_portal" },
  { method: "post", path: "/api/public/customer-portals/{portalId}/comments", summary: "Submit a portal conversation comment", description: "Requires the customer portal token header; writes only to the authorized conversation.", body: portalComment, status: 201, auth: "customer_portal" },
  { method: "post", path: "/api/public/customer-portals/{portalId}/proposal-acceptances", summary: "Accept a portal proposal revision", description: "Requires the customer portal token header; acceptance is bound to the displayed proposal reference and revision.", body: portalAccept, auth: "customer_portal" },
  { method: "post", path: "/api/public/customer-portals/{portalId}/deliverable-feedback", summary: "Submit portal deliverable feedback", description: "Requires the customer portal token header; idempotency key is required.", body: portalFeedback, status: 201, auth: "customer_portal" },

  { method: "get", path: "/api/companies/{companyId}/productization/metrics", summary: "Read sourced product outcome metrics", description: "Board only; period is limited to the shared 1–90 day query. Coverage describes available source evidence.", query: outcomeMetricsQuerySchema, response: outcomeMetricsSchema, auth: "board" },
  { method: "get", path: "/api/companies/{companyId}/media-presets", summary: "List versioned company media presets", description: "Company access required.", auth: "authenticated" },
  { method: "post", path: "/api/companies/{companyId}/media-presets", summary: "Create a media preset version", description: "Board user only; brand references and music license URLs are references, not verified rights or automatic overlays.", body: mediaPreset, status: 201, auth: "board" },
  { method: "get", path: "/api/companies/{companyId}/media-presets/metrics", summary: "Read media production metrics", description: "Company access required; days is 7, 30 or 90; cost and duration coverage are evidence-based.", query: z.object({ days: z.enum(["7", "30", "90"]).default("30") }), auth: "authenticated" },
  { method: "get", path: "/api/companies/{companyId}/media-queue", summary: "Read a company media queue page", description: "Board only; returns the active job and stable cursor-paginated pending jobs ordered by bounded priority, creation time and id.", query: mediaQueueQuerySchema, auth: "board" },
  { method: "patch", path: "/api/companies/{companyId}/media-jobs/{jobId}/priority", summary: "Change a queued media job priority", description: "Board only; priority 0–100, expectedUpdatedAt CAS; running jobs cannot be preempted.", body: mediaPriorityUpdateSchema, auth: "board" },

  { method: "get", path: "/api/companies/{companyId}/productization/security/retention", summary: "Read the requested company retention preference", description: "Board only; reports enforcement as not_configured.", auth: "board" },
  { method: "put", path: "/api/companies/{companyId}/productization/security/retention", summary: "Save a company retention preference", description: "Board user with users:manage_permissions. Saving records a preference only; it does not delete or expire data.", body: companyRetentionPolicyInputSchema, auth: "board" },
  { method: "get", path: notificationBase, summary: "Read the current user's notification inbox", description: "Board user; company scoped, private and no-store.", auth: "board" },
  { method: "put", path: `${notificationBase}/preferences`, summary: "Update notification preferences", description: "Board user; changes category and in-browser notification preferences only.", body: notificationPreferences, auth: "board" },
  { method: "get", path: `${notificationBase}/push/config`, summary: "Read Web Push configuration availability", description: "Board company context; reports configured public VAPID key or unavailable state.", auth: "board" },
  { method: "get", path: `${notificationBase}/push/subscriptions`, summary: "List this user's company push subscriptions", description: "Board user; only the caller's subscriptions are returned.", auth: "board" },
  { method: "post", path: `${notificationBase}/push/subscriptions`, summary: "Register a company push subscription", description: "Board user; requires configured VAPID keys and a supported push endpoint; subscription material is encrypted at rest.", body: pushSubscription, status: 201, auth: "board" },
  { method: "delete", path: `${notificationBase}/push/subscriptions/{subscriptionId}`, summary: "Revoke one push subscription", description: "Board user; revokes only the caller's company-scoped subscription.", auth: "board" },
  { method: "delete", path: `${notificationBase}/push/subscriptions`, summary: "Revoke all caller push subscriptions", description: "Board user; disables remote push for the caller in this company.", auth: "board" },

  { method: "get", path: "/api/productization/public-api/scopes", summary: "List read-only Public API scopes", description: "Public catalog of supported least-privilege read scopes.", auth: "public" },
  { method: "get", path: "/api/productization/public-api/keys", summary: "List company Public API keys", description: "Signed-in board user with users:manage_permissions; companyId query is required.", query: companyIdQuery, auth: "board" },
  { method: "post", path: "/api/productization/public-api/keys", summary: "Create a scoped read-only Public API key", description: "Board user with users:manage_permissions; plaintext token is returned only at creation.", body: publicApiKeyCreateSchema, status: 201, auth: "board" },
  { method: "delete", path: "/api/productization/public-api/keys/{id}", summary: "Revoke a Public API key", description: "Board user with users:manage_permissions; companyId query is required.", query: companyIdQuery, auth: "board" },
  { method: "get", path: "/api/productization/public-api/webhooks", summary: "List company business webhooks", description: "Board user with users:manage_permissions; companyId query is required. Secret values are not returned.", query: companyIdQuery, auth: "board" },
  { method: "post", path: "/api/productization/public-api/webhooks", summary: "Create a signed business webhook", description: "Board user with users:manage_permissions; recipient must pass HTTPS callback URL validation. Signing secret is returned once.", body: businessWebhookCreateSchema, status: 201, auth: "board" },
  { method: "post", path: "/api/productization/public-api/webhooks/{id}/rotate", summary: "Rotate a business webhook signing secret", description: "Board user with users:manage_permissions; new secret is returned once.", auth: "board" },
  { method: "delete", path: "/api/productization/public-api/webhooks/{id}", summary: "Revoke a business webhook", description: "Board user with users:manage_permissions.", auth: "board" },
  ...v1ListRoutes.flatMap((resource) => [
    { method: "get", path: `/api/v1/${resource}`, summary: `List public API ${resource}`, description: "Requires a pcp_public_ scoped bearer key; company is taken from the key, read-only, page size 1–100 and offset capped at 10,000.", query: publicPageQuery, auth: "scoped_api" as const },
    { method: "get", path: `/api/v1/${resource}/{id}`, summary: `Read a public API ${resource} record`, description: "Requires the same-company pcp_public_ bearer key with the resource's read scope; no ambient board session or agent credentials are accepted.", auth: "scoped_api" as const },
  ]),
];

export const productizationOpenApiAuthByOperation = new Map(
  productizationOpenApiRoutes.map((route) => [`${route.method.toUpperCase()} ${route.path}`, route.auth]),
);
