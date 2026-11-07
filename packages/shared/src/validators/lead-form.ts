import { z } from "zod";

// Lead form contract (S80). The keys below are the only fields the public
// submission parser accepts (server/src/services/leads/lead-forms.ts). Adding a
// key means changing the parser, the embed builder and this list together.
export const LEAD_FORM_FIELD_KEYS = ["name", "email", "phone", "company", "message", "consent"] as const;
export type LeadFormField = (typeof LEAD_FORM_FIELD_KEYS)[number];

export const LEAD_FORM_DEFAULT_FIELDS: LeadFormField[] = ["name", "email", "message"];

/** Stable public identifier: set once on create, never changed by an update. */
export const leadFormSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens");

export const leadFormSettingsSchema = z
  .object({
    /** Recorded on every lead from this form as attribution (for example a campaign name). */
    sourceLabel: z.string().trim().max(80).nullable().optional(),
    /** Shown next to the consent checkbox and stored with each consenting submission. */
    consentText: z.string().trim().max(1_000).nullable().optional(),
  })
  .strict();

export const leadFormFieldsSchema = z
  .array(z.enum(LEAD_FORM_FIELD_KEYS))
  .max(LEAD_FORM_FIELD_KEYS.length)
  .refine((fields) => fields.includes("email") || fields.includes("phone"), {
    message: "Enable email or phone so the lead can be contacted",
  })
  .refine((fields) => new Set(fields).size === fields.length, { message: "Each field can be listed once" });

export const createLeadFormSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    /** Optional. When omitted the slug is derived from the name and suffixed if already used. */
    slug: leadFormSlugSchema.optional(),
    fields: leadFormFieldsSchema.optional(),
    settings: leadFormSettingsSchema.optional(),
  })
  .strict();

/**
 * `expectedUpdatedAt` is the `updatedAt` the client last read. The write applies only while
 * the row still has that value; otherwise the API answers 409 instead of overwriting.
 */
export const updateLeadFormSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime(),
    name: z.string().trim().min(1).max(120).optional(),
    fields: leadFormFieldsSchema.optional(),
    settings: leadFormSettingsSchema.optional(),
  })
  .strict();

export const leadFormLifecycleSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();

export const leadFormListQuerySchema = z.object({
  status: z.enum(["active", "archived", "all"]).default("active"),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateLeadForm = z.infer<typeof createLeadFormSchema>;
export type UpdateLeadForm = z.infer<typeof updateLeadFormSchema>;
export type LeadFormLifecycle = z.infer<typeof leadFormLifecycleSchema>;
export type LeadFormListQuery = z.infer<typeof leadFormListQuerySchema>;
export type LeadFormStatusFilter = LeadFormListQuery["status"];
export type LeadFormLifecycleAction = "publish" | "unpublish" | "archive" | "restore";

export interface LeadFormSettings {
  sourceLabel: string | null;
  consentText: string | null;
}

/**
 * `active` means the form is in use (archiving sets it false). `published` means the public
 * URL accepts submissions; a published form is always active.
 */
export interface LeadForm {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  fields: LeadFormField[];
  settings: LeadFormSettings;
  active: boolean;
  published: boolean;
  publicPath: string;
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
}

/** Single-form responses add a ready-to-paste HTML snippet that posts to `publicUrl`. */
export interface LeadFormDetail extends LeadForm {
  embedHtml: string;
}

export interface LeadFormPage {
  items: LeadForm[];
  nextCursor: string | null;
}
