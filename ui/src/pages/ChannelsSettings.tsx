import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug, Plus, Unplug } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SettingsScopeHeader } from "@/components/product-settings/SettingsScopeHeader";
import { Link } from "@/lib/router";
import { SecretBindingPicker } from "@/components/SecretBindingPicker";
import { secretsApi } from "@/api/secrets";
import { queryKeys } from "@/lib/queryKeys";
import {
  channelsApi,
  type ApprovedTemplate,
  type ChannelAccount,
  type ChannelKind,
  type ChannelProvider,
  type CreateChannelAccountInput,
} from "../api/channels";

// Sprint 2 pistas D/E: customer channel accounts (WhatsApp, Messenger, Instagram, Telegram, SMS).
// Only secret names are entered here; the values stay in company secrets.

const KINDS_BY_PROVIDER: Record<ChannelProvider, ChannelKind[]> = {
  meta: ["whatsapp", "messenger", "instagram"],
  telegram: ["telegram"],
  twilio: ["sms"],
};

interface DraftState {
  provider: ChannelProvider;
  kind: ChannelKind;
  label: string;
  externalAccountId: string;
  providerAccountSid: string;
  verifySecretName: string;
  challengeSecretName: string;
  tokenSecretName: string;
  templates: string;
}

const EMPTY_DRAFT: DraftState = {
  provider: "meta",
  kind: "whatsapp",
  label: "",
  externalAccountId: "",
  providerAccountSid: "",
  verifySecretName: "",
  challengeSecretName: "",
  tokenSecretName: "",
  templates: "",
};

/** Parses "name|language" lines. Returns null when a line is malformed. */
function parseTemplates(text: string): ApprovedTemplate[] | null {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const parsed: ApprovedTemplate[] = [];
  for (const line of lines) {
    const [name, language] = line.split("|").map((part) => part.trim());
    if (!name || !language) return null;
    parsed.push({ name, language });
  }
  return parsed;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ChannelsSettings({ embedded = false, initialKind }: { embedded?: boolean; initialKind?: ChannelKind } = {}) {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(!!initialKind);
  const [draft, setDraft] = useState<DraftState>(() => initialKind ? {
    ...EMPTY_DRAFT, kind: initialKind,
    provider: initialKind === "telegram" ? "telegram" : initialKind === "sms" ? "twilio" : "meta",
  } : EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  useEffect(() => {
    if (!embedded) setBreadcrumbs([{ label: t("nav.settings") }, { label: t("channels.title") }]);
  }, [setBreadcrumbs, t, embedded]);

  const queryKey = ["customer-channels", selectedCompanyId] as const;
  const { data: accounts, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => channelsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const secrets = useQuery({
    queryKey: queryKeys.secrets.list(selectedCompanyId ?? ""),
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && showForm,
  });

  function secretField(field: "verifySecretName" | "challengeSecretName" | "tokenSecretName") {
    const secret = secrets.data?.find((item) => item.name === draft[field]);
    return <SecretBindingPicker
      label={t(`channels.fields.${field}`)}
      value={secret ? { secretId: secret.id } : null}
      allowVersionSelector={false}
      onChange={(_value, selected) => update(field, selected?.name ?? "")}
    />;
  }

  const createMutation = useMutation({
    mutationFn: (input: CreateChannelAccountInput) => channelsApi.create(selectedCompanyId!, input),
    onSuccess: () => {
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
      setFormError(null);
      void refresh();
    },
    onError: (err) => setFormError(errorText(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "disabled" }) => channelsApi.update(id, { status }),
    onSuccess: () => void refresh(),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => channelsApi.test(id),
    onSuccess: (result, id) => {
      setTestResults((current) => ({ ...current, [id]: { ok: result.ok, detail: result.detail } }));
      void refresh();
    },
    onError: (err, id) => setTestResults((current) => ({ ...current, [id]: { ok: false, detail: errorText(err) } })),
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Unplug} message={t("channels.selectCompany")} />;
  }
  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changeProvider(provider: ChannelProvider) {
    setDraft((current) => ({ ...current, provider, kind: KINDS_BY_PROVIDER[provider][0] }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const templates = parseTemplates(draft.templates);
    if (!templates) {
      setFormError(t("channels.errors.templateFormat"));
      return;
    }
    const isMeta = draft.provider === "meta";
    const isTwilio = draft.provider === "twilio";
    createMutation.mutate({
      provider: draft.provider,
      kind: draft.kind,
      label: draft.label.trim(),
      externalAccountId: draft.externalAccountId.trim(),
      providerAccountSid: isTwilio ? draft.providerAccountSid.trim() : null,
      verifySecretName: draft.verifySecretName.trim(),
      challengeSecretName: isMeta ? draft.challengeSecretName.trim() : null,
      tokenSecretName: draft.tokenSecretName.trim(),
      approvedTemplates: templates,
    });
  }

  return (
    <div className="space-y-6">
      {!embedded && <SettingsScopeHeader
        scope="apps"
        scopeName={selectedCompany?.name}
        backTarget="apps"
        description={t("uxSettings.channels.scope", { defaultValue: "These are the customer-facing accounts (WhatsApp, Messenger, Instagram, Telegram, SMS) this company uses to talk to customers. They are not the chat connections of your agents, which are managed in Apps." })}
        links={[{ to: "/apps/webchat", label: t("uxSettings.channels.webchatLink", { defaultValue: "Web chat widget" }) }]}
      />}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{t("channels.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("channels.description")}</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus />
            {t("channels.add")}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{t("channels.loadError")}: {errorText(error)}</p>}

      {showForm && (
        <Card className="p-4">
          <form className="space-y-4" onSubmit={submit}>
            <p className="text-sm text-muted-foreground">{t("channels.hints.prepareSecrets")} <Link className="underline" to="/company/settings/secrets" target="_blank">{t("channels.hints.openSecrets")}</Link></p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="channel-provider">{t("channels.fields.provider")}</Label>
                <NativeSelect id="channel-provider" value={draft.provider} onChange={(e) => changeProvider(e.target.value as ChannelProvider)}>
                  {(Object.keys(KINDS_BY_PROVIDER) as ChannelProvider[]).map((provider) => (
                    <option key={provider} value={provider}>{t(`channels.provider.${provider}`)}</option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="channel-kind">{t("channels.fields.kind")}</Label>
                <NativeSelect id="channel-kind" value={draft.kind} onChange={(e) => update("kind", e.target.value as ChannelKind)}>
                  {KINDS_BY_PROVIDER[draft.provider].map((kind) => (
                    <option key={kind} value={kind}>{t(`channels.kind.${kind}`)}</option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="channel-label">{t("channels.fields.label")}</Label>
                <Input id="channel-label" value={draft.label} onChange={(e) => update("label", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="channel-external">{t("channels.fields.externalAccountId")}</Label>
                <Input
                  id="channel-external"
                  value={draft.externalAccountId}
                  onChange={(e) => update("externalAccountId", e.target.value)}
                  placeholder={draft.provider === "twilio" ? "+34600000000" : ""}
                  required
                />
                <p className="text-xs text-muted-foreground">{t("channels.hints.externalAccountId")}</p>
              </div>
              {draft.provider === "twilio" && (
                <div className="space-y-1">
                  <Label htmlFor="channel-sid">{t("channels.fields.providerAccountSid")}</Label>
                  <Input id="channel-sid" value={draft.providerAccountSid} onChange={(e) => update("providerAccountSid", e.target.value)} required />
                </div>
              )}
              <div className="space-y-1">
                {secretField("verifySecretName")}
              </div>
              {draft.provider === "meta" && (
                <div className="space-y-1">
                  {secretField("challengeSecretName")}
                </div>
              )}
              <div className="space-y-1">
                {secretField("tokenSecretName")}
                <p className="text-xs text-muted-foreground">{t("channels.hints.secretNames")}</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="channel-templates">{t("channels.fields.approvedTemplates")}</Label>
              <Textarea id="channel-templates" rows={3} value={draft.templates} onChange={(e) => update("templates", e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("channels.hints.templates")}</p>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex items-center justify-between gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setFormError(null); }}>
                {t("channels.cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !draft.verifySecretName || !draft.tokenSecretName || (draft.provider === "meta" && !draft.challengeSecretName)}>
                {createMutation.isPending ? t("channels.saving") : t("channels.save")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {accounts && accounts.length === 0 && !showForm && (
        <EmptyState icon={Plug} message={t("channels.empty")} />
      )}

      <div className="space-y-3">
        {(accounts ?? []).map((account: ChannelAccount) => {
          const result = testResults[account.id];
          return (
            <Card key={account.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{account.label}</span>
                  <Badge variant="secondary">{t(`channels.kind.${account.kind}`)}</Badge>
                  <Badge variant={account.status === "active" ? "default" : "outline"}>
                    {t(`channels.status.${account.status}`)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(`channels.provider.${account.provider}`)} · {account.externalAccountId}
                </p>
                {account.lastTestedAt && (
                  <p className="text-xs text-muted-foreground">
                    {t("channels.lastTested", { date: new Date(account.lastTestedAt).toLocaleString() })}
                  </p>
                )}
                {account.lastTestError && <p className="text-xs text-destructive">{account.lastTestError}</p>}
                {result && (
                  <p className={result.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
                    {result.ok ? t("channels.testOk") : t("channels.testFailed")}: {result.detail}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testMutation.isPending && testMutation.variables === account.id}
                  onClick={() => testMutation.mutate(account.id)}
                >
                  {testMutation.isPending && testMutation.variables === account.id ? t("channels.testing") : t("channels.test")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ id: account.id, status: account.status === "disabled" ? "active" : "disabled" })}
                >
                  {account.status === "disabled" ? t("channels.enable") : t("channels.disable")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
