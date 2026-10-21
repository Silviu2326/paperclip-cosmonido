import { createHash } from "node:crypto";
import express, { type Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { leadForms } from "@paperclipai/db";
import { badRequest, notFound } from "../../errors.js";
import { leadIntakeService } from "../../services/leads/intake.js";
import { normalizeEmail, normalizePhoneE164 } from "../../services/crm/identity.js";
import { PUBLIC_COMPANY_LOCALS_KEY, publicRateLimit } from "../public-surface.js";

// Public lead intake (pista B): POST /p/:companySlug/form/:formSlug.
// Accepts JSON or application/x-www-form-urlencoded. Minimum fields: name and an
// email or phone. The honeypot field "website" silently drops bot submissions.
// The router-level limiter (120/min per IP) applies first; this form adds a
// stricter per-IP limit of 20 submissions per minute.

export const FORM_HONEYPOT_FIELD = "website";
const FORM_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

const formSubmissionSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
    company: z.string().trim().max(200).optional(),
    message: z.string().trim().max(2000).optional(),
    language: z.string().trim().min(2).max(10).optional(),
    /** Optional client-generated id; a repeated submission with the same id is not stored twice. */
    clientId: z.string().trim().min(1).max(200).optional(),
  })
  .refine((value) => normalizeEmail(value.email ?? null) !== null || normalizePhoneE164(value.phone ?? null) !== null, {
    message: "Email or phone is required",
    path: ["email"],
  });

/** Drops empty strings (HTML forms send every field) and non-object bodies. */
function cleanSubmission(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim() === "") continue;
    if (value === undefined || value === null) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export function registerPublicLeadRoutes(router: Router, db: Db): void {
  const intake = leadIntakeService(db);
  const formRateLimit = publicRateLimit(FORM_RATE_LIMIT);

  router.post(
    "/form/:formSlug",
    formRateLimit,
    express.urlencoded({ extended: false, limit: "64kb" }),
    async (req, res, next) => {
      try {
        const companyId = res.locals[PUBLIC_COMPANY_LOCALS_KEY] as string;
        const formSlug = req.params.formSlug as string;

        const [form] = await db
          .select({ id: leadForms.id, slug: leadForms.slug })
          .from(leadForms)
          .where(and(eq(leadForms.companyId, companyId), eq(leadForms.slug, formSlug), eq(leadForms.active, true)))
          .limit(1);
        if (!form) throw notFound("Form not found");

        const raw = req.body;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("Invalid submission");

        // Honeypot: a filled hidden field means a bot. Answer like a success, store nothing.
        const honeypot = (raw as Record<string, unknown>)[FORM_HONEYPOT_FIELD];
        if (typeof honeypot === "string" && honeypot.trim() !== "") {
          res.status(201).json({ ok: true });
          return;
        }

        const parsed = formSubmissionSchema.safeParse(cleanSubmission(raw));
        if (!parsed.success) {
          throw badRequest("Invalid submission", parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })));
        }
        const submission = parsed.data;
        const email = normalizeEmail(submission.email ?? null);
        const phone = normalizePhoneE164(submission.phone ?? null);
        const identityKey = email ?? phone ?? "";

        // Without a client id the ref is stable for the same person and form within one minute.
        const minute = Math.floor(Date.now() / 60_000);
        const sourceRef = submission.clientId
          ? `client:${submission.clientId}`
          : `form:${createHash("sha256").update(`${formSlug}|${identityKey}|${minute}`).digest("hex").slice(0, 32)}`;

        await intake.ingest(companyId, {
          source: "form",
          sourceRef,
          payload: {
            name: submission.name,
            company: submission.company ?? null,
            email,
            phone,
            message: submission.message ?? null,
            form: form.slug,
          },
          identity: { email, phone },
          language: submission.language ?? null,
        });
        res.status(201).json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );
}
