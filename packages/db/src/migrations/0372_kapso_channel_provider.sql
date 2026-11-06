ALTER TABLE "customer_channel_accounts" DROP CONSTRAINT "customer_channel_accounts_provider_check";--> statement-breakpoint
ALTER TABLE "customer_channel_accounts" ADD CONSTRAINT "customer_channel_accounts_provider_check" CHECK ("customer_channel_accounts"."provider" in ('meta', 'kapso', 'telegram', 'twilio'));
