import { createHash } from "node:crypto";
import express, { type Router } from "express";
import type { Db } from "@paperclipai/db";
import { badRequest, notFound } from "../../errors.js";
import { leadIntakeService } from "../../services/leads/intake.js";
import {
  buildLeadFormPayload,
  buildLeadFormSubmissionSchema,
  leadFormService,
} from "../../services/leads/lead-forms.js";
import { normalizeEmail, normalizePhoneE164 } from "../../services/crm/identity.js";
import { PUBLIC_COMPANY_LOCALS_KEY, publicRateLimit } from "../public-surface.js";

// Public lead intake (pista B): POST /p/:companySlug/form/:formSlug.
// Accepts JSON or application/x-www-form-urlencoded. The form's own configuration
// (services/leads/lead-forms.ts) decides which fields are accepted, required and
// stored, so the editor and this route cannot drift apart. Only active and published
// forms accept submissions. The honeypot field "website" silently drops bot submissions.
// The router-level limiter (120/min per IP) applies first; this form adds a
// stricter per-IP limit of 20 submissions per minute.

export const FORM_HONEYPOT_FIELD = "website";
const FORM_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

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
  const forms = leadFormService(db);
  const formRateLimit = publicRateLimit(FORM_RATE_LIMIT);

  router.post(
    "/:companySlug/form/:formSlug",
    formRateLimit,
    express.urlencoded({ extended: false, limit: "4kb" }),
    async (req, res, next) => {
      try {
        const companyId = res.locals[PUBLIC_COMPANY_LOCALS_KEY] as string;
        const formSlug = req.params.formSlug as string;

        const form = await forms.findPublic(companyId, formSlug);
        if (!form) throw notFound("Form not found");

        const raw = req.body;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("Invalid submission");

        // Honeypot: a filled hidden field means a bot. Answer like a success, store nothing.
        const honeypot = (raw as Record<string, unknown>)[FORM_HONEYPOT_FIELD];
        if (typeof honeypot === "string" && honeypot.trim() !== "") {
          res.status(201).json({ ok: true });
          return;
        }

        const parsed = buildLeadFormSubmissionSchema(form).safeParse(cleanSubmission(raw));
        if (!parsed.success) {
          throw badRequest("Invalid submission", parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })));
        }
        const submission = parsed.data as Record<string, unknown>;
        const email = normalizeEmail((submission.email as string | undefined) ?? null);
        const phone = normalizePhoneE164((submission.phone as string | undefined) ?? null);
        const identityKey = email ?? phone ?? "";

        // Without a client id the ref is stable for the same person and form within one minute.
        const minute = Math.floor(Date.now() / 60_000);
        const sourceRef = submission.clientId
          ? `client:${submission.clientId as string}`
          : `form:${createHash("sha256").update(`${formSlug}|${identityKey}|${minute}`).digest("hex").slice(0, 32)}`;

        await intake.ingest(companyId, {
          source: "form",
          sourceRef,
          payload: buildLeadFormPayload(form, submission, { email, phone }),
          identity: { email, phone },
          language: (submission.language as string | undefined) ?? null,
        });
        res.status(201).json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );
}
