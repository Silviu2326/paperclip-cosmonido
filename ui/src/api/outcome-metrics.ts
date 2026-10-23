import { outcomeMetricsSchema } from "@paperclipai/shared/productization/outcome-metrics";
import { api } from "./client";

export async function readOutcomeMetrics(companyId: string, days: number, signal?: AbortSignal) {
  const response = await api.get<unknown>(`/companies/${encodeURIComponent(companyId)}/productization/metrics?days=${days}`, { signal });
  const parsed = outcomeMetricsSchema.safeParse(response);
  if (!parsed.success) throw new Error("No se pudo interpretar el informe de resultados.");
  return parsed.data;
}
