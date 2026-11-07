import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { leadForms } from "@paperclipai/db";
import {
  LEAD_FORM_DEFAULT_FIELDS,
  LEAD_FORM_FIELD_KEYS,
  type CreateLeadForm,
  type LeadForm,
  type LeadFormDetail,
  type LeadFormField,
  type LeadFormLifecycleAction,
  type LeadFormListQuery,
  type LeadFormSettings,
  type UpdateLeadForm,
} from "@paperclipai/shared";
import { badRequest, conflict, notFound } from "../../errors.js";
import { normalizeEmail, normalizePhoneE164 } from "../crm/identity.js";
import { isUniqueViolation } from "./intake.js";

// Lead form management and the public submission contract (S80).
// The editor writes `fields` and `settings`; the public route reads them through
// buildLeadFormSubmissionSchema and buildLeadFormPayload, so runtime and editor
// share one field list. Submission still goes through leadIntakeService.ingest.

type LeadFormRow = typeof leadForms.$inferSelect;

const LIST_LIMIT_MAX = 100;
const SLUG_ATTEMPTS = 20;

/** Accepts the values an HTML checkbox or a JSON client may send for consent. */
const consentSchema = z.preprocess(
  (value) => value === true || value === "true" || value === "on" || value === "1",
  z.literal(true, { message: "Consent is required" }),
);

const cursorSchema = z.object({ u: z.iso.datetime(), i: z.uuid() });

/**
 * Fields are stored as the list of enabled keys in canonical order. `name` is always
 * present. Rows written before this contract may hold no contact field at all; they are
 * read as contactable (email and phone) so the public form keeps accepting leads.
 */
export function normalizeLeadFormFields(input: readonly unknown[] | null | undefined): LeadFormField[] {
  const enabled = new Set<string>(
    Array.isArray(input) ? input.filter((value): value is string => typeof value === "string") : [],
  );
  enabled.add("name");
  if (!enabled.has("email") && !enabled.has("phone")) {
    enabled.add("email");
    enabled.add("phone");
  }
  return LEAD_FORM_FIELD_KEYS.filter((key) => enabled.has(key));
}

export function normalizeLeadFormSettings(input: unknown): LeadFormSettings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const text = (value: unknown, max: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
  return {
    sourceLabel: text(source.sourceLabel, 80),
    consentText: text(source.consentText, 1_000),
  };
}

function assertFormConfig(fields: readonly LeadFormField[], settings: LeadFormSettings) {
  if (fields.includes("consent") && !settings.consentText) {
    throw badRequest("Consent text is required when the consent field is enabled", [
      { path: "settings.consentText", message: "Required" },
    ]);
  }
}

/** Lowercase ASCII slug from a display name. Falls back to "form" for names without letters. */
export function slugifyLeadFormName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "form";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Parser for one form's public submission. Only enabled fields are in the schema, so a
 * disabled field is stripped and never stored. Email or phone must be a valid value among the
 * enabled identity fields. A consent field requires an explicit acceptance.
 */
export function buildLeadFormSubmissionSchema(form: { fields: readonly unknown[] }) {
  const fields = new Set<string>(normalizeLeadFormFields(form.fields));
  const shape: Record<string, z.ZodType> = {
    name: z.string().trim().min(1).max(200),
    language: z.string().trim().min(2).max(10).optional(),
    clientId: z.string().trim().min(1).max(200).optional(),
  };
  if (fields.has("email")) shape.email = z.string().trim().max(320).optional();
  if (fields.has("phone")) shape.phone = z.string().trim().max(40).optional();
  if (fields.has("company")) shape.company = z.string().trim().max(200).optional();
  if (fields.has("message")) shape.message = z.string().trim().max(2000).optional();
  if (fields.has("consent")) shape.consent = consentSchema;

  return z.object(shape).refine(
    (value) => {
      const emailOk = fields.has("email") && normalizeEmail(typeof value.email === "string" ? value.email : null) !== null;
      const phoneOk = fields.has("phone") && normalizePhoneE164(typeof value.phone === "string" ? value.phone : null) !== null;
      return emailOk || phoneOk;
    },
    { message: "Email or phone is required", path: ["email"] },
  );
}

/** Lead payload for one accepted submission. Disabled fields are null, not missing. */
export function buildLeadFormPayload(
  form: { slug: string; fields: readonly unknown[]; settings: unknown },
  submission: Record<string, unknown>,
  identity: { email: string | null; phone: string | null },
  now: Date = new Date(),
): Record<string, unknown> {
  const fields = new Set<string>(normalizeLeadFormFields(form.fields));
  const settings = normalizeLeadFormSettings(form.settings);
  const text = (key: string) => (fields.has(key) && typeof submission[key] === "string" ? submission[key] : null);
  return {
    name: submission.name,
    company: text("company"),
    email: identity.email,
    phone: identity.phone,
    message: text("message"),
    form: form.slug,
    formSource: settings.sourceLabel,
    consent: fields.has("consent")
      ? { accepted: true, text: settings.consentText, at: now.toISOString() }
      : null,
  };
}

export function presentLeadForm(row: LeadFormRow, origin: string): LeadForm {
  const publicPath = `/api/p/${row.companyId}/form/${row.slug}`;
  return {
    id: row.id,
    companyId: row.companyId,
    slug: row.slug,
    name: row.name,
    fields: normalizeLeadFormFields(row.fields),
    settings: normalizeLeadFormSettings(row.settings),
    active: row.active,
    published: row.published,
    publicPath,
    publicUrl: `${origin}${publicPath}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const FIELD_HTML_LABELS = {
  email: "Email",
  phone: "Phone",
  company: "Company",
  message: "Message",
} as const;

/**
 * Plain HTML form that posts to the public endpoint. It has no styling, script or redirect.
 * The browser shows the endpoint's JSON acknowledgement. Every value that reaches the
 * markup is escaped, and the honeypot field matches the public parser.
 */
export function buildLeadFormEmbedHtml(form: LeadForm): string {
  const lines = [
    `<form method="post" action="${escapeHtml(form.publicUrl)}">`,
    `  <label>Name <input name="name" type="text" required maxlength="200"></label>`,
  ];
  for (const field of form.fields) {
    if (field === "name") continue;
    if (field === "consent") {
      lines.push(
        `  <label><input name="consent" type="checkbox" value="true" required> ${escapeHtml(form.settings.consentText ?? "")}</label>`,
      );
    } else if (field === "message") {
      lines.push(`  <label>${FIELD_HTML_LABELS.message} <textarea name="message" maxlength="2000"></textarea></label>`);
    } else {
      const type = field === "email" ? "email" : field === "phone" ? "tel" : "text";
      const max = field === "email" ? 320 : field === "phone" ? 40 : 200;
      lines.push(`  <label>${FIELD_HTML_LABELS[field]} <input name="${field}" type="${type}" maxlength="${max}"></label>`);
    }
  }
  lines.push(
    `  <input name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-10000px">`,
    `  <button type="submit">Send</button>`,
    `</form>`,
  );
  return lines.join("\n");
}

export function presentLeadFormDetail(row: LeadFormRow, origin: string): LeadFormDetail {
  const form = presentLeadForm(row, origin);
  return { ...form, embedHtml: buildLeadFormEmbedHtml(form) };
}

function encodeCursor(row: LeadFormRow): string {
  return Buffer.from(JSON.stringify({ u: row.updatedAt.toISOString(), i: row.id })).toString("base64url");
}

function decodeCursor(cursor: string): { updatedAt: string; id: string } {
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return { updatedAt: parsed.u, id: parsed.i };
  } catch {
    throw badRequest("Invalid cursor");
  }
}

export function leadFormService(db: Db) {
  async function getById(id: string): Promise<LeadFormRow | null> {
    // A malformed id is simply not found; passing it to Postgres would fail with a 500.
    if (!z.uuid().safeParse(id).success) return null;
    const [row] = await db.select().from(leadForms).where(eq(leadForms.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * Writes only while the stored `updatedAt` still equals the client's token. Postgres stores
   * microseconds and JavaScript keeps milliseconds, so both sides are compared at millisecond
   * precision. A concurrent write moves updatedAt, and this UPDATE then matches no row.
   */
  async function writeIfUnchanged(
    id: string,
    companyId: string,
    expectedUpdatedAt: string,
    values: Partial<typeof leadForms.$inferInsert>,
  ): Promise<LeadFormRow> {
    const [row] = await db
      .update(leadForms)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(leadForms.id, id),
          eq(leadForms.companyId, companyId),
          sql`date_trunc('milliseconds', ${leadForms.updatedAt}) = ${new Date(expectedUpdatedAt)}`,
        ),
      )
      .returning();
    if (row) return row;
    const current = await getById(id);
    if (!current || current.companyId !== companyId) throw notFound("Lead form not found");
    throw conflict("This form changed since you opened it. Reload it and apply your change again.", {
      currentUpdatedAt: current.updatedAt.toISOString(),
    });
  }

  return {
    getById,

    /** Newest first, bounded by `limit`. The cursor is (updatedAt, id) at millisecond precision. */
    async list(companyId: string, query: LeadFormListQuery): Promise<{ items: LeadFormRow[]; nextCursor: string | null }> {
      const limit = Math.min(query.limit, LIST_LIMIT_MAX);
      const conditions = [eq(leadForms.companyId, companyId)];
      if (query.status === "active") conditions.push(eq(leadForms.active, true));
      if (query.status === "archived") conditions.push(eq(leadForms.active, false));
      if (query.q) conditions.push(ilike(leadForms.name, `%${escapeLike(query.q)}%`));
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        conditions.push(
          or(
            sql`date_trunc('milliseconds', ${leadForms.updatedAt}) < ${new Date(cursor.updatedAt)}`,
            and(
              sql`date_trunc('milliseconds', ${leadForms.updatedAt}) = ${new Date(cursor.updatedAt)}`,
              lt(leadForms.id, cursor.id),
            ),
          )!,
        );
      }
      const rows = await db
        .select()
        .from(leadForms)
        .where(and(...conditions))
        .orderBy(desc(sql`date_trunc('milliseconds', ${leadForms.updatedAt})`), desc(leadForms.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]!) : null };
    },

    async create(companyId: string, input: CreateLeadForm, installerProvenance?: { itemId: string; sourceContentHash: string }): Promise<LeadFormRow> {
      const name = input.name.trim();
      const fields = normalizeLeadFormFields(input.fields ?? LEAD_FORM_DEFAULT_FIELDS);
      const settings = normalizeLeadFormSettings(input.settings ?? null);
      assertFormConfig(fields, settings);

      const insert = async (slug: string) => {
        const [row] = await db
          .insert(leadForms)
          .values({ companyId, slug, name, fields, settings, active: true, published: false,
            installationItemId: installerProvenance?.itemId ?? null,
            installationSourceContentHash: installerProvenance?.sourceContentHash ?? null })
          .returning();
        return row!;
      };

      if (input.slug) {
        try {
          return await insert(input.slug);
        } catch (error) {
          if (isUniqueViolation(error)) throw conflict("Another form in this company already uses this slug");
          throw error;
        }
      }

      // Generated slugs are stable from here on; a clash only moves to the next free suffix.
      const base = slugifyLeadFormName(name);
      for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt += 1) {
        try {
          return await insert(attempt === 1 ? base : `${base}-${attempt}`);
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      throw conflict("Could not find a free slug for this name. Choose a slug.");
    },

    /** Applies the supplied fields. The slug never changes (the update schema rejects it). */
    async update(row: LeadFormRow, input: UpdateLeadForm): Promise<LeadFormRow> {
      const name = input.name?.trim() ?? row.name;
      const fields = input.fields
        ? normalizeLeadFormFields(input.fields)
        : normalizeLeadFormFields(row.fields);
      const settings = normalizeLeadFormSettings({
        ...normalizeLeadFormSettings(row.settings),
        ...input.settings,
      });
      assertFormConfig(fields, settings);
      return writeIfUnchanged(row.id, row.companyId, input.expectedUpdatedAt, { name, fields, settings });
    },

    async setLifecycle(
      row: LeadFormRow,
      action: LeadFormLifecycleAction,
      expectedUpdatedAt: string,
    ): Promise<LeadFormRow> {
      switch (action) {
        case "publish":
          if (!row.active) throw conflict("Restore this form before publishing it");
          return writeIfUnchanged(row.id, row.companyId, expectedUpdatedAt, { published: true });
        case "unpublish":
          return writeIfUnchanged(row.id, row.companyId, expectedUpdatedAt, { published: false });
        case "archive":
          // Archiving also withdraws the public URL.
          return writeIfUnchanged(row.id, row.companyId, expectedUpdatedAt, { active: false, published: false });
        case "restore":
          if (row.active) throw conflict("This form is already active");
          return writeIfUnchanged(row.id, row.companyId, expectedUpdatedAt, { active: true });
      }
    },

    /** The public route's lookup: only forms that are active and published. */
    async findPublic(companyId: string, slug: string): Promise<LeadFormRow | null> {
      const [row] = await db
        .select()
        .from(leadForms)
        .where(
          and(
            eq(leadForms.companyId, companyId),
            eq(leadForms.slug, slug),
            eq(leadForms.active, true),
            eq(leadForms.published, true),
          ),
        )
        .limit(1);
      return row ?? null;
    },
  };
}
