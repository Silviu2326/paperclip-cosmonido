import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgreementPeriod, ServiceAgreement } from "@paperclipai/shared";
import { Link, useParams } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { serviceAgreementsApi, type ServiceAgreementUpdateInput } from "@/api/service-agreements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { RefreshCw, Repeat } from "lucide-react";
import { formatDate } from "@/lib/utils";

const periodKindLabels: Record<string, string> = { monthly: "Mensual", quarterly: "Trimestral", yearly: "Anual" };
const statusLabels: Record<string, string> = { active: "Activo", notice: "Aviso de renovación", renewed: "Renovado", ended: "Finalizado", cancelled: "Cancelado" };

/** Next calendar boundary of an agreement after `now`, computed from its start and period kind (UTC months). */
export function nextPeriodEnd(agreement: Pick<ServiceAgreement, "startsAt" | "periodKind" | "endsAt">, now: Date = new Date()): Date | null {
  const months = agreement.periodKind === "yearly" ? 12 : agreement.periodKind === "quarterly" ? 3 : 1;
  const end = agreement.endsAt ? new Date(agreement.endsAt) : null;
  let boundary = new Date(agreement.startsAt);
  for (let guard = 0; guard < 1200; guard += 1) {
    boundary = new Date(boundary.getTime());
    boundary.setUTCMonth(boundary.getUTCMonth() + months);
    if (end && boundary.getTime() > end.getTime()) return end;
    if (boundary.getTime() > now.getTime()) return boundary;
  }
  return end;
}

export function ServiceAgreements({ customerId }: { customerId?: string }) {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: t("uxCrm.services", { defaultValue: "Services" }), href: "/customers/services" }]); }, [setBreadcrumbs, t]);
  const query = useQuery({
    queryKey: ["service-agreements", selectedCompanyId],
    queryFn: () => serviceAgreementsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  if (!selectedCompanyId) return <EmptyState icon={Repeat} message={t("goals.selectOrg", { defaultValue: "Selecciona una empresa." })} />;
  if (query.isLoading) return <PageSkeleton variant="list" />;
  if (query.error) return <p role="alert" className="text-sm text-destructive">{query.error.message}</p>;
  const agreements = (query.data ?? []).filter((agreement) => !customerId || agreement.customerId === customerId);
  if (!agreements.length) {
    return <EmptyState icon={Repeat} message={customerId
      ? t("uxCrm.noCustomerServices", { defaultValue: "This customer has no services yet." })
      : t("serviceAgreements.empty", { defaultValue: "Aún no hay acuerdos de servicio." })} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {agreements.map((agreement) => {
        const next = nextPeriodEnd(agreement);
        return (
          <Card key={agreement.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-4">
                <Link to={`/customers/services/${agreement.id}`}>{agreement.title}</Link>
                <Badge variant="secondary">{t(`serviceAgreements.status.${agreement.status}`, { defaultValue: statusLabels[agreement.status] ?? agreement.status })}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span>{t("serviceAgreements.periodKind", { defaultValue: "Periodo" })}: {t(`serviceAgreements.kind.${agreement.periodKind}`, { defaultValue: periodKindLabels[agreement.periodKind] ?? agreement.periodKind })}</span>
              <span>{t("serviceAgreements.nextPeriodEnd", { defaultValue: "Próximo cierre" })}: {next ? formatDate(next) : "—"}</span>
              <span>{t("serviceAgreements.autoRenew", { defaultValue: "Renovación automática" })}: {agreement.autoRenew ? t("common.yes", { defaultValue: "Sí" }) : t("common.no", { defaultValue: "No" })}</span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ServiceAgreementDetail() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const qc = useQueryClient();
  const agreement = useQuery({ queryKey: ["service-agreement", id], queryFn: () => serviceAgreementsApi.get(id), enabled: !!id });
  const periods = useQuery({ queryKey: ["service-agreement-periods", id], queryFn: () => serviceAgreementsApi.periods(id), enabled: !!id });
  const tick = useMutation({
    mutationFn: () => serviceAgreementsApi.tick(selectedCompanyId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-agreement-periods", id] });
      qc.invalidateQueries({ queryKey: ["service-agreement", id] });
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("uxCrm.services", { defaultValue: "Services" }), href: "/customers/services" },
      { label: agreement.data?.title ?? "…" },
    ]);
  }, [setBreadcrumbs, t, agreement.data?.title]);

  if (agreement.isLoading) return <PageSkeleton variant="detail" />;
  if (agreement.error) return <p role="alert" className="text-sm text-destructive">{agreement.error.message}</p>;
  if (!agreement.data) return <EmptyState icon={Repeat} message={t("serviceAgreements.notFound", { defaultValue: "Acuerdo no encontrado." })} />;
  const data = agreement.data;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            {data.title}
            <Badge variant="secondary">{t(`serviceAgreements.status.${data.status}`, { defaultValue: statusLabels[data.status] ?? data.status })}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.customerId && (
            <p className="text-sm">
              <Link className="text-primary underline" to={`/customers/${data.customerId}`}>
                {t("uxCrm.openCustomer", { defaultValue: "Open customer" })}
              </Link>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => tick.mutate()} disabled={tick.isPending || !selectedCompanyId}>
              <RefreshCw data-icon="inline-start" />
              {t("serviceAgreements.runCycle", { defaultValue: "Ejecutar ciclo" })}
            </Button>
            <EditAgreementDialog agreement={data} onSaved={() => qc.invalidateQueries({ queryKey: ["service-agreement", id] })} />
          </div>
          {tick.data && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("serviceAgreements.cycleResult", { defaultValue: "Periodos iniciados: {{started}}. Renovaciones solicitadas: {{renewals}}.", started: tick.data.periodsStarted, renewals: tick.data.renewalsRequested })}
            </p>
          )}
          {tick.error && <p role="alert" className="text-sm text-destructive">{tick.error.message}</p>}
          <section className="flex flex-col gap-2">
            <h2 className="font-medium">{t("serviceAgreements.deliverables", { defaultValue: "Entregables por periodo" })}</h2>
            <ul className="flex flex-col gap-2">
              {data.deliverablesPerPeriod.map((item, index) => (
                <li key={`${item.title}-${index}`} className="text-sm">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted-foreground"> · {item.acceptanceCriteria}</span>
                </li>
              ))}
            </ul>
          </section>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("serviceAgreements.periods", { defaultValue: "Periodos" })}</CardTitle>
        </CardHeader>
        <CardContent>
          {periods.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Cargando…" })}</p>
          ) : periods.error ? (
            <p role="alert" className="text-sm text-destructive">{periods.error.message}</p>
          ) : !periods.data?.length ? (
            <p className="text-sm text-muted-foreground">{t("serviceAgreements.noPeriods", { defaultValue: "Aún no hay periodos." })}</p>
          ) : (
            <PeriodsTable periods={periods.data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PeriodsTable({ periods }: { periods: AgreementPeriod[] }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t("serviceAgreements.periodRange", { defaultValue: "Periodo" })}</th>
            <th className="py-2 pr-4 font-medium">{t("serviceAgreements.periodStatus", { defaultValue: "Estado" })}</th>
            <th className="py-2 pr-4 font-medium">{t("serviceAgreements.assignment", { defaultValue: "Encargo" })}</th>
            <th className="py-2 pr-4 font-medium">{t("serviceAgreements.renewalProposal", { defaultValue: "Propuesta de renovación" })}</th>
            <th className="py-2 font-medium">{t("serviceAgreements.renewalDecision", { defaultValue: "Decisión de renovación" })}</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id} className="border-t">
              <td className="py-2 pr-4">{formatDate(period.periodStart)} – {formatDate(period.periodEnd)}</td>
              <td className="py-2 pr-4">{period.status}</td>
              <td className="py-2 pr-4">
                {period.assignmentGoalId ? <Link to={`/assignments/${period.assignmentGoalId}`}>{t("serviceAgreements.openAssignment", { defaultValue: "Abrir encargo" })}</Link> : "—"}
              </td>
              <td className="py-2 pr-4 break-all">{period.renewalProposalId ?? "—"}</td>
              <td className="py-2 break-all">{period.renewalDecisionId ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditAgreementDialog({ agreement, onSaved }: { agreement: ServiceAgreement; onSaved: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(agreement.title);
  const [noticeDays, setNoticeDays] = useState(String(agreement.noticeDays));
  const [autoRenew, setAutoRenew] = useState(agreement.autoRenew ? "yes" : "no");
  const save = useMutation({
    mutationFn: (input: ServiceAgreementUpdateInput) => serviceAgreementsApi.update(agreement.id, input),
    onSuccess: () => { setOpen(false); onSaved(); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">{t("serviceAgreements.edit", { defaultValue: "Editar" })}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("serviceAgreements.edit", { defaultValue: "Editar acuerdo" })}</DialogTitle>
          <DialogDescription>{t("serviceAgreements.editDescription", { defaultValue: "Cambia el nombre, el aviso de renovación o la renovación automática." })}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const days = Number(noticeDays);
            if (!title.trim() || !Number.isInteger(days) || days < 0) return;
            save.mutate({ title: title.trim(), noticeDays: days, autoRenew: autoRenew === "yes" });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="agreement-title">{t("common.title", { defaultValue: "Título" })}</Label>
            <Input id="agreement-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={300} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="agreement-notice">{t("serviceAgreements.noticeDays", { defaultValue: "Días de aviso antes de vencer" })}</Label>
            <Input id="agreement-notice" type="number" min="0" max="365" step="1" value={noticeDays} onChange={(event) => setNoticeDays(event.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("serviceAgreements.autoRenew", { defaultValue: "Renovación automática" })}</Label>
            <Select value={autoRenew} onValueChange={setAutoRenew}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">{t("common.yes", { defaultValue: "Sí" })}</SelectItem>
                <SelectItem value="no">{t("common.no", { defaultValue: "No" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", { defaultValue: "Cancelar" })}</Button>
            <Button type="submit" disabled={save.isPending}>{t("common.save", { defaultValue: "Guardar" })}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
