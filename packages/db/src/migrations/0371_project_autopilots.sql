CREATE TABLE "project_autopilots" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"responsible_user_id" text NOT NULL,
	"config" jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"next_tick_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_autopilots" ADD CONSTRAINT "project_autopilots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_autopilots" ADD CONSTRAINT "project_autopilots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_autopilots_due_idx" ON "project_autopilots" USING btree ("enabled","next_tick_at");--> statement-breakpoint
CREATE INDEX "project_autopilots_company_idx" ON "project_autopilots" USING btree ("company_id");