import { useEffect, useState } from "react";
import { OUTCOME_PERIODS } from "@/lib/outcome-metrics-params";
import { useQuery } from "@tanstack/react-query";
import { readOutcomeMetrics } from "@/api/outcome-metrics";
import { useCompany } from "@/context/CompanyContext";
import { useAccountIdentity } from "@/api/companies-query";
import type { OnboardingPath } from "@paperclipai/shared/productization/onboarding-journey";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LABELS: Record<string, string> = {
  assignments: "Encargos creados", accepted: "Encargos aceptados", acceptance_ms: "Tiempo medio hasta aceptación",
  corrections: "Solicitudes de corrección", leads: "Leads recibidos", converted: "Leads convertidos",
  meetings: "Reuniones confirmadas", won: "Oportunidades ganadas", unattributed_cost_events: "Costes sin objetivo directo",
  cost_per_priced_result: "Coste directo medio del resultado valorado",
};
const PATH_METRICS: Record<string, string[]> = {
  entrepreneur: ["assignments", "accepted", "acceptance_ms", "cost_per_priced_result", "unattributed_cost_events"],
  agency: ["assignments", "accepted", "acceptance_ms", "corrections", "cost_per_priced_result", "unattributed_cost_events"],
  commercial: ["leads", "converted", "meetings", "won"],
};

/**
 * Selection comes from the caller (the URL on Home), so path and period survive reload and
 * back/forward. Without `onSelectionChange` it keeps its own state, as before.
 */
export function OutcomeMetrics({ initialPath = "entrepreneur", initialDays = 30, embedded = false, onSelectionChange }: {
  initialPath?: OnboardingPath;
  initialDays?: number;
  embedded?: boolean;
  onSelectionChange?: (selection: { path: OnboardingPath; days: number }) => void;
} = {}) {
  const { selectedCompanyId } = useCompany();
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState(initialDays);
  const identity = useAccountIdentity();
  const [path, setPath] = useState(initialPath);
  useEffect(() => setPath(initialPath), [initialPath]);
  useEffect(() => setDays(initialDays), [initialDays]);
  function select(next: { path?: OnboardingPath; days?: number }) {
    const selection = { path: next.path ?? path, days: next.days ?? days };
    setPath(selection.path);
    setDays(selection.days);
    onSelectionChange?.(selection);
  }
  const report = useQuery({
    queryKey: ["productization", "metrics", selectedCompanyId, identity.userId, days],
    queryFn: ({ signal }) => readOutcomeMetrics(selectedCompanyId!, days, signal),
    enabled: identity.settled && Boolean(selectedCompanyId && identity.userId), retry: false,
  });
  function display(value: number | null, unit: string) {
    if (value === null) return t("productMetrics.noSample", { defaultValue: "Sin muestra" });
    if (unit === "usd_cents") return new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" }).format(value / 100);
    if (unit === "milliseconds") return `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value / 3_600_000)} h`;
    return new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(value);
  }
  if (!selectedCompanyId) return <p>{t("productization.chooseCompany", { defaultValue: "Selecciona una empresa para continuar." })}</p>;
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        {embedded ? <h2 className="text-xl font-semibold">{t("productMetrics.title", { defaultValue: "Resultados del negocio" })}</h2> : <h1 className="text-2xl font-semibold">{t("productMetrics.title", { defaultValue: "Resultados del negocio" })}</h1>}
        <p className="text-sm text-muted-foreground">{t("productMetrics.description", { defaultValue: "Datos registrados en esta empresa, comparados con el periodo anterior de igual duración." })}</p>
      </header>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2"><Label htmlFor="metrics-path">{t("productMetrics.path", { defaultValue: "Camino" })}</Label>
          <Select value={path} onValueChange={value => select({ path: value as OnboardingPath })}><SelectTrigger id="metrics-path"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
            <SelectItem value="entrepreneur">{t("productization.paths.entrepreneur", { defaultValue: "Emprendedor" })}</SelectItem>
            <SelectItem value="agency">{t("productization.paths.agency", { defaultValue: "Agencia" })}</SelectItem>
            <SelectItem value="commercial">{t("productization.paths.commercial", { defaultValue: "Comercial" })}</SelectItem>
          </SelectGroup></SelectContent></Select>
        </div>
        <div className="flex flex-col gap-2"><Label htmlFor="metrics-period">{t("productMetrics.period", { defaultValue: "Periodo" })}</Label>
          <Select value={String(days)} onValueChange={value => select({ days: Number(value) })}><SelectTrigger id="metrics-period"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
            {OUTCOME_PERIODS.map(day => <SelectItem key={day} value={String(day)}>{t("productMetrics.days", { defaultValue: "Últimos {{days}} días", days: day })}</SelectItem>)}
          </SelectGroup></SelectContent></Select>
        </div>
        <Button variant="outline" onClick={() => void report.refetch()} disabled={report.isFetching}>{t("common.refresh", { defaultValue: "Actualizar" })}</Button>
      </div>
      {report.isLoading && <p role="status">{t("common.loading", { defaultValue: "Cargando…" })}</p>}
      {report.error && <p role="alert" className="text-sm text-destructive">{report.error.message}</p>}
      {report.data && <>
        <p className="text-sm text-muted-foreground">{new Date(report.data.current.from).toLocaleString(i18n.language, { timeZone: "UTC" })} — {new Date(report.data.current.to).toLocaleString(i18n.language, { timeZone: "UTC" })} (UTC)</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {report.data.metrics.filter(metric => PATH_METRICS[path]?.includes(metric.key)).map(metric => <Card key={metric.key}>
            <CardHeader><CardTitle>{t(`productMetrics.labels.${metric.key}`, { defaultValue: LABELS[metric.key] ?? metric.key })}</CardTitle><CardDescription>{metric.coverage}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-2xl font-semibold">{display(metric.current, metric.unit)}</p>
              <p className="text-sm text-muted-foreground">{t("productMetrics.previous", { defaultValue: "Periodo anterior" })}: {display(metric.previous, metric.unit)}</p>
              <details className="text-sm"><summary>{t("productMetrics.source", { defaultValue: "Fuente y cobertura" })}</summary><p className="mt-2 break-words text-muted-foreground">{metric.source}</p></details>
            </CardContent>
          </Card>)}
        </div>
        <p className="text-sm text-muted-foreground">{t("productMetrics.limits", { defaultValue: "La selección del camino cambia los indicadores mostrados; no filtra ni atribuye los registros a un piloto. No se infieren cobros, asistencia, entregas a tiempo o previsiones sin evidencia." })}</p>
      </>}
      <div className="flex flex-wrap gap-4 text-sm"><Link className="text-primary underline" to="/costs">{t("productMetrics.openCosts", { defaultValue: "Ver informe de costes" })}</Link><Link className="text-primary underline" to="/assignments">{t("productMetrics.openAssignments", { defaultValue: "Ver encargos" })}</Link></div>
    </section>
  );
}
