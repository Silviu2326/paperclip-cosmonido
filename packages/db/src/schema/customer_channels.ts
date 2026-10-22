import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

// Customer-facing channel accounts (Sprint 2 pistas D/E). Secrets are referenced by name in
// company_secrets; the values never live in this table.
//   provider  meta (WhatsApp, Messenger, Instagram) | telegram | twilio
//   verify_secret_name     signature secret: Meta app secret, Telegram webhook secret token, Twilio auth token
//   challenge_secret_name  Meta GET verification token (hub.verify_token); null for other providers
//   token_secret_name      send credential: Meta access token, Telegram bot token, Twilio auth token
//   external_account_id    Meta: WhatsApp phone_number_id, Messenger page id or Instagram account id;
//                          Telegram: bot id; Twilio: sending number in E.164 (inbound routing key)
//   provider_account_sid   Twilio account SID (REST path); null for other providers
export const customerChannelAccounts = pgTable(
  "customer_channel_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    providerAccountSid: text("provider_account_sid"),
    verifySecretName: text("verify_secret_name").notNull(),
    challengeSecretName: text("challenge_secret_name"),
    tokenSecretName: text("token_secret_name").notNull(),
    status: text("status").notNull().default("pending"),
    approvedTemplates: jsonb("approved_templates")
      .$type<Array<{ name: string; language: string }>>()
      .notNull()
      .default([]),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestError: text("last_test_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUpdatedIdx: index("customer_channel_accounts_company_updated_idx").on(table.companyId, table.updatedAt),
    companyProviderIdentifierUq: uniqueIndex("customer_channel_accounts_company_provider_identifier_uq")
      .on(table.companyId, table.provider, table.externalAccountId),
    providerCheck: check(
      "customer_channel_accounts_provider_check",
      sql`${table.provider} in ('meta', 'telegram', 'twilio')`,
    ),
    kindCheck: check(
      "customer_channel_accounts_kind_check",
      sql`${table.kind} in ('whatsapp', 'messenger', 'instagram', 'telegram', 'sms')`,
    ),
    statusCheck: check(
      "customer_channel_accounts_status_check",
      sql`${table.status} in ('pending', 'active', 'disabled')`,
    ),
  }),
);
