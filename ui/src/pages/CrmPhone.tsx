import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import type { CrmPhoneCall, CrmPhoneCallback } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { accessApi } from "@/api/access";
import { agentsApi } from "@/api/agents";
import { crmApi } from "@/api/crm";
import { crmPhoneApi } from "@/api/crm-phone";
import { queryKeys } from "@/lib/queryKeys";
import { buildCompanyUserLabelMap } from "@/lib/company-members";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";

const CALLBACK_LABELS: Record<CrmPhoneCallback["status"], string> = {
  awaiting_consent: "Falta consentimiento de llamada",
  awaiting_approval: "Pendiente de aprobación",
  pending: "Programada",
  dialing: "Llamando",
  dialed: "Marcada con recibo del proveedor",
  dial_unknown: "Resultado de llamada desconocido; no se reintenta",
  failed: "Llamada no completada",
  missed: "Ventana de llamada vencida",
  cancelled: "Cancelada",
};

const IDENTITY_LABELS: Record<CrmPhoneCall["identityState"], string> = {
  matched: "Contacto identificado",
  manual: "Contacto vinculado por una persona",
  ambiguous: "Varios contactos posibles",
  unresolved: "Llamante sin identificar",
};

const NOT_AVAILABLE_LABELS: Record<string, string> = {
  generated_summary: "Resumen generado: no disponible",
  caller_number: "Número del llamante: no disponible",
  recording: "Grabación: no disponible",
  transcript: "Transcripción: no disponible",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Absolute instant shown in the zone the callback was agreed in, plus the viewer's own zone when it differs. */
function formatScheduled(iso: string, timeZone: string) {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  const agreed = new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(date);
  const local = new Intl.DateTimeFormat(undefined, options).format(date);
  return agreed === local ? `${agreed} (${timeZone})` : `${agreed} (${timeZone}) · ${local} en tu zona`;
}

const formatInstant = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function CrmPhone() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState<Record<string, string>>({});

  useEffect(() => { setBreadcrumbs([{ label: t("nav.crmPhone", { defaultValue: "Teléfono" }) }]); }, [setBreadcrumbs, t]);

  const enabled = !!selectedCompanyId;
  const status = useQuery({ queryKey: ["crm-phone", "status", selectedCompanyId], queryFn: () => crmPhoneApi.status(selectedCompanyId!), enabled });
  const callbacks = useQuery({ queryKey: ["crm-phone", "callbacks", selectedCompanyId], queryFn: () => crmPhoneApi.callbacks(selectedCompanyId!), enabled });
  const calls = useQuery({ queryKey: ["crm-phone", "calls", selectedCompanyId], queryFn: () => crmPhoneApi.calls(selectedCompanyId!), enabled });
  const agents = useQuery({ queryKey: ["agents", selectedCompanyId], queryFn: () => agentsApi.list(selectedCompanyId!), enabled });
  const contacts = useQuery({ queryKey: ["crm-phone", "contacts", selectedCompanyId], queryFn: () => crmApi.contacts.list(selectedCompanyId!), enabled });
  // The directory is cached per company, so every user id resolves without one request per row.
  const directory = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId ?? ""),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled,
    staleTime: 5 * 60_000,
  });

  const userLabels = useMemo(() => buildCompanyUserLabelMap(directory.data?.users), [directory.data?.users]);
  const agentName = (id: string) => agents.data?.find((agent) => agent.id === id)?.name ?? id;
  const contactName = (id: string | null) => (id ? contacts.data?.items.find((contact) => contact.id === id)?.displayName ?? id : null);
  const userName = (id: string | null) => (id ? userLabels.get(id) ?? id : null);

  const refresh = () => Promise.all(
    ["status", "callbacks", "calls"].map((key) => queryClient.invalidateQueries({ queryKey: ["crm-phone", key, selectedCompanyId] })),
  );
  const sync = useMutation({ mutationFn: () => crmPhoneApi.sync(selectedCompanyId!), onSuccess: refresh });
  const approve = useMutation({ mutationFn: (id: string) => crmPhoneApi.approve(selectedCompanyId!, id), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: (id: string) => crmPhoneApi.cancel(selectedCompanyId!, id), onSuccess: refresh });
  const link = useMutation({
    mutationFn: (input: { callId: string; contactId: string }) => crmPhoneApi.linkContact(selectedCompanyId!, input.callId, input.contactId),
    onSuccess: refresh,
  });

  if (!selectedCompanyId) return <EmptyState icon={Phone} message={t("goals.selectOrg", { defaultValue: "Selecciona una empresa." })} />;
  if (status.isLoading || callbacks.isLoading || calls.isLoading) return <PageSkeleton variant="list" />;
  const loadError = status.error ?? callbacks.error ?? calls.error;
  if (loadError) return <p role="alert" className="text-sm text-destructive">{errorMessage(loadError)}</p>;

  const open = (callbacks.data ?? []).filter((item) => item.status !== "dialed" && item.status !== "cancelled");
  const mutationError = sync.error ?? approve.error ?? cancel.error ?? link.error;

  return (
    <div className="flex flex-col gap-4">
      {!status.data?.available && (
        <Card role="status">
          <CardContent className="flex flex-col gap-1 pt-4 text-sm">
            <span className="font-medium">{t("crmPhone.noConnector", { defaultValue: "No hay una línea telefónica configurada" })}</span>
            <span className="text-muted-foreground">{status.data?.reason}</span>
          </CardContent>
        </Card>
      )}
      {mutationError && <p role="alert" className="text-sm text-destructive">{errorMessage(mutationError)}</p>}

      <Card>
        <CardHeader><CardTitle>{t("crmPhone.callbacks", { defaultValue: "Devoluciones de llamada pendientes" })}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {open.length === 0 && <p className="text-sm text-muted-foreground">{t("crmPhone.noCallbacks", { defaultValue: "No hay devoluciones pendientes." })}</p>}
          {open.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{contactName(item.contactId)}</span>
                <Badge variant="secondary">{CALLBACK_LABELS[item.status]}</Badge>
              </div>
              <span>{formatScheduled(item.scheduledFor, item.timezone)}</span>
              <span className="text-muted-foreground">
                {item.reason} · {t("crmPhone.assignee", { defaultValue: "Asignada a" })} {agentName(item.assigneeAgentId)}
                {item.requestedByUserId ? ` · ${t("crmPhone.requestedBy", { defaultValue: "pedida por" })} ${userName(item.requestedByUserId)}` : ""}
              </span>
              <div className="flex gap-2">
                {item.status === "awaiting_approval" && (
                  <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(item.id)}>
                    {t("crmPhone.approve", { defaultValue: "Aprobar" })}
                  </Button>
                )}
                {["awaiting_consent", "awaiting_approval", "pending", "dialing"].includes(item.status) && (
                  <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(item.id)}>
                    {t("crmPhone.cancel", { defaultValue: "Cancelar" })}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("crmPhone.calls", { defaultValue: "Llamadas entrantes atendidas" })}</CardTitle>
          <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
            {t("crmPhone.sync", { defaultValue: "Actualizar informes" })}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(calls.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("crmPhone.noCalls", { defaultValue: "Aún no hay llamadas con informe." })}</p>}
          {(calls.data ?? []).map((call) => {
            const unresolved = call.identityState === "unresolved" || call.identityState === "ambiguous";
            const choice = linking[call.id] ?? "";
            return (
              <div key={call.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{formatInstant(call.startedAt)}</span>
                  <Badge variant="secondary">{IDENTITY_LABELS[call.identityState]}</Badge>
                  {call.contactId && <span>{contactName(call.contactId)}</span>}
                  {call.summary.provider.durationSeconds != null && <span className="text-muted-foreground">{call.summary.provider.durationSeconds} s</span>}
                </div>
                {call.summary.callerStatements.map((statement) => (
                  <p key={`${statement.at}-${statement.text}`}>
                    <span className="text-muted-foreground">{t("crmPhone.caller", { defaultValue: "Llamante (transcripción)" })}: </span>«{statement.text}»
                  </p>
                ))}
                {call.summary.agentStatements.map((statement) => (
                  <p key={`${statement.at}-${statement.text}`}>
                    <span className="text-muted-foreground">{t("crmPhone.agent", { defaultValue: "Agente de voz (transcripción)" })}: </span>«{statement.text}»
                  </p>
                ))}
                <p className="text-muted-foreground">{call.summary.notAvailable.map((key) => NOT_AVAILABLE_LABELS[key] ?? key).join(" · ")}</p>
                {unresolved && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={t("crmPhone.linkContact", { defaultValue: "Vincular a un contacto" })}
                      className="rounded-md border border-border bg-background p-2 text-sm"
                      value={choice}
                      onChange={(event) => setLinking((current) => ({ ...current, [call.id]: event.target.value }))}
                    >
                      <option value="">{t("crmPhone.chooseContact", { defaultValue: "Elegir contacto…" })}</option>
                      {(contacts.data?.items ?? []).map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
                    </select>
                    <Button size="sm" variant="outline" disabled={!choice || link.isPending} onClick={() => link.mutate({ callId: call.id, contactId: choice })}>
                      {t("crmPhone.link", { defaultValue: "Vincular" })}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
