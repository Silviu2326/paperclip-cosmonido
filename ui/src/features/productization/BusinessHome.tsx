import { useCallback, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { customerPortfolioSchema } from "@paperclipai/shared/productization/customer-portfolio";
import type { OnboardingPath } from "@paperclipai/shared/productization/onboarding-journey";
import { requestResponse } from "@/api/client";
import { readApiJson } from "@/api/response";
import { useAccountIdentity } from "@/api/companies-query";
import { useTranslation } from "@/i18n";
import { Link, useSearchParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { OpportunityForecastPanel } from "@/components/crm/OpportunityForecastPanel";
import { OutcomeMetrics } from "@/pages/OutcomeMetrics";
import { parseOutcomePath, parseOutcomePeriod } from "@/lib/outcome-metrics-params";

type ConnectionHealth = { id: string; name: string; stage: "available" | "connected" | "authorized" | "checked"; checkedAt: string | null };
const fresh = async <T,>(path: string, options: { signal: AbortSignal }) => readApiJson<T>(await requestResponse(path, { signal: options.signal, cache: "no-store" }));

/** The saved company path selects an initial view, never fabricates outcome attribution. */
export function BusinessHome({ companyId }: { companyId: string }) {
  const identity = useAccountIdentity();
  if (!identity.settled || !identity.userId) return null;
  return <BusinessHomeForPrincipal key={`${companyId}:${identity.userId}`} companyId={companyId} userId={identity.userId} />;
}

function BusinessHomeForPrincipal({ companyId, userId }: { companyId: string; userId: string }) {
  const { t, i18n } = useTranslation();
  // Results block state lives in the URL (?results=1&path=…&days=…) so it can be linked, reloaded and navigated back to.
  const [searchParams, setSearchParams] = useSearchParams();
  const detailsOpen = searchParams.get("results") === "1";
  const setDetailsOpen = useCallback((open: boolean) => setSearchParams(current => {
    const next = new URLSearchParams(current);
    if (open) next.set("results", "1");
    else { next.delete("results"); next.delete("path"); next.delete("days"); }
    return next;
  }), [setSearchParams]);
  const selectMetrics = useCallback((selection: { path: string; days: number }) => setSearchParams(current => {
    const next = new URLSearchParams(current);
    next.set("path", selection.path);
    next.set("days", String(selection.days));
    return next;
  }), [setSearchParams]);
  const journey = useQuery({ queryKey:["business-home",companyId,userId,"journey"], queryFn:({signal})=>fresh<{path:OnboardingPath|null}>(`/companies/${companyId}/productization/home`,{signal}), retry:false });
  const health = useQuery({ queryKey:["business-home",companyId,userId,"connections"], queryFn:({signal})=>fresh<{connections:ConnectionHealth[]}>(`/companies/${companyId}/productization/builder/connections`, {signal}), retry:false });
  const savedPath = journey.data?.path;
  const urlPath = parseOutcomePath(searchParams.get("path"));
  const metricsDays = parseOutcomePeriod(searchParams.get("days")) ?? 30;
  const path = urlPath ?? savedPath;
  const portfolio = useInfiniteQuery({ queryKey:["business-home",companyId,userId,"portfolio"], initialPageParam:null as string|null,
    queryFn:({pageParam,signal})=>fresh<unknown>(`/companies/${companyId}/productization/customer-portfolio?days=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,{signal}).then(value=>customerPortfolioSchema.parse(value)),
    getNextPageParam: page=>page.nextCursor, enabled:detailsOpen && path==="agency", retry:false });
  const money = (cents:number|null) => cents===null ? t("businessHome.noCost",{defaultValue:"Sin coste valorado"}) : new Intl.NumberFormat(i18n.language,{style:"currency",currency:"USD"}).format(cents/100);
  const attention = health.data?.connections.filter(c=>c.stage!=="checked") ?? [];
  return <Card>
    <CardHeader><CardTitle>{t("businessHome.title",{defaultValue:"Tu negocio"})}</CardTitle><CardDescription>{t("businessHome.description",{defaultValue:"Resultados registrados, conexiones y resumen diario según tu puesta en marcha."})}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      {journey.error && <p role="alert" className="text-sm text-destructive">{t("businessHome.setupError",{defaultValue:"No se pudo cargar el camino de negocio."})} <Link className="underline" to="/productization">{t("businessHome.setup",{defaultValue:"Puesta en marcha"})}</Link></p>}
      {health.error && <p role="alert" className="text-sm text-destructive">{t("businessHome.healthError",{defaultValue:"No se pudo consultar el estado de las conexiones."})}</p>}
      {health.data && <div className="flex flex-wrap items-center gap-3"><Badge variant={attention.length ? "outline" : "secondary"}>{t("businessHome.checkedConnections",{defaultValue:"{{checked}} de {{total}} conexiones comprobadas recientemente",checked:health.data.connections.length-attention.length,total:health.data.connections.length})}</Badge><Link className="text-sm underline" to="/apps">{t("businessHome.openApps",{defaultValue:"Revisar conexiones"})}</Link>{attention.slice(0,3).map(c=><span key={c.id} className="text-sm text-muted-foreground">{c.name}</span>)}</div>}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild><Button variant="outline">{detailsOpen ? t("businessHome.hide",{defaultValue:"Ocultar resultados"}) : t("businessHome.show",{defaultValue:"Ver resultados"})}</Button></CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-6 pt-4">
          {detailsOpen && <>
            {path ? <OutcomeMetrics key={`${companyId}:${userId}`} initialPath={path} initialDays={metricsDays} onSelectionChange={selectMetrics} embedded /> : <p>{t("businessHome.choosePath",{defaultValue:"Elige un camino en Puesta en marcha para adaptar tus indicadores."})}</p>}
            {path==="commercial" && <OpportunityForecastPanel companyId={companyId} />}
            {path==="agency" && <section className="flex flex-col gap-3" aria-label={t("businessHome.portfolio",{defaultValue:"Cartera de clientes"})}>
              <h3 className="text-lg font-semibold">{t("businessHome.portfolio",{defaultValue:"Cartera de clientes"})}</h3>
              {portfolio.isLoading && <p role="status">{t("common.loading",{defaultValue:"Cargando…"})}</p>}
              {portfolio.error && <p role="alert" className="text-sm text-destructive">{portfolio.error.message}</p>}
              {portfolio.data?.pages.flatMap(page=>page.items).map(customer=><Card key={customer.customerId}><CardHeader><CardTitle><Link to={`/customers/${customer.customerId}`}>{customer.name}</Link></CardTitle><CardDescription>{customer.pendingReviews || customer.overdueCommitments ? t("businessHome.needsAttention",{defaultValue:"Revisión o compromiso pendiente"}) : customer.activeAssignments ? t("businessHome.workActive",{defaultValue:"Trabajo en curso"}) : t("businessHome.noWork",{defaultValue:"Sin trabajo abierto"})}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2"><p>{t("businessHome.customerCounts",{defaultValue:"{{work}} tareas con revisión activas · {{reviews}} revisiones · {{overdue}} compromisos vencidos",work:customer.activeAssignments,reviews:customer.pendingReviews,overdue:customer.overdueCommitments})}</p><p>{money(customer.currentCostCents)} · {t("businessHome.previous",{defaultValue:"Periodo anterior"})}: {money(customer.previousCostCents)}</p>{customer.unpricedEvents>0 && <p className="text-sm text-muted-foreground">{t("businessHome.unpriced",{defaultValue:"{{count}} eventos sin precio excluidos",count:customer.unpricedEvents})}</p>}</CardContent></Card>)}
              {portfolio.data?.pages[0]?.items.length===0 && <p>{t("businessHome.emptyPortfolio",{defaultValue:"No hay clientes activos. Añade un cliente para organizar su trabajo."})}</p>}
              {portfolio.data && <p className="text-sm text-muted-foreground">{t("businessHome.costCoverage",{defaultValue:"Coste USD atribuido directamente por proyecto o tarea con revisión. Excluye datos sin vínculo o precio; no representa margen ni facturación."})}</p>}
              {portfolio.hasNextPage && <Button variant="outline" onClick={()=>void portfolio.fetchNextPage()} disabled={portfolio.isFetchingNextPage}>{t("businessHome.more",{defaultValue:"Cargar más clientes"})}</Button>}
            </section>}
          </>}
        </CollapsibleContent>
      </Collapsible>
    </CardContent>
    <CardFooter className="flex flex-wrap gap-4"><Link className="text-sm underline" to="/company/settings/notifications">{t("businessHome.dailyBrief",{defaultValue:"Configurar resumen diario"})}</Link><Link className="text-sm underline" to="/productization">{t("businessHome.setup",{defaultValue:"Puesta en marcha"})}</Link></CardFooter>
  </Card>;
}

