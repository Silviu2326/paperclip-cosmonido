import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/i18n";
import { channelsApi, type ChannelAccount, type ChannelTestResult } from "@/api/channels";
import { secretsApi } from "@/api/secrets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function kapsoWebhookUrl(origin: string, companyId: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return `${url.origin}/api/webhooks/kapso/${encodeURIComponent(companyId)}`;
  } catch {
    return null;
  }
}

function KapsoConnectionTest({ accountId, onTested }: { accountId: string; onTested?(): unknown }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ChannelTestResult | null>(null);
  async function test() {
    setPending(true);
    setResult(null);
    try {
      setResult(await channelsApi.test(accountId));
      onTested?.();
    } catch (error) {
      setResult({ ok: false, status: null, detail: errorText(error) });
    } finally {
      setPending(false);
    }
  }
  return <div className="flex flex-col gap-2">
    <Button variant="outline" disabled={pending} onClick={() => void test()}>
      {t(pending ? "channelsKapso.testing" : result && !result.ok ? "channelsKapso.retryTest" : "channelsKapso.test")}
    </Button>
    {result && <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
      {t(result.ok ? "channelsKapso.testOk" : "channelsKapso.testFailed")}: {result.detail}
    </p>}
  </div>;
}

interface Props {
  companyId: string;
  accounts: ChannelAccount[];
  onRefresh(): unknown;
}

function KapsoAccount({ account, onRefresh }: { account: ChannelAccount; onRefresh(): unknown }) {
  const { t } = useTranslation();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function change(disconnect = false) {
    setPending(true);
    setError(null);
    try {
      if (disconnect) await channelsApi.remove(account.id);
      else await channelsApi.update(account.id, { status: account.status === "disabled" ? "active" : "disabled" });
      setDisconnectOpen(false);
      onRefresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }
  return <section className="flex flex-col gap-3 border-t pt-4" aria-label={account.label}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{account.label}</span>
      <Badge variant={account.status === "active" ? "default" : "outline"}>{t(`channelsKapso.status.${account.status}`)}</Badge>
    </div>
    <p className="break-all text-sm text-muted-foreground">{account.displayPhoneNumber || account.externalAccountId}</p>
    {account.lastTestError && <p className="text-sm text-destructive">{account.lastTestError}</p>}
    <div className="flex flex-wrap items-start gap-2">
      <KapsoConnectionTest accountId={account.id} onTested={onRefresh} />
      <Button variant="outline" disabled={pending} onClick={() => void change()}>{t(account.status === "disabled" ? "channelsKapso.resume" : "channelsKapso.pause")}</Button>
      <Button variant="ghost" disabled={pending} onClick={() => { setError(null); setDisconnectOpen(true); }}>{t("channelsKapso.disconnect")}</Button>
    </div>
    {error && !disconnectOpen && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <AlertDialog open={disconnectOpen} onOpenChange={(open) => { if (!pending) setDisconnectOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("channelsKapso.disconnectTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("channelsKapso.disconnectDescription", { label: account.label })}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <AlertDialogCancel disabled={pending}>{t("channelsKapso.cancel")}</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => void change(true)}>{t(pending ? "channelsKapso.disconnecting" : "channelsKapso.disconnect")}</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}

export function KapsoChannelCard({ companyId, accounts, onRefresh }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center gap-2"><CardTitle>{t("channelsKapso.title")}</CardTitle><Badge variant="secondary">{t("channelsKapso.recommended")}</Badge></div>
      <CardDescription>{t("channelsKapso.description")}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {!open && <div className="flex flex-col items-start gap-3">
        {accounts.length === 0 && <p className="text-sm text-muted-foreground">{t("channelsKapso.empty")}</p>}
        <Button onClick={() => setOpen(true)}>{t("channelsKapso.connect")}</Button>
      </div>}
      {open && <KapsoConnectionWizard companyId={companyId} onClose={() => { setOpen(false); onRefresh(); }} />}
      {accounts.map((account) => <KapsoAccount key={account.id} account={account} onRefresh={onRefresh} />)}
    </CardContent>
  </Card>;
}

type SavedSecret = { id: string; name: string; value: string };

export function KapsoConnectionWizard({ companyId, onClose }: { companyId: string; onClose(): void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [origin, setOrigin] = useState(window.location.origin);
  const [webhookSecret, setWebhookSecret] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("es");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");
  const savedSecrets = useRef<Partial<Record<"api" | "webhook", SavedSecret>>>({});
  const secretPrefix = useRef<string | null>(null);
  const webhookUrl = kapsoWebhookUrl(origin, companyId);

  // Reuse successfully stored secrets on retry if account creation fails.
  async function saveSecret(kind: "api" | "webhook", value: string) {
    const saved = savedSecrets.current[kind];
    if (saved) {
      if (saved.value !== value) {
        await secretsApi.rotate(saved.id, { value });
        saved.value = value;
      }
      return saved.name;
    }
    secretPrefix.current ??= `kapso_${crypto.randomUUID().replaceAll("-", "_")}`;
    const secret = await secretsApi.create(companyId, { name: `${secretPrefix.current}_${kind}`, value });
    savedSecrets.current[kind] = { id: secret.id, name: secret.name, value };
    return secret.name;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (step === 0 && (!apiKey.trim() || !/^\d+$/.test(phoneId.trim()) || phoneId.trim().length > 64)) {
      setError(t("channelsKapso.credentialsRequired"));
      return;
    }
    if (step === 1 && (!webhookUrl || !webhookSecret.trim())) {
      setError(t("channelsKapso.webhookRequired"));
      return;
    }
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    if (templateName.trim() && (!/^[a-z0-9_]+$/.test(templateName.trim()) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(templateLanguage.trim()))) {
      setError(t("channelsKapso.templateInvalid"));
      return;
    }
    setPending(true);
    try {
      const apiKeySecretName = await saveSecret("api", apiKey.trim());
      const webhookSecretName = await saveSecret("webhook", webhookSecret.trim());
      const account = await channelsApi.create(companyId, {
        provider: "kapso", kind: "whatsapp", label: displayPhone.trim() || t("channelsKapso.title"),
        externalAccountId: phoneId.trim(), apiKeySecretName, webhookSecretName,
        ...(displayPhone.trim() ? { displayPhoneNumber: displayPhone.trim() } : {}),
        approvedTemplates: templateName.trim() ? [{ name: templateName.trim(), language: templateLanguage.trim() }] : [],
      });
      setAccountId(account.id);
      setApiKey("");
      setWebhookSecret("");
      savedSecrets.current = {};
      setStep(3);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function copyUrl() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopyState("ok");
    } catch {
      setCopyState("error");
    }
  }

  return <div className="flex flex-col gap-4">
    <p className="text-sm font-medium" aria-live="polite">{t("channelsKapso.step", { current: step + 1, total: 4 })} · {t(`channelsKapso.steps.${step}`)}</p>
    {step === 3 && accountId ? <div className="flex flex-col gap-4">
      <p role="status" className="text-sm">{t("channelsKapso.saved")}</p>
      <p className="text-sm text-muted-foreground">{t("channelsKapso.testHint")}</p>
      <KapsoConnectionTest accountId={accountId} />
      <div className="flex justify-end"><Button onClick={onClose}>{t("channelsKapso.finish")}</Button></div>
    </div> : <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
        {step === 0 && <>
          <div className="flex flex-col gap-2"><Label htmlFor="kapso-api-key">{t("channelsKapso.apiKey")}</Label><Input id="kapso-api-key" type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="kapso-phone-id">{t("channelsKapso.phoneId")}</Label><Input id="kapso-phone-id" inputMode="numeric" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} required /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="kapso-display-phone">{t("channelsKapso.displayPhone")}</Label><Input id="kapso-display-phone" type="tel" value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} /></div>
          <p className="text-sm text-muted-foreground">{t("channelsKapso.secretsHint")}</p>
        </>}
        {step === 1 && <>
          <p className="text-sm text-muted-foreground">{t("channelsKapso.webhookHint")}</p>
          <div className="flex flex-col gap-2"><Label htmlFor="kapso-origin">{t("channelsKapso.publicOrigin")}</Label><Input id="kapso-origin" type="url" value={origin} onChange={(e) => { setOrigin(e.target.value); setCopyState("idle"); }} required /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="kapso-webhook-url">{t("channelsKapso.webhookUrl")}</Label><Input id="kapso-webhook-url" value={webhookUrl ?? ""} readOnly /><Button type="button" variant="outline" disabled={!webhookUrl} onClick={() => void copyUrl()}>{t("channelsKapso.copy")}</Button></div>
          {copyState !== "idle" && <p role={copyState === "ok" ? "status" : "alert"} className="text-sm">{t(copyState === "ok" ? "channelsKapso.copied" : "channelsKapso.copyFailed")}</p>}
          <div className="flex flex-col gap-2"><Label htmlFor="kapso-webhook-secret">{t("channelsKapso.webhookSecret")}</Label><Input id="kapso-webhook-secret" type="password" autoComplete="new-password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} required /></div>
        </>}
        {step === 2 && <>
          <p className="text-sm text-muted-foreground">{t("channelsKapso.templateHint")}</p>
          <div className="flex flex-col gap-2"><Label htmlFor="kapso-template-name">{t("channelsKapso.templateName")}</Label><Input id="kapso-template-name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="kapso-template-language">{t("channelsKapso.templateLanguage")}</Label><Input id="kapso-template-language" value={templateLanguage} onChange={(e) => setTemplateLanguage(e.target.value)} /></div>
        </>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t("channelsKapso.cancel")}</Button>
          {step > 0 && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setStep(step - 1); setError(null); }}>{t("channelsKapso.back")}</Button>}
        </div>
        <Button type="submit" disabled={pending}>{t(pending ? "channelsKapso.saving" : step === 2 ? "channelsKapso.save" : "channelsKapso.next")}</Button>
      </div>
    </form>}
  </div>;
}
