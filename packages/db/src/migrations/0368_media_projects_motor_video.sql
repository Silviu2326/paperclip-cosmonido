ALTER TABLE "media_projects" ALTER COLUMN "source_asset_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "media_projects" ADD COLUMN "creation_type" text DEFAULT 'source' NOT NULL;
--> statement-breakpoint
ALTER TABLE "media_jobs" DROP CONSTRAINT "media_jobs_kind_check";
--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_kind_check" CHECK ("media_jobs"."kind" in ('transcribe', 'render', 'dub', 'stop_motion', 'dub_multivoice', 'voiceover', 'motor_video_render'));
--> statement-breakpoint
ALTER TABLE "media_projects" ADD CONSTRAINT "media_projects_creation_type_check" CHECK (("media_projects"."creation_type" = 'source' and "media_projects"."source_asset_id" is not null) or ("media_projects"."creation_type" = 'motor_video' and "media_projects"."source_asset_id" is null));
