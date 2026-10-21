CREATE TABLE "artifact_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"artifact_ref" text NOT NULL,
	"user_id" text NOT NULL,
	"starred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_file_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"company_file_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"starred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifact_memberships" ADD CONSTRAINT "artifact_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_memberships" ADD CONSTRAINT "company_file_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_memberships" ADD CONSTRAINT "company_file_memberships_company_file_id_company_files_id_fk" FOREIGN KEY ("company_file_id") REFERENCES "public"."company_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_memberships_company_user_starred_idx" ON "artifact_memberships" USING btree ("company_id","user_id","starred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_memberships_company_user_ref_uq" ON "artifact_memberships" USING btree ("company_id","user_id","artifact_ref");--> statement-breakpoint
CREATE INDEX "company_file_memberships_company_user_starred_idx" ON "company_file_memberships" USING btree ("company_id","user_id","starred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_file_memberships_company_user_file_uq" ON "company_file_memberships" USING btree ("company_id","user_id","company_file_id");