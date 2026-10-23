import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountIdentity } from "@/api/companies-query";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToastActions } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";
import { SettingsScopeHeader } from "@/components/product-settings/SettingsScopeHeader";
import { crmSyncApi, type CrmSyncConnection, type CrmSyncDirection, type CrmSyncProvider, type CrmSyncProviderState, type CrmSyncToolNames } from "@/api/crm-sync";

type Draft = { connectionId: string; direction: CrmSyncDirection; primarySystem: "paperclip" | "external" | "manual"; toolNames: CrmSyncToolNames };
const providers: CrmSyncProvider[] = ["hubspot", "pipedrive"];
const mappingFields: Array<{ key: keyof CrmSyncToolNames }> = [
  { key: "listCustomer" }, { key: "createCustomer" }, { key: "updateCustomer" },
  { key: "listContact" }, { key: "createContact" }, { key: "updateContact" },
];

export function CrmSync() {
  const { t } = useTranslation();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const identity = useAccountIdentity();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const userId = identity.userId ?? "";
  const identityKey = `${userId}:${companyId}`;
  const [drafts, setDrafts] = useState<Partial<Record<CrmSyncProvider, Draft>>>({});
  const [externalIds, setExternalIds] = useState<Record<string, string>>({});
  const key = ["crm-sync", userId, companyId] as const;

  useEffect(() => { setBreadcrumbs([{ label: t("crmSync.title") }]); }, [setBreadcrumbs]);
  useEffect(() => { setDrafts({}); setExternalIds({}); }, [identityKey]);

  const statusQuery = useQuery({ queryKey: [...key, "status"], queryFn: () => crmSyncApi.status(companyId), enabled: Boolean(companyId && identity.settled && userId), retry: false });
  const attentionQuery = useQuery({ queryKey: [...key, "attention"], queryFn: () => crmSyncApi.attention(companyId), enabled: Boolean(companyId && identity.settled && userId), retry: false });
  const connectionQueries = useQueries({ queries: providers.map((provider) => ({
    queryKey: [...key, "connections", provider], queryFn: () => crmSyncApi.connections(companyId, provider),
    enabled: Boolean(companyId && identity.settled && userId), retry: false,
  })) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
  };
  const save = useMutation({
    mutationFn: (input: { provider: CrmSyncProvider; draft: Draft }) => {
      const toolNames = Object.fromEntries(Object.entries(input.draft.toolNames).filter(([, value]) => value?.trim()).map(([name, value]) => [name, value!.trim()])) as CrmSyncToolNames;
      return crmSyncApi.saveConfig(companyId, input.provider, { ...input.draft, toolNames, enabled: true });
    },
    onSuccess: () => { pushToast({ title: t("crmSync.configSaved"), tone: "success" }); refresh(); },
    onError: (error: Error) => pushToast({ title: t("crmSync.saveError"), body: error.message, tone: "error" }),
  });
  const start = useMutation({
    mutationFn: (provider: CrmSyncProvider) => crmSyncApi.start(companyId, provider),
    onSuccess: () => { pushToast({ title: t("crmSync.syncStarted"), tone: "success" }); refresh(); },
    onError: (error: Error) => pushToast({ title: t("crmSync.startError"), body: error.message, tone: "error" }),
  });
  const disconnect = useMutation({
    mutationFn: (provider: CrmSyncProvider) => crmSyncApi.disconnect(companyId, provider),
    onSuccess: () => { pushToast({ title: t("crmSync.syncDisconnected"), tone: "success" }); refresh(); },
    onError: (error: Error) => pushToast({ title: t("crmSync.disconnectError"), body: error.message, tone: "error" }),
  });
  const resume = useMutation({
    mutationFn: (jobId: string) => crmSyncApi.resume(companyId, jobId),
    onSuccess: () => { pushToast({ title: t("crmSync.jobResumed"), tone: "success" }); refresh(); },
    onError: (error: Error) => pushToast({ title: t("crmSync.resumeError"), body: error.message, tone: "error" }),
  });
  const resolve = useMutation({
    mutationFn: (input: { id: string; resolution: "keep_local" | "keep_external" | "retry_create" | "link_external"; externalId?: string }) => crmSyncApi.resolve(companyId, input.id, input),
    onSuccess: (result) => { pushToast({ title: result.resolved ? t("crmSync.resolved") : t("crmSync.resolving"), tone: result.resolved ? "success" : "info" }); refresh(); },
    onError: (error: Error) => pushToast({ title: t("crmSync.resolveError"), body: error.message, tone: "error" }),
  });

  const states = statusQuery.data?.providers ?? [];
  const stateFor = (provider: CrmSyncProvider) => states.find((state) => state.provider === provider);
  const connectionsFor = (provider: CrmSyncProvider): CrmSyncConnection[] => connectionQueries[providers.indexOf(provider)]?.data ?? [];
  const draftFor = (provider: CrmSyncProvider, state?: CrmSyncProviderState): Draft => drafts[provider] ?? {
    connectionId: state?.connection?.id ?? "",
    direction: state?.direction ?? "both",
    primarySystem: state?.primarySystem ?? "manual",
    toolNames: state?.toolNames ?? {},
  };
  const changeDraft = (provider: CrmSyncProvider, state: CrmSyncProviderState | undefined, update: Partial<Draft>) => {
    setDrafts((current) => { const base = current[provider] ?? draftFor(provider, state); return { ...current, [provider]: { ...base, ...update } }; });
  };

  if (identity.failed) return <div className="p-6 text-sm text-destructive">{t("crmSync.identityError")}</div>;
  if (!companyId || !identity.settled) return <div className="p-6 text-sm text-muted-foreground">{t("crmSync.loadingIdentity")}</div>;
  if (statusQuery.isLoading) return <div className="p-6 text-sm text-muted-foreground">{t("crmSync.loadingStatus")}</div>;
  if (statusQuery.error) return <div className="p-6 text-sm text-destructive">{t("crmSync.statusError")} {(statusQuery.error as Error).message}</div>;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <SettingsScopeHeader
        scope="apps"
        scopeName={selectedCompany?.name}
        backTarget="apps"
        description={t("uxSettings.crmSync.scope", { defaultValue: "CRM sync keeps this company's customers and contacts aligned with HubSpot or Pipedrive, using connections you create in Apps. It is not a customer chat channel and does not change agent chat connections." })}
      />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{t("crmSync.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("crmSync.description")}</p></div>
        <Button variant="outline" onClick={refresh}><RefreshCw />{t("crmSync.refresh")}</Button>
      </header>

      {providers.map((provider) => {
        const state = stateFor(provider);
        const draft = draftFor(provider, state);
        const connections = connectionsFor(provider);
        const activeOpenJob = state?.openJob;
        return (
          <Card key={provider}>
            <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{state?.label ?? provider}</CardTitle><Badge variant={state?.ready ? "default" : "secondary"}>{state?.ready ? t("crmSync.ready") : t("crmSync.needsSetup")}</Badge></div></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm">{t("crmSync.activeConnection")}
                  <NativeSelect value={draft.connectionId} onChange={(event) => changeDraft(provider, state, { connectionId: event.target.value })}>
                    <option value="">{t("crmSync.chooseConnection")}</option>{connections.map((connection) => <option key={connection.id} value={connection.id} disabled={connection.status !== "active" || !connection.enabled}>{connection.name} · {connection.status}</option>)}
                  </NativeSelect>
                  {connectionQueries[providers.indexOf(provider)]?.error ? <span className="text-xs text-destructive">{t("crmSync.connectionsError")} {(connectionQueries[providers.indexOf(provider)]?.error as Error).message}</span> : null}
                  {connections.length === 0 ? <span className="text-xs text-muted-foreground">{t("uxSettings.crmSync.connectInApps", { defaultValue: "Connect {{provider}} in Apps and come back here.", provider: state?.label ?? provider })}</span> : null}
                </label>
                <label className="flex flex-col gap-1.5 text-sm">{t("crmSync.direction")}
                  <NativeSelect value={draft.direction} onChange={(event) => changeDraft(provider, state, { direction: event.target.value as CrmSyncDirection })}>
                    <option value="import">{t("crmSync.import")}</option><option value="export">{t("crmSync.export")}</option><option value="both">{t("crmSync.both")}</option>
                  </NativeSelect>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">{t("crmSync.conflictOwner")}
                  <NativeSelect value={draft.primarySystem} onChange={(event) => changeDraft(provider, state, { primarySystem: event.target.value as Draft["primarySystem"] })}>
                    <option value="manual">{t("crmSync.manual")}</option><option value="paperclip">Paperclip</option><option value="external">CRM</option>
                  </NativeSelect>
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">{t("crmSync.toolsTitle")}</h3>
                <p className="text-xs text-muted-foreground">{t("crmSync.toolsDescription")}</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {mappingFields.map(({ key: mappingKey }) => (
                    <label key={mappingKey} className="flex flex-col gap-1.5 text-sm">{t(`crmSync.map.${mappingKey}`)}
                      <Input value={draft.toolNames[mappingKey] ?? ""} maxLength={120} onChange={(event) => changeDraft(provider, state, { toolNames: { ...draft.toolNames, [mappingKey]: event.target.value } })} placeholder={t("crmSync.toolNamePlaceholder")} />
                    </label>
                  ))}
                </div>
              </div>

              {state?.blockers.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{state.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => save.mutate({ provider, draft })} disabled={save.isPending || !draft.connectionId || !connections.some((item) => item.id === draft.connectionId && item.status === "active" && item.enabled)}>{t("crmSync.save")}</Button>
                {state?.enabled ? <Button variant="outline" onClick={() => disconnect.mutate(provider)} disabled={disconnect.isPending}>{t("crmSync.disconnect")}</Button> : null}
                <Button variant="outline" onClick={() => start.mutate(provider)} disabled={!state?.ready || Boolean(activeOpenJob) || start.isPending}>{t("crmSync.start")}</Button>
                {activeOpenJob ? <Button variant="outline" onClick={() => resume.mutate(activeOpenJob.id)} disabled={resume.isPending}>{t("crmSync.resume")}</Button> : null}
                {activeOpenJob ? <span className="text-sm text-muted-foreground">{t("uxSettings.crmSync.openJob", { defaultValue: "Job {{status}} · {{id}}", status: activeOpenJob.status, id: activeOpenJob.id })}</span> : null}
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <span>{t("crmSync.linked")}: {state?.links.linked ?? 0}</span><span>{t("crmSync.conflicts")}: {state?.links.conflict ?? 0}</span><span>{t("crmSync.uncertain")}: {state?.links.uncertain ?? 0}</span><span>{t("crmSync.errors")}: {state?.links.error ?? 0}</span>
                <span>{t("crmSync.lastJob")}: {state?.lastJob ? `${state.lastJob.status} · ${new Date(state.lastJob.createdAt).toLocaleString()}` : t("crmSync.noJobs")}</span>
                {state?.lastJob?.blockedReason ? <span className="text-destructive">{state.lastJob.blockedReason}</span> : null}
                {typeof state?.lastJob?.errors[0]?.message === "string" ? <span className="text-destructive">{state.lastJob.errors[0].message}</span> : null}
                <span>{t("crmSync.lastSuccessful")}: {state?.lastSuccessfulSyncAt ? new Date(state.lastSuccessfulSyncAt).toLocaleString() : t("crmSync.none")}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader><CardTitle>{t("crmSync.attention")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {attentionQuery.error ? <p className="text-sm text-destructive">{t("crmSync.attentionLoadError")} {(attentionQuery.error as Error).message}</p> : null}
          {attentionQuery.data?.length ? attentionQuery.data.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
              <span className="mr-auto text-sm">{item.provider} · {item.entityKind} · {item.status} · {item.localId}</span>
              {item.status === "conflict" ? <><Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: item.id, resolution: "keep_local" })} disabled={resolve.isPending}>{t("crmSync.keepLocal")}</Button><Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: item.id, resolution: "keep_external" })} disabled={resolve.isPending}>{t("crmSync.keepExternal")}</Button></> : null}
              {item.status === "uncertain" ? <><Input className="max-w-xs" value={externalIds[item.id] ?? ""} onChange={(event) => setExternalIds((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={t("crmSync.externalId")} /><Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: item.id, resolution: "link_external", externalId: externalIds[item.id] })} disabled={resolve.isPending || !externalIds[item.id]?.trim()}>{t("crmSync.linkId")}</Button><Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: item.id, resolution: "retry_create" })} disabled={resolve.isPending}>{t("crmSync.retryAfterCheck")}</Button></> : null}
            </div>
          )) : <p className="text-sm text-muted-foreground">{t("crmSync.noAttention")}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
