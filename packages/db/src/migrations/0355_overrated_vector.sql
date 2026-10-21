CREATE TABLE "company_file_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"version_id" uuid,
	"issue_id" uuid,
	"agent_id" uuid,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"asset_id" uuid NOT NULL,
	"uploaded_by_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"current_version_id" uuid,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_file_reads" ADD CONSTRAINT "company_file_reads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_reads" ADD CONSTRAINT "company_file_reads_file_id_company_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."company_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_reads" ADD CONSTRAINT "company_file_reads_version_id_company_file_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."company_file_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_reads" ADD CONSTRAINT "company_file_reads_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_reads" ADD CONSTRAINT "company_file_reads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_reads" ADD CONSTRAINT "company_file_reads_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_versions" ADD CONSTRAINT "company_file_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_versions" ADD CONSTRAINT "company_file_versions_file_id_company_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."company_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_file_versions" ADD CONSTRAINT "company_file_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_files" ADD CONSTRAINT "company_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_files" ADD CONSTRAINT "company_files_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_file_reads_company_file_issue_idx" ON "company_file_reads" USING btree ("company_id","file_id","issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_file_versions_file_version_uq" ON "company_file_versions" USING btree ("file_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "company_files_company_folder_slug_uq" ON "company_files" USING btree ("company_id","folder_id","slug") WHERE "company_files"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "company_files_company_updated_idx" ON "company_files" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "company_files_company_folder_idx" ON "company_files" USING btree ("company_id","folder_id");