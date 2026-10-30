import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { channelsApi, type ChannelKind } from "@/api/channels";
import { webchatApi } from "@/api/webchat";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/PageSkeleton";
import { CopyText } from "@/components/CopyText";

const ChannelsSettings = lazy(() => import("@/pages/ChannelsSettings").then((module) => ({ default: module.ChannelsSettings })));
const WebchatSettings = lazy(() => import("@/pages/WebchatSettings").then((module) => ({ default: module.WebchatSettings })));
const CHANNELS = ["webchat", "email", "whatsapp", "messenger", "instagram", "telegram", "sms"] as const;
type SetupChannel = typeof CHANNELS[number];
type ConnectionState = "enabled" | "verified" | "pending" | "attention" | "disconnected" | "loading" | "unavailable";

/** Setup survives navigation/reload through the existing company-scoped settings. */
export function ConversationSetup({ companyId }: { companyId: string }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<SetupChannel | null>(null);
  const [preview, setPreview] = useState(false);
  const setupSection = useRef<HTMLElement>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!selected) return;
    setupSection.current?.focus({ preventScroll: true });
    setupSection.current?.scrollIntoView({ block: "start" });
  }, [selected]);
  useEffect(() => {
    if (preview) previewFrame.current?.scrollIntoView({ block: "center" });
  }, [preview]);
  const channels = useQuery({ queryKey: ["customer-channels", companyId], queryFn: () => channelsApi.list(companyId) });
  const webchat = useQuery({ queryKey: ["webchat-settings", companyId], queryFn: () => webchatApi.getSettings(companyId) });
  const email = useQuery({ queryKey: ["chat-endpoints", companyId], queryFn: () => chatEndpointsApi.list(companyId) });

  function state(channel: SetupChannel): ConnectionState {
    const source = channel === "webchat" ? webchat : channel === "email" ? email : channels;
    if (source.isPending) return "loading";
    if (source.isError) return "unavailable";
    if (channel === "webchat") return webchat.data?.active ? "enabled" : "disconnected";
    if (channel === "email") {
      const endpoints = email.data?.filter((endpoint) => endpoint.provider === "agentmail" && !["archived", "revoked"].includes(endpoint.status)) ?? [];
      if (endpoints.some((endpoint) => endpoint.status === "active")) return "enabled";
      return endpoints.length ? "pending" : "disconnected";
    }
    const accounts = channels.data?.filter((account) => account.kind === channel) ?? [];
    if (accounts.some((account) => account.status === "active" && account.lastTestedAt && !account.lastTestError)) return "verified";
    if (accounts.some((account) => account.lastTestError)) return "attention";
    return accounts.length ? "pending" : "disconnected";
  }

  const connected = CHANNELS.some((channel) => ["enabled", "verified"].includes(state(channel)));
  const open = expanded ?? !connected;
  const failed = channels.isError || webchat.isError || email.isError;
  const selectedAccounts = channels.data?.filter((account) => account.kind === selected) ?? [];
  // Only trusted, locally constructed values enter this document. The iframe runs the
  // real public widget, with anonymous sessions and no board credentials in requests.
  const widgetUrl = new URL(`/api/p/${encodeURIComponent(companyId)}/widget.js`, window.location.origin).href;
  const previewDocument = `<!doctype html><html lang="${i18n.language.startsWith("es") ? "es" : "en"}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><script src="${widgetUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"></script></body></html>`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(connected ? "conversations.setup.manageTitle" : "conversations.setup.title")}</CardTitle>
        <CardDescription>{t("conversations.setup.description")}</CardDescription>
      </CardHeader>
      {open && <CardContent className="flex flex-col gap-4">
        {failed && <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">{t("conversations.setup.loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => {
            if (channels.isError) void channels.refetch();
            if (webchat.isError) void webchat.refetch();
            if (email.isError) void email.refetch();
          }}>{t("conversations.setup.retry")}</Button>
        </div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CHANNELS.map((channel) => {
            const status = state(channel);
            return <Card key={channel}>
              <CardHeader>
                <CardTitle>{t(`conversations.channel.${channel}`)}</CardTitle>
                <CardDescription>{t(`conversations.setup.hint.${channel}`)}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto"><Badge variant={status === "attention" ? "destructive" : "outline"}>{t(`conversations.setup.state.${status}`)}</Badge></CardContent>
              <CardFooter>
                <Button variant="outline" aria-pressed={selected === channel} disabled={status === "loading" || status === "unavailable"} onClick={() => { setSelected(channel); setExpanded(true); setPreview(false); }}>
                  {t(status === "disconnected" ? "conversations.setup.connect" : "conversations.setup.configure", { channel: t(`conversations.channel.${channel}`) })}
                </Button>
              </CardFooter>
            </Card>;
          })}
        </div>
        {selected && <section ref={setupSection} tabIndex={-1} className="flex flex-col gap-4" aria-label={t("conversations.setup.configure", { channel: t(`conversations.channel.${selected}`) })}>
          <Suspense fallback={<PageSkeleton variant="list" />}>
            {selected === "webchat" ? <WebchatSettings embedded /> : selected === "email" ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">{t("conversations.setup.emailHelp")}</p>
                {(email.data ?? []).filter((endpoint) => endpoint.provider === "agentmail" && !["archived", "revoked"].includes(endpoint.status)).map((endpoint) => (
                  <Button key={endpoint.id} variant="outline" asChild><Link to={`/apps/chat/${endpoint.id}/settings`}>{endpoint.providerAccountLabel || endpoint.botLabel || t("conversations.setup.emailAccount")}</Link></Button>
                ))}
                <Button asChild><Link to="/apps/chat/connect?provider=agentmail&purpose=chat">{t("conversations.setup.connect", { channel: t("conversations.channel.email") })}</Link></Button>
              </div>
            ) : <ChannelsSettings key={selected} embedded initialKind={selectedAccounts.length ? undefined : selected as ChannelKind} />}
          </Suspense>
          {selected === "webchat" && webchat.data?.active && <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">{t("conversations.setup.testHelp")}</p>
            <Button variant="outline" onClick={() => setPreview((value) => !value)}>{t(preview ? "conversations.setup.closeTest" : "conversations.setup.openTest")}</Button>
            {preview && <iframe ref={previewFrame} title={t("conversations.setup.testTitle")} className="w-full shrink-0 h-(--conversation-preview-height) rounded-md border border-border" srcDoc={previewDocument} />}
          </div>}
          {selected !== "webchat" && selected !== "email" && <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t("conversations.setup.providerTestHelp")}</p>
            <CopyText containerClassName="max-w-full" className="break-all text-left text-sm font-mono" text={`${window.location.origin}/api/webhooks/${selected === "telegram" ? "telegram" : selected === "sms" ? "twilio" : "meta"}/${encodeURIComponent(companyId)}`} />
            <p className="text-sm text-muted-foreground">{t(`conversations.setup.webhook.${selected === "telegram" ? "telegram" : selected === "sms" ? "twilio" : "meta"}`)}</p>
          </div>}
        </section>}
        <p className="text-sm text-muted-foreground">{t("conversations.setup.receiveHelp")}</p>
      </CardContent>}
      <CardFooter className="justify-between gap-3">
        <Button variant="ghost" onClick={() => setExpanded(!open)}>{t(open ? "conversations.setup.later" : "conversations.setup.manage")}</Button>
        {open && <Button onClick={() => { setExpanded(false); setPreview(false); }}>{t("conversations.setup.viewInbox")}</Button>}
      </CardFooter>
    </Card>
  );
}
