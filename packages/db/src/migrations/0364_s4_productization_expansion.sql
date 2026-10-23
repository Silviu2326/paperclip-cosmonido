ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "twoFactor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"verified" boolean DEFAULT false NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	CONSTRAINT "twoFactor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX "two_factor_user_id_uq" ON "twoFactor" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "productization_company_retention" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productization_company_retention_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "productization_company_retention_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "productization_company_retention_days_check" CHECK ("productization_company_retention"."retention_days" BETWEEN 1 AND 3650)
);--> statement-breakpoint
CREATE UNIQUE INDEX "productization_company_retention_company_uq" ON "productization_company_retention" USING btree ("company_id");--> statement-breakpoint
CREATE TABLE "product_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"plan_id" text NOT NULL,
	"access" text DEFAULT 'inactive' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_accounts_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "product_accounts_access_check" CHECK ("product_accounts"."access" in ('active','trial_eligible','inactive'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_accounts_stripe_customer_uidx" ON "product_accounts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_accounts_stripe_subscription_uidx" ON "product_accounts" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE TABLE "product_account_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_account_members_account_id_product_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."product_accounts"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_account_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_account_members_role_check" CHECK ("product_account_members"."role" in ('owner','admin','member'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_account_members_account_user_uidx" ON "product_account_members" USING btree ("account_id","user_id");--> statement-breakpoint
CREATE TABLE "product_account_company_grants" (
	"account_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_account_company_grants_pk" PRIMARY KEY("account_id","company_id"),
	CONSTRAINT "product_account_company_grants_account_id_product_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."product_accounts"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_account_company_grants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_account_company_grants_granted_by_user_id_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_account_company_grants_company_uidx" ON "product_account_company_grants" USING btree ("company_id");--> statement-breakpoint
CREATE TABLE "product_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"limits" jsonb NOT NULL,
	"stripe_price_id" text,
	"enabled" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "product_usage_meters" (
	"account_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"period_key" text NOT NULL,
	"consumed" numeric(24, 7) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_usage_meters_pk" PRIMARY KEY("account_id","metric","period_key"),
	CONSTRAINT "product_usage_meters_account_id_product_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."product_accounts"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_usage_meters_consumed_check" CHECK ("product_usage_meters"."consumed" >= 0)
);--> statement-breakpoint
CREATE TABLE "product_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"period_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"quantity" numeric(24, 7) NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_usage_events_account_id_product_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."product_accounts"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_usage_events_account_idempotency_uidx" ON "product_usage_events" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE TABLE "product_billing_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "product_account_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"actor_id" text NOT NULL,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_account_audit_events_account_id_product_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."product_accounts"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "product_usage_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"period_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"quantity" numeric(24, 7) NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_usage_reservations_account_id_product_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."product_accounts"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_usage_reservations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_usage_reservations_state_check" CHECK ("product_usage_reservations"."state" in ('reserved','committed','uncertain','released')),
	CONSTRAINT "product_usage_reservations_quantity_check" CHECK ("product_usage_reservations"."quantity" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_usage_reservations_account_key_uidx" ON "product_usage_reservations" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE TABLE "customer_portals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"contact_id" uuid,
	"token_hash" text NOT NULL,
	"resource_kinds" jsonb DEFAULT '["deliverables","proposals","meetings","conversations","commitments"]'::jsonb NOT NULL,
	"allow_deliverable_feedback" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_portals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "customer_portals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "customer_portals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_portals_token_hash_uq" ON "customer_portals" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_portals_company_customer_idx" ON "customer_portals" USING btree ("company_id","customer_id","created_at");--> statement-breakpoint
CREATE TABLE "customer_portal_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"portal_id" uuid NOT NULL,
	"target_kind" text DEFAULT 'work_product' NOT NULL,
	"target_id" uuid NOT NULL,
	"target_version" text NOT NULL,
	"decision" text NOT NULL,
	"comment" text NOT NULL,
	"actor_kind" text DEFAULT 'portal_token_holder' NOT NULL,
	"contact_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_portal_feedback_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "customer_portal_feedback_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "customer_portal_feedback_portal_id_customer_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."customer_portals"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "customer_portal_feedback_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "customer_portal_feedback_decision_check" CHECK ("customer_portal_feedback"."decision" in ('accept', 'changes_requested')),
	CONSTRAINT "customer_portal_feedback_kind_check" CHECK ("customer_portal_feedback"."target_kind" = 'work_product' and "customer_portal_feedback"."actor_kind" = 'portal_token_holder')
);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_portal_feedback_portal_key_uq" ON "customer_portal_feedback" USING btree ("portal_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "customer_portal_feedback_customer_idx" ON "customer_portal_feedback" USING btree ("company_id","customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_portal_feedback_portal_idx" ON "customer_portal_feedback" USING btree ("portal_id","created_at");--> statement-breakpoint
CREATE TABLE "productization_media_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"preset_key" text NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"output_aspect" text DEFAULT '9:16' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"input_criteria" jsonb NOT NULL,
	"operations" jsonb NOT NULL,
	"brand_references" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productization_media_presets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "productization_media_presets_kind_check" CHECK ("productization_media_presets"."kind" in ('clip', 'demo', 'testimonial', 'tutorial', 'advert')),
	CONSTRAINT "productization_media_presets_aspect_check" CHECK ("productization_media_presets"."output_aspect" in ('9:16', '16:9'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "productization_media_presets_company_key_version_uq" ON "productization_media_presets" USING btree ("company_id","preset_key","version");--> statement-breakpoint
CREATE INDEX "productization_media_presets_company_kind_idx" ON "productization_media_presets" USING btree ("company_id","kind","created_at");--> statement-breakpoint
CREATE TABLE "productization_portable_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"package_key" text NOT NULL,
	"package_version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"privacy_attested_at" timestamp with time zone,
	"created_by_user_id" text,
	"review_requested_at" timestamp with time zone,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"published_by_user_id" text,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productization_portable_packages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "productization_portable_packages_status_check" CHECK ("productization_portable_packages"."status" in ('draft','in_review','published','withdrawn'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "productization_portable_packages_company_key_version_uq" ON "productization_portable_packages" USING btree ("company_id","package_key","package_version");--> statement-breakpoint
CREATE INDEX "productization_portable_packages_company_status_idx" ON "productization_portable_packages" USING btree ("company_id","status","updated_at");--> statement-breakpoint
CREATE TABLE "productization_package_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"package_key" text NOT NULL,
	"package_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"plan" jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "productization_package_installations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "productization_package_installations_package_id_productization_portable_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."productization_portable_packages"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "productization_package_installations_status_check" CHECK ("productization_package_installations"."status" in ('planned','in_progress','completed','needs_attention','cancelled'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "productization_package_installations_company_package_uq" ON "productization_package_installations" USING btree ("company_id","package_id");--> statement-breakpoint
CREATE INDEX "productization_package_installations_company_status_idx" ON "productization_package_installations" USING btree ("company_id","status");--> statement-breakpoint
CREATE TABLE "productization_package_installation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"local_key" text NOT NULL,
	"kind" text DEFAULT 'persistent_agent' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"review" jsonb NOT NULL,
	"hire_attempt_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"approval_id" uuid,
	"claimed_by_user_id" text,
	"claimed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productization_package_installation_items_installation_id_productization_package_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."productization_package_installations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "productization_package_installation_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "productization_package_installation_items_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "productization_package_installation_items_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "productization_package_installation_items_status_check" CHECK ("productization_package_installation_items"."status" in ('planned','submitting','pending_approval','hired','unknown','blocked','cancelled'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "productization_package_installation_items_key_uq" ON "productization_package_installation_items" USING btree ("installation_id","local_key");--> statement-breakpoint
CREATE UNIQUE INDEX "productization_package_installation_items_attempt_uq" ON "productization_package_installation_items" USING btree ("hire_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "productization_package_installation_items_agent_uq" ON "productization_package_installation_items" USING btree ("agent_id") WHERE "productization_package_installation_items"."agent_id" is not null;--> statement-breakpoint
CREATE INDEX "productization_package_installation_items_company_status_idx" ON "productization_package_installation_items" USING btree ("company_id","status");--> statement-breakpoint
CREATE TABLE "product_public_api_keys" (
	"board_api_key_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_public_api_keys_board_api_key_id_board_api_keys_id_fk" FOREIGN KEY ("board_api_key_id") REFERENCES "public"."board_api_keys"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_public_api_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_public_api_keys_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "product_public_api_keys_company_idx" ON "product_public_api_keys" USING btree ("company_id");--> statement-breakpoint
CREATE TABLE "business_webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"url" text NOT NULL,
	"events" jsonb NOT NULL,
	"secret_material" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_webhook_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "business_webhook_subscriptions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "business_webhook_subscriptions_status_check" CHECK ("business_webhook_subscriptions"."status" in ('active','blocked','revoked'))
);--> statement-breakpoint
CREATE INDEX "business_webhook_subscriptions_company_idx" ON "business_webhook_subscriptions" USING btree ("company_id");--> statement-breakpoint
CREATE TABLE "business_webhook_outbox" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"fanned_out_at" timestamp with time zone,
	CONSTRAINT "business_webhook_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "business_webhook_outbox_event_check" CHECK ("business_webhook_outbox"."event_type" in ('lead.created','proposal.accepted','deliverable.accepted','conversation.created'))
);--> statement-breakpoint
CREATE INDEX "business_webhook_outbox_fanout_idx" ON "business_webhook_outbox" USING btree ("fanned_out_at","occurred_at");--> statement-breakpoint
CREATE TABLE "business_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_http_status" integer,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_webhook_deliveries_event_id_business_webhook_outbox_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."business_webhook_outbox"("event_id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "business_webhook_deliveries_subscription_id_business_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."business_webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "business_webhook_deliveries_status_check" CHECK ("business_webhook_deliveries"."status" in ('pending','delivering','delivered','blocked'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "business_webhook_deliveries_event_subscription_uq" ON "business_webhook_deliveries" USING btree ("event_id","subscription_id");--> statement-breakpoint
CREATE INDEX "business_webhook_deliveries_due_idx" ON "business_webhook_deliveries" USING btree ("status","next_attempt_at","locked_until");--> statement-breakpoint
CREATE TABLE "product_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"categories" jsonb DEFAULT '["decisions","reviews","tasks"]'::jsonb NOT NULL,
	"browser_enabled" boolean DEFAULT false NOT NULL,
	"remote_push_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_notification_preferences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_notification_preferences_category_scope_check" CHECK ("product_notification_preferences"."categories" <@ '["decisions", "reviews", "tasks"]'::jsonb)
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_notification_preferences_company_user_uq" ON "product_notification_preferences" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "product_notification_preferences_company_idx" ON "product_notification_preferences" USING btree ("company_id");--> statement-breakpoint
CREATE TABLE "product_notification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"endpoint_hash" text NOT NULL,
	"endpoint_host" text NOT NULL,
	"encrypted_material" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_notification_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_notification_subscriptions_status_check" CHECK ("product_notification_subscriptions"."status" in ('active', 'revoked', 'expired'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_notification_subscriptions_owner_endpoint_uq" ON "product_notification_subscriptions" USING btree ("company_id","user_id","endpoint_hash");--> statement-breakpoint
CREATE INDEX "product_notification_subscriptions_active_company_idx" ON "product_notification_subscriptions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "product_notification_subscriptions_user_idx" ON "product_notification_subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE TABLE "product_notification_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_notification_signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_notification_signals_activity_id_activity_log_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_log"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_notification_signals_status_check" CHECK ("product_notification_signals"."status" in ('pending', 'processing', 'processed', 'dead'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_notification_signals_activity_uq" ON "product_notification_signals" USING btree ("company_id","activity_id");--> statement-breakpoint
CREATE INDEX "product_notification_signals_queue_idx" ON "product_notification_signals" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE TABLE "product_notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"category" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"revision" text NOT NULL,
	"href" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"last_status_code" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_notification_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_notification_outbox_subscription_id_product_notification_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."product_notification_subscriptions"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "product_notification_outbox_category_check" CHECK ("product_notification_outbox"."category" in ('decisions', 'reviews', 'tasks')),
	CONSTRAINT "product_notification_outbox_status_check" CHECK ("product_notification_outbox"."status" in ('pending', 'sending', 'sent', 'dead', 'expired'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "product_notification_outbox_source_revision_uq" ON "product_notification_outbox" USING btree ("subscription_id","source_type","source_id","revision");--> statement-breakpoint
CREATE INDEX "product_notification_outbox_queue_idx" ON "product_notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "product_notification_outbox_company_user_idx" ON "product_notification_outbox" USING btree ("company_id","user_id","created_at");--> statement-breakpoint
ALTER TABLE "lead_forms" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "lead_forms" SET "published" = true WHERE "active" = true;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD COLUMN "priority" numeric(3, 0) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_priority_check" CHECK ("media_jobs"."priority" between 0 and 100);--> statement-breakpoint
CREATE INDEX "media_jobs_priority_queue_idx" ON "media_jobs" USING btree ("company_id","status","priority" DESC,"created_at" ASC,"id" ASC);
