import { z } from "zod";

export const agencyClientProvisionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(""),
  sourceCompanyId: z.string().uuid(),
  sourcePackageId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  attestPublishedPackage: z.literal(true),
}).strict();
export const agencyClientAccessSchema = z.object({ userId: z.string().trim().min(1).max(200) }).strict();
export const agencyBrandSchema = z.object({
  publicEnabled: z.boolean(), displayName: z.string().trim().min(1).max(120),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logoAssetId: z.string().uuid().nullable(), requestedDomain: z.string().trim().max(253).nullable(),
}).strict();
export type AgencyClientProvision = z.infer<typeof agencyClientProvisionSchema>;
export type AgencyBrand = z.infer<typeof agencyBrandSchema>;
export interface AgencyOperation {
  id: string; companyId: string; status: "creating" | "awaiting_capacity" | "package_ready" | "ready" | "uncertain";
  companyName: string; packageId: string | null; packageVersion: string | null;
}
export interface AgencyPortfolio {
  accountId: string; period: { start: string; end: string }; companies: Array<{ companyId: string; name: string; status: string; costCents: number; source: "cost_events" }>;
  aggregate: { costCents: number; costSource: "cost_events"; billingSource: "product_account"; invoicesByCompany: "unavailable" };
}
