import { z } from "zod";

export const qualificationCriteriaSchema = z.object({
  version: z.string().trim().min(1).max(80),
  criteria: z.array(z.object({
    key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(300),
    weight: z.number().min(0).max(100),
    description: z.string().trim().max(2_000).optional().nullable(),
  })).min(1).max(50),
  threshold: z.number().min(0).max(100).default(60),
});

export const leadQualifySchema = z.object({
  leadId: z.string().uuid(),
  /** The agent's assessment per criterion; the service scores against the criteria weights and records sources. */
  assessments: z.array(z.object({
    criterion: z.string().trim().min(1).max(80),
    met: z.boolean().nullable(),
    note: z.string().trim().max(2_000).optional().nullable(),
  })).min(1).max(50),
  sources: z.array(z.object({
    kind: z.enum(["enrichment", "conversation", "context", "agent"]),
    ref: z.string().trim().min(1).max(500),
    label: z.string().trim().max(300).optional().nullable(),
    url: z.string().trim().url().max(2_000).optional().nullable(),
  })).max(50).default([]),
  enrichment: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const leadEnrichSchema = z.object({
  /** A domain or an email address; the service derives the domain. */
  query: z.string().trim().min(3).max(320),
  leadId: z.string().uuid().optional().nullable(),
});

export type LeadQualifyInput = z.infer<typeof leadQualifySchema>;
export type LeadEnrichInput = z.infer<typeof leadEnrichSchema>;
