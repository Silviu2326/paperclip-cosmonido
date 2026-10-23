import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MessageSquare } from "lucide-react";
import { webchatApi, type WebchatSettings as WebchatSettingsData } from "../api/webchat";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useAccountIdentity } from "@/api/companies-query";
import { SettingsScopeHeader } from "@/components/product-settings/SettingsScopeHeader";
import { ConversationDispatchSettings } from "@/features/productization/ConversationDispatchSettings";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EMPTY_SETTINGS: WebchatSettingsData = { active: false, greeting: null, brandColor: null };

export function WebchatSettings() {
  const { t } = useTranslation();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const identity = useAccountIdentity();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";

  const [draft, setDraft] = useState<WebchatSettingsData>(EMPTY_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: t("webchat.title") }]);
  }, [setBreadcrumbs, t]);

  const settingsQuery = useQuery({
    queryKey: ["webchat-settings", companyId],
    queryFn: () => webchatApi.getSettings(companyId),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(settingsQuery.data);
      setDirty(false);
    }
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: (value: WebchatSettingsData) => webchatApi.saveSettings(companyId, value),
    onSuccess: (saved) => {
      queryClient.setQueryData(["webchat-settings", companyId], saved);
      setDraft(saved);
      setDirty(false);
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={MessageSquare} message={t("webchat.selectCompany")} />;
  }
  if (settingsQuery.isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const brandColor = draft.brandColor ?? "";
  const colorValid = brandColor === "" || HEX_COLOR.test(brandColor);
  const snippet = `<script async src="${window.location.origin}/api/p/${selectedCompanyId}/widget.js"></script>`;

  function update(patch: Partial<WebchatSettingsData>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    setCopied(false);
  }

  function discard() {
    if (settingsQuery.data) setDraft(settingsQuery.data);
    setDirty(false);
  }

  function submit() {
    if (!colorValid) return;
    save.mutate({
      active: draft.active,
      greeting: draft.greeting?.trim() ? draft.greeting.trim() : null,
      brandColor: brandColor.trim() ? brandColor.trim() : null,
    });
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  const loadError = settingsQuery.error instanceof Error ? settingsQuery.error.message : null;
  const saveError = save.error instanceof Error ? save.error.message : null;

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsScopeHeader
        scope="apps"
        scopeName={selectedCompany?.name}
        backTarget="apps"
        description={t("uxSettings.webchat.scope", { defaultValue: "The web chat widget is how visitors of your website talk to this company. Its appearance, automatic replies and embed code are set here; other customer channels are in Channels." })}
        links={[{ to: "/apps/channels", label: t("uxSettings.webchat.channelsLink", { defaultValue: "Customer channels" }) }]}
      />
      <p className="text-sm text-muted-foreground">{t("webchat.description")}</p>
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      <section className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="webchat-active">{t("webchat.enabled")}</Label>
            <p className="text-sm text-muted-foreground">{t("webchat.enabledHelp")}</p>
          </div>
          <ToggleSwitch
            id="webchat-active"
            checked={draft.active}
            onCheckedChange={(active) => update({ active })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webchat-greeting">{t("webchat.greeting")}</Label>
          <Textarea
            id="webchat-greeting"
            rows={3}
            maxLength={300}
            value={draft.greeting ?? ""}
            placeholder={t("webchat.greetingPlaceholder")}
            onChange={(event) => update({ greeting: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">{t("webchat.greetingHelp")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="webchat-color">{t("webchat.brandColor")}</Label>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-7 w-7 shrink-0 rounded-md border border-border"
              style={colorValid && brandColor ? { backgroundColor: brandColor } : undefined}
            />
            <Input
              id="webchat-color"
              className="max-w-40"
              value={brandColor}
              placeholder={t("webchat.brandColorPlaceholder")}
              aria-invalid={!colorValid}
              onChange={(event) => update({ brandColor: event.target.value })}
            />
          </div>
          <p className={colorValid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
            {colorValid ? t("webchat.brandColorHelp") : t("webchat.brandColorInvalid")}
          </p>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="outline" onClick={discard} disabled={!dirty || save.isPending}>
          {t("webchat.discard")}
        </Button>
        <div className="flex items-center gap-3">
          {saveError && <span className="text-sm text-destructive">{saveError}</span>}
          {!dirty && save.isSuccess && <span className="text-sm text-muted-foreground">{t("webchat.saved")}</span>}
          <Button onClick={submit} disabled={!dirty || !colorValid || save.isPending}>
            {save.isPending ? t("webchat.saving") : t("webchat.save")}
          </Button>
        </div>
      </div>

      {identity.settled && identity.userId ? <ConversationDispatchSettings key={`${selectedCompanyId}:${identity.userId}`} companyId={selectedCompanyId} userId={identity.userId} webchatActive={draft.active} /> : <p role={identity.settled ? "alert" : "status"} className="text-sm text-muted-foreground">{identity.settled ? t("webchat.dispatchUserRequired", { defaultValue: "Sign in as a company user to configure automatic replies." }) : t("webchat.dispatchLoadingIdentity", { defaultValue: "Checking company user..." })}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("webchat.snippetTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("webchat.snippetHelp")}</p>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
          <code>{snippet}</code>
        </pre>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={copySnippet}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
            {copied ? t("webchat.copied") : t("webchat.copy")}
          </Button>
          {copyFailed && <span className="text-sm text-destructive">{t("webchat.copyFailed")}</span>}
        </div>
        {!draft.active && <p className="text-sm text-muted-foreground">{t("webchat.inactive")}</p>}
      </section>
    </div>
  );
}
