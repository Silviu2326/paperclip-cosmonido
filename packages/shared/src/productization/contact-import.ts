import { z } from "zod";

export const CONTACT_IMPORT_MAX_BYTES = 128 * 1024;
export const CONTACT_IMPORT_MAX_ROWS = 100;
export const contactImportMappingSchema = z.object({ displayName: z.string().trim().min(1).max(200), email: z.string().trim().max(200), phone: z.string().trim().max(200), language: z.string().trim().max(200) }).strict();
export type ContactImportMapping = z.infer<typeof contactImportMappingSchema>;
export const contactImportPreviewInputSchema = z.object({ csv: z.string().min(1).max(CONTACT_IMPORT_MAX_BYTES), mapping: contactImportMappingSchema.optional() }).strict();
export const contactImportCommitInputSchema = contactImportPreviewInputSchema.extend({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: z.string().uuid(),
}).strict();
export const contactImportRowSchema = z.object({
  row: z.number().int(), displayName: z.string(), email: z.string().nullable(), phone: z.string().nullable(),
  language: z.string().nullable(), status: z.enum(["create", "existing", "duplicate_in_file", "invalid"]),
  existingContactId: z.string().uuid().nullable(), reason: z.string().nullable(),
});
export const contactImportPreviewSchema = z.object({
  companyId: z.string().uuid(), previewHash: z.string(), rows: z.array(contactImportRowSchema),
  counts: z.object({ create: z.number().int(), existing: z.number().int(), duplicate_in_file: z.number().int(), invalid: z.number().int() }),
});
export const contactImportReceiptSchema = z.object({
  id: z.string().uuid(), companyId: z.string().uuid(), created: z.array(z.string().uuid()),
  skippedExisting: z.number().int(), skippedInFile: z.number().int(), completedAt: z.string().datetime(),
});
export type ContactImportPreview = z.infer<typeof contactImportPreviewSchema>;
export type ContactImportReceipt = z.infer<typeof contactImportReceiptSchema>;
