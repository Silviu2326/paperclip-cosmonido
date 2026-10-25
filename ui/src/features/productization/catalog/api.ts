import { api } from "@/api/client";
import type { PortablePackage } from "@paperclipai/shared/productization/portable-package";
import { z } from "zod";

export interface PortableCatalogPreviewResponse {
  package: { packageKey: string; packageVersion: string; name: string; description: string };
  compatible: boolean;
  incompatibilities: string[];
  requirements: Array<{ key: string; version: string; status: "resolved" | "unavailable" }>;
  mapping: Array<{ teamId: string; memberId: string; slug: string; role: string; title: string; deploymentMode: "persistent" }>;
  omittedProfileCount: number;
  portabilityPreview: {
    warnings: string[];
    errors: string[];
    plan: { agentPlans: Array<{ slug: string; action: "create" | "update" | "skip"; plannedName: string }> };
  } | null;
}

const previewResponseSchema = z.object({
  package: z.object({ packageKey: z.string(), packageVersion: z.string(), name: z.string(), description: z.string() }).strict(),
  compatible: z.boolean(),
  incompatibilities: z.array(z.string()),
  requirements: z.array(z.object({ key: z.string(), version: z.string(), status: z.enum(["resolved", "unavailable"]) }).strict()),
  mapping: z.array(z.object({ teamId: z.string(), memberId: z.string(), slug: z.string(), role: z.string(), title: z.string(), deploymentMode: z.literal("persistent") }).strict()),
  omittedProfileCount: z.number().int().nonnegative(),
  portabilityPreview: z.object({
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    plan: z.object({ agentPlans: z.array(z.object({ slug: z.string(), action: z.enum(["create", "update", "skip"]), plannedName: z.string() })) }),
  }).passthrough().nullable(),
}).strict();

export function requestPortableCatalogPreview(companyId: string, payload: PortablePackage, signal: AbortSignal) {
  return api.post<unknown>(
    `/companies/${encodeURIComponent(companyId)}/productization/catalog/preview`,
    payload,
    { signal },
  ).then((response) => {
    const parsed = previewResponseSchema.safeParse(response);
    if (!parsed.success) throw new Error("El servidor devolvió una vista previa con formato no válido.");
    return parsed.data as PortableCatalogPreviewResponse;
  });
}
