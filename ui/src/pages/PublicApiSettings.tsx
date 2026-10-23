import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BUSINESS_WEBHOOK_EVENTS, PUBLIC_API_SCOPES, type BusinessWebhookEventName, type PublicApiScope } from "@paperclipai/shared/productization/public-api";
import { productPublicApi } from "@/api/product-public-api";
import { useAccountIdentity } from "@/api/companies-query";
import { useCompany } from "@/context/CompanyContext";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SettingsScopeHeader } from "@/components/product-settings/SettingsScopeHeader";

export function PublicApiSettings() {
  const { t } = useTranslation();
  const identity = useAccountIdentity();
  const company = useCompany();
  if (!identity.settled) return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6"><p role="status">{t("uxSettings.developer.loadingSession", { defaultValue: "Loading session…" })}</p></main>;
  if (!identity.userId) return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6"><p role="status">{t("uxSettings.developer.signIn", { defaultValue: "Sign in to manage public API access." })}</p></main>;
  if (company.loading) return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6"><p role="status">{t("uxSettings.developer.loadingCompany", { defaultValue: "Loading company…" })}</p></main>;
  if (!company.selectedCompanyId || !company.selectedCompany) return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6"><p className="text-sm text-muted-foreground">{t("uxSettings.developer.selectCompany", { defaultValue: "Select an available company to manage its API access." })}</p></main>;
  return <PublicApiSettingsForScope key={`${identity.userId}:${company.selectedCompanyId}`} userId={identity.userId} companyId={company.selectedCompanyId} companyName={company.selectedCompany.name} />;
}

function PublicApiSettingsForScope({ userId, companyId, companyName }: { userId: string; companyId: string; companyName: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = useState("");
  const [scopes, setScopes] = useState<PublicApiScope[]>(["customers:read"]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [events, setEvents] = useState<BusinessWebhookEventName[]>(["lead.created"]);
  const [oneTimeSecret, setOneTimeSecret] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const keysKey = ["product-public-api-keys", userId, companyId] as const;
  const webhooksKey = ["business-webhooks", userId, companyId] as const;
  useEffect(() => () => {
    void queryClient.removeQueries({ queryKey: keysKey });
    void queryClient.removeQueries({ queryKey: webhooksKey });
  }, [queryClient, userId, companyId]);

  const keys = useQuery({ queryKey: keysKey, queryFn: () => productPublicApi.keys(companyId) });
  const webhooks = useQuery({ queryKey: webhooksKey, queryFn: () => productPublicApi.webhooks(companyId) });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keysKey });
    void queryClient.invalidateQueries({ queryKey: webhooksKey });
  };
  const createKey = useMutation({
    mutationFn: () => productPublicApi.createKey({ companyId, name: keyName, scopes, expiresInDays: 30 }),
    onSuccess: result => { setToken(result.token); setKeyName(""); setMessage(""); invalidate(); },
    onError: error => setMessage(error.message),
  });
  const revokeKey = useMutation({ mutationFn: (id: string) => productPublicApi.revokeKey(companyId, id), onSuccess: invalidate, onError: error => setMessage(error.message) });
  const createWebhook = useMutation({
    mutationFn: () => productPublicApi.createWebhook({ companyId, url: webhookUrl, events }),
    onSuccess: result => { setOneTimeSecret(result.signingSecret); setWebhookUrl(""); setMessage(""); invalidate(); },
    onError: error => setMessage(error.message),
  });
  const rotateWebhook = useMutation({
    mutationFn: (id: string) => productPublicApi.rotateWebhook(id),
    onSuccess: result => { setOneTimeSecret(result.signingSecret); setMessage(""); invalidate(); },
    onError: error => setMessage(error.message),
  });
  const revokeWebhook = useMutation({ mutationFn: (id: string) => productPublicApi.revokeWebhook(id), onSuccess: invalidate, onError: error => setMessage(error.message) });
  const endpoint = useMemo(() => typeof window === "undefined" ? "/api/v1" : `${window.location.origin}/api/v1`, []);
  const toggleScope = (scope: PublicApiScope, checked: boolean) => setScopes(current => checked ? [...new Set([...current, scope])] : current.filter(value => value !== scope));
  const toggleEvent = (event: BusinessWebhookEventName, checked: boolean) => setEvents(current => checked ? [...new Set([...current, event])] : current.filter(value => value !== event));

  return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6">
    <SettingsScopeHeader scope="company" scopeName={companyName} description={t("uxSettings.developer.scope", { defaultValue: "API keys and webhooks are created for this company only and use the public /api/v1 endpoint. They are not agent or chat connections; those are managed in Apps." })} links={[{ to: "/apps", label: t("uxSettings.developer.appsLink", { defaultValue: "Apps" }) }]} />
    <Card><CardHeader><CardTitle>{t("publicApi.title", { defaultValue: "Public API and webhooks" })}</CardTitle><CardDescription>{t("publicApi.description", { defaultValue: "Scoped, read-only access to this company’s business records, plus signed event notifications." })}</CardDescription></CardHeader><CardContent className="grid gap-3">
      <p className="text-sm text-muted-foreground">{companyName} · {endpoint}</p>
      <form className="grid gap-3 rounded-md border p-4" onSubmit={event => { event.preventDefault(); if (scopes.length) createKey.mutate(); }}><h2 className="font-medium">{t("publicApi.createKey", { defaultValue: "Create API key" })}</h2><Input aria-label={t("publicApi.keyName", { defaultValue: "Key name" })} value={keyName} onChange={event => setKeyName(event.target.value)} placeholder={t("publicApi.keyName", { defaultValue: "Key name" })}/><div className="grid gap-2 sm:grid-cols-2">{PUBLIC_API_SCOPES.map(scope => <label key={scope} className="flex items-center gap-2 text-sm"><Checkbox checked={scopes.includes(scope)} onCheckedChange={checked => toggleScope(scope, checked === true)}/>{scope}</label>)}</div><Button className="w-fit" disabled={!keyName.trim() || !scopes.length || createKey.isPending}>{t("publicApi.create", { defaultValue: "Create" })}</Button></form>
      {token && <div className="grid gap-2 rounded-md border p-4"><p className="text-sm font-medium">{t("publicApi.copyToken", { defaultValue: "Copy this token now. It will not be shown again." })}</p><Textarea readOnly value={token} aria-label={t("publicApi.keyToken", { defaultValue: "New API token" })}/><Button className="w-fit" variant="outline" onClick={() => void navigator.clipboard?.writeText(token)}>{t("publicApi.copy", { defaultValue: "Copy" })}</Button></div>}
      <section className="grid gap-2"><h2 className="font-medium">{t("publicApi.activeKeys", { defaultValue: "API keys" })}</h2>{keys.isLoading ? <p role="status">{t("common.loading", { defaultValue: "Loading…" })}</p> : keys.isError ? <p role="alert">{t("publicApi.keysError", { defaultValue: "Could not load API keys." })}</p> : keys.data?.length ? keys.data.map(key => <div key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div><p className="font-medium">{key.name}</p><p className="text-sm text-muted-foreground">{key.scopes.join(", ")} · {key.revokedAt ? t("publicApi.revoked", { defaultValue: "revoked" }) : key.expiresAt ? `${t("publicApi.expires", { defaultValue: "expires" })} ${new Date(key.expiresAt).toLocaleDateString()}` : t("publicApi.noExpiry", { defaultValue: "no expiry" })}</p></div>{!key.revokedAt && <Button size="sm" variant="outline" disabled={revokeKey.isPending} onClick={() => revokeKey.mutate(key.id)}>{t("publicApi.revoke", { defaultValue: "Revoke" })}</Button>}</div>) : <p className="text-sm text-muted-foreground">{t("publicApi.noKeys", { defaultValue: "No API keys for this company." })}</p>}</section>
      <form className="grid gap-3 rounded-md border p-4" onSubmit={event => { event.preventDefault(); if (events.length) createWebhook.mutate(); }}><h2 className="font-medium">{t("publicApi.createWebhook", { defaultValue: "Add business webhook" })}</h2><Input type="url" aria-label={t("publicApi.recipientUrl", { defaultValue: "HTTPS recipient URL" })} value={webhookUrl} onChange={event => setWebhookUrl(event.target.value)} placeholder="https://example.com/webhooks/paperclip"/><div className="grid gap-2 sm:grid-cols-2">{BUSINESS_WEBHOOK_EVENTS.map(event => <label key={event} className="flex items-center gap-2 text-sm"><Checkbox checked={events.includes(event)} onCheckedChange={checked => toggleEvent(event, checked === true)}/>{event}</label>)}</div><Button className="w-fit" disabled={!webhookUrl.trim() || !events.length || createWebhook.isPending}>{t("publicApi.addWebhook", { defaultValue: "Add webhook" })}</Button></form>
      {oneTimeSecret && <div className="grid gap-2 rounded-md border p-4"><p className="text-sm font-medium">{t("publicApi.copySecret", { defaultValue: "Save this signing secret now. It will not be shown again." })}</p><Textarea readOnly value={oneTimeSecret} aria-label={t("publicApi.signingSecret", { defaultValue: "Webhook signing secret" })}/><Button className="w-fit" variant="outline" onClick={() => void navigator.clipboard?.writeText(oneTimeSecret)}>{t("publicApi.copy", { defaultValue: "Copy" })}</Button></div>}
      <section className="grid gap-2"><h2 className="font-medium">{t("publicApi.webhooks", { defaultValue: "Business webhooks" })}</h2>{webhooks.isLoading ? <p role="status">{t("common.loading", { defaultValue: "Loading…" })}</p> : webhooks.isError ? <p role="alert">{t("publicApi.webhooksError", { defaultValue: "Could not load webhooks." })}</p> : webhooks.data?.length ? webhooks.data.map(hook => <div key={hook.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div className="min-w-0"><p className="truncate font-medium">{hook.url}</p><p className="text-sm text-muted-foreground">{hook.events.join(", ")} · {hook.status}{hook.lastError ? ` · ${hook.lastError}` : ""}</p></div>{hook.status !== "revoked" && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={rotateWebhook.isPending} onClick={() => rotateWebhook.mutate(hook.id)}>{t("publicApi.rotateSecret", { defaultValue: "Rotate secret" })}</Button><Button size="sm" variant="outline" disabled={revokeWebhook.isPending} onClick={() => revokeWebhook.mutate(hook.id)}>{t("publicApi.revoke", { defaultValue: "Revoke" })}</Button></div>}</div>) : <p className="text-sm text-muted-foreground">{t("publicApi.noWebhooks", { defaultValue: "No business webhooks for this company." })}</p>}</section>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    </CardContent></Card>
  </main>;
}

export default PublicApiSettings;
