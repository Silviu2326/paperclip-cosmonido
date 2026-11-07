import { z } from "zod";

const localIds = z.array(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)).max(500);
export const publicCatalogSelectionSchema = z.object({
  teamMembers: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/)).max(500),
  skills: localIds, playbooks: localIds, requestTemplates: localIds, brandPresets: localIds,
  forms: localIds, meetingTypes: localIds, connectionRequests: z.array(z.number().int().min(0).max(29)).max(30),
}).strict();
export type PublicCatalogSelection = z.infer<typeof publicCatalogSelectionSchema>;

export const publicCatalogRequestSchema = z.object({ packageId: z.string().uuid(), selection: publicCatalogSelectionSchema, attested: z.literal(true) }).strict();
export const publicCatalogDecisionSchema = z.object({ expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(1000).optional() }).strict();
export const publicCatalogRatingSchema = z.object({ listingId: z.string().uuid(), installationId: z.string().uuid(), rating: z.number().int().min(1).max(5), review: z.string().trim().max(2000).optional() }).strict();

export interface PublicCatalogEntry {
  id: string; packageKey: string; packageVersion: string; name: string; description: string;
  contentHash: string; package: unknown; ratingCount: number; averageRating: number | null; installationCount: number;
  createdAt: string;
}
