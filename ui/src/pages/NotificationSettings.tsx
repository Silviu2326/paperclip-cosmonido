import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CircleAlert, ExternalLink, Smartphone } from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n";
import { DailyBriefPreferences } from "@/components/DailyBriefPreferences";
import { SettingsScopeHeader } from "@/components/product-settings/SettingsScopeHeader";
import { useAccountIdentity } from "../api/companies-query";
import { productNotificationsApi } from "../api/product-notifications";
import { useCompany } from "../context/CompanyContext";
import { clearForegroundProductNotifications, requestBrowserNotificationPermission } from "../features/productization/notifications/browser-notification";
import { PRODUCT_NOTIFICATION_CATEGORIES, type ProductNotificationCategory } from "@paperclipai/shared/productization/notifications";

export type NotificationSettingsView = "preferences" | "inbox";

// The parent mounts the operational feed at /inbox/notifications and preferences at /company/settings/notifications.
const INBOX_PATH = "/inbox/notifications";
const PREFERENCES_PATH = "/company/settings/notifications";

function useNotificationCategories(): Array<{ id: ProductNotificationCategory; label: string; description: string }> {
  const { t } = useTranslation();
  const labels: Record<ProductNotificationCategory, { label: string; description: string }> = {
    decisions: { label: t("uxSettings.notifications.categories.decisions.label", { defaultValue: "Decisions" }), description: t("uxSettings.notifications.categories.decisions.description", { defaultValue: "Open decisions that need a board response." }) },
    reviews: { label: t("uxSettings.notifications.categories.reviews.label", { defaultValue: "Deliverable reviews" }), description: t("uxSettings.notifications.categories.reviews.description", { defaultValue: "Pending reviews assigned to you or the board." }) },
    tasks: { label: t("uxSettings.notifications.categories.tasks.label", { defaultValue: "Assigned tasks" }), description: t("uxSettings.notifications.categories.tasks.description", { defaultValue: "Open tasks assigned directly to your account." }) },
  };
  return PRODUCT_NOTIFICATION_CATEGORIES.map((id) => ({ id, ...labels[id] }));
}

function vapidApplicationServerKey(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/**
 * `inbox` is the operational feed (items that need attention); `preferences` holds categories and the
 * browser/device destinations. Each view is its own component, so the feed is never mounted in preferences
 * and the push queries never run in the feed.
 */
export function NotificationSettings({ view = "preferences" }: { view?: NotificationSettingsView }) {
  const { t } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { userId, settled, failed } = useAccountIdentity();
  if (!settled || !userId) {
    return <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6"><p role={failed ? "alert" : "status"}>{failed ? t("uxNav.sessionError", { defaultValue: "Could not load your session. Reload to try again." }) : !settled ? t("uxNav.sessionLoading", { defaultValue: "Loading your session…" }) : t("uxNav.signIn", { defaultValue: "Sign in to manage your notifications." })}</p></main>;
  }
  if (!selectedCompanyId || !selectedCompany) {
    return <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6"><Card><CardHeader><CardTitle>{view === "inbox" ? t("uxSettings.notifications.inbox.title", { defaultValue: "Notifications" }) : t("uxSettings.notifications.preferences.title", { defaultValue: "Notification preferences" })}</CardTitle><CardDescription>{view === "inbox" ? t("uxSettings.notifications.inbox.selectCompany", { defaultValue: "Select a company to view its notification inbox." }) : t("uxSettings.notifications.preferences.selectCompany", { defaultValue: "Select a company to manage its notification preferences." })}</CardDescription></CardHeader></Card></main>;
  }
  const scopeKey = `${userId ?? ""}:${selectedCompanyId}`;
  return view === "inbox"
    ? <ProductNotificationInbox key={scopeKey} userId={userId} companyId={selectedCompanyId} companyName={selectedCompany.name} />
    : <NotificationPreferences key={scopeKey} userId={userId} companyId={selectedCompanyId} companyName={selectedCompany.name} />;
}

/** Read-only feed. Notices point to the work; decisions, reviews and tasks are resolved on their own screens. */
export function ProductNotificationInbox({ userId, companyId, companyName }: { userId: string | null; companyId: string; companyName: string }) {
  const { t } = useTranslation();
  const categories = useNotificationCategories();
  const [categoryFilter, setCategoryFilter] = useState<ProductNotificationCategory | "all">("all");
  const queryKey = ["product-notifications", userId, companyId];
  const snapshot = useQuery({ queryKey, queryFn: () => productNotificationsApi.snapshot(companyId), enabled: Boolean(userId), staleTime: 15_000 });
  const items = useMemo(() => (snapshot.data?.items ?? []).filter((item) => categoryFilter === "all" || item.category === categoryFilter), [categoryFilter, snapshot.data?.items]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">{companyName}</p><h1 className="text-2xl font-semibold">{t("uxSettings.notifications.inbox.title", { defaultValue: "Notifications" })}</h1></div><Link className="text-sm text-primary underline underline-offset-2" to={PREFERENCES_PATH}>{t("uxSettings.notifications.inbox.preferencesLink", { defaultValue: "Notification preferences" })}</Link></header>
      <p className="text-sm text-muted-foreground">{t("uxSettings.notifications.inbox.liveHint", { defaultValue: "Inbox updates follow the active company session." })} {t("uxSettings.notifications.inbox.noResolve", { defaultValue: "Notices only point to the work: nothing is approved or resolved from this list. Open an item to respond there." })}</p>
      {snapshot.error ? <Card><CardContent className="flex items-start gap-3 pt-6"><CircleAlert className="size-5 text-destructive" /><p role="alert" className="text-sm">{snapshot.error.message}</p></CardContent></Card> : null}
      <section className="flex min-w-0 flex-col gap-3" aria-label={t("uxSettings.notifications.inbox.listLabel", { defaultValue: "Notification inbox" })}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("uxSettings.notifications.inbox.filterLabel", { defaultValue: "Filter notification inbox" })}>
          <Button variant={categoryFilter === "all" ? "secondary" : "outline"} size="sm" aria-pressed={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>{t("uxSettings.notifications.inbox.allShown", { defaultValue: "All shown ({{shown}})", shown: snapshot.data?.items.length ?? 0 })}</Button>
          {categories.map((category) => <Button key={category.id} variant={categoryFilter === category.id ? "secondary" : "outline"} size="sm" aria-pressed={categoryFilter === category.id} onClick={() => setCategoryFilter(category.id)}>{t("uxSettings.notifications.inbox.categoryShown", { defaultValue: "{{label}} shown ({{shown}})", label: category.label, shown: snapshot.data?.counts[category.id] ?? 0 })}</Button>)}
        </div>
        {snapshot.isLoading ? <p role="status" className="text-sm text-muted-foreground">{t("uxSettings.notifications.inbox.loading", { defaultValue: "Loading notification inbox…" })}</p> : null}
        {snapshot.isSuccess && !items.length ? <Card><CardHeader><CardTitle>{t("uxSettings.notifications.inbox.emptyTitle", { defaultValue: "Nothing needs your attention" })}</CardTitle><CardDescription>{t("uxSettings.notifications.inbox.emptyDescription", { defaultValue: "Open decisions, reviews and your assigned tasks will appear here." })}</CardDescription></CardHeader></Card> : null}
        {items.map((item) => <Card key={item.key}><CardContent className="flex flex-col gap-2 pt-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{categories.find((category) => category.id === item.category)?.label}</p><h2 className="font-medium">{item.title}</h2><p className="text-sm text-muted-foreground">{item.summary}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p></div><Button asChild variant="outline" size="sm" className="shrink-0"><Link to={item.href}>{t("uxSettings.notifications.inbox.open", { defaultValue: "Open" })} <ExternalLink className="size-4" /></Link></Button></CardContent></Card>)}
      </section>
    </main>
  );
}

/** Categories plus browser/device destinations. Never renders feed items. */
export function NotificationPreferences({ userId, companyId, companyName }: { userId: string | null; companyId: string; companyName: string }) {
  const { t } = useTranslation();
  const categories = useNotificationCategories();
  const queryClient = useQueryClient();
  const queryKey = ["product-notifications", userId, companyId];
  const scopeKey = `${userId ?? ""}:${companyId}`;
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  useEffect(() => { scopeRef.current = scopeKey; return () => { scopeRef.current = ""; }; }, [scopeKey]);
  const [pushError, setPushError] = useState<string | null>(null);
  // The preferences live in the same snapshot the feed uses (and the global bridge already shares); only the preference fields are rendered here.
  const snapshot = useQuery({ queryKey, queryFn: () => productNotificationsApi.snapshot(companyId), enabled: Boolean(userId), staleTime: 15_000 });
  const pushConfig = useQuery({ queryKey: ["product-notifications-push-config", companyId], queryFn: () => productNotificationsApi.pushConfig(companyId), staleTime: 60_000 });
  const pushSubscriptions = useQuery({ queryKey: ["product-notification-push-subscriptions", userId, companyId], queryFn: () => productNotificationsApi.pushSubscriptions(companyId), enabled: Boolean(userId), staleTime: 15_000 });
  const save = useMutation({
    mutationFn: (input: { categories: ProductNotificationCategory[]; browserEnabled: boolean }) => productNotificationsApi.updatePreferences(companyId, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey }),
  });
  const browserPermission = typeof window === "undefined" || !("Notification" in window) ? "unsupported" : Notification.permission;
  const remotePushSupported = typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const permissionLabels: Record<string, string> = {
    granted: t("uxSettings.notifications.permission.granted", { defaultValue: "allowed" }),
    denied: t("uxSettings.notifications.permission.denied", { defaultValue: "blocked" }),
    default: t("uxSettings.notifications.permission.default", { defaultValue: "not requested" }),
    unsupported: t("uxSettings.notifications.permission.unsupported", { defaultValue: "unsupported" }),
  };

  const updateCategories = (category: ProductNotificationCategory, checked: boolean | "indeterminate") => {
    const current = snapshot.data?.preferences.categories ?? categories.map((item) => item.id);
    const next = checked === true ? [...new Set([...current, category])] : current.filter((item) => item !== category);
    save.mutate({ categories: next, browserEnabled: snapshot.data?.preferences.browserEnabled ?? false });
  };
  const enableBrowser = async () => {
    const capturedScope = scopeRef.current;
    const permission = await requestBrowserNotificationPermission();
    if (!capturedScope || scopeRef.current !== capturedScope) return;
    const enabled = permission === "granted";
    save.mutate({ categories: snapshot.data?.preferences.categories ?? categories.map((item) => item.id), browserEnabled: enabled });
  };
  const enableRemotePush = async () => {
    setPushError(null);
    const capturedScope = scopeKey;
    const vapidKey = pushConfig.data?.publicKey;
    if (!vapidKey || !remotePushSupported) return;
    try {
      const permission = await requestBrowserNotificationPermission();
      if (permission !== "granted") throw new Error(t("uxSettings.notifications.preferences.pushPermissionRequired", { defaultValue: "Allow notifications in your browser to enable web push." }));
      if (scopeRef.current !== capturedScope) return;
      const registration = await navigator.serviceWorker.ready;
      if (scopeRef.current !== capturedScope) return;
      const existing = await registration.pushManager.getSubscription();
      if (scopeRef.current !== capturedScope) return;
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidApplicationServerKey(vapidKey) });
      if (scopeRef.current !== capturedScope) return;
      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.auth || !serialized.keys.p256dh) throw new Error(t("uxSettings.notifications.preferences.pushIncomplete", { defaultValue: "The browser returned an incomplete push subscription." }));
      await productNotificationsApi.subscribePush(companyId, {
        endpoint: serialized.endpoint,
        expirationTime: serialized.expirationTime ?? null,
        keys: { auth: serialized.keys.auth, p256dh: serialized.keys.p256dh },
      });
      if (scopeRef.current !== capturedScope) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product-notification-push-subscriptions", userId, companyId] }),
        queryClient.invalidateQueries({ queryKey }),
      ]);
    } catch (error) {
      setPushError(error instanceof Error ? error.message : t("uxSettings.notifications.preferences.pushEnableError", { defaultValue: "Could not enable web push." }));
    }
  };
  const disableRemotePush = async () => {
    setPushError(null);
    try {
      await productNotificationsApi.revokeAllPushSubscriptions(companyId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product-notification-push-subscriptions", userId, companyId] }),
        queryClient.invalidateQueries({ queryKey }),
      ]);
    } catch (error) {
      setPushError(error instanceof Error ? error.message : t("uxSettings.notifications.preferences.pushDisableError", { defaultValue: "Could not disable web push." }));
    }
  };

  const preferences = snapshot.data?.preferences;
  const remotePushText = preferences?.remotePushStatus === "blocked_configuration"
    ? t("uxSettings.notifications.preferences.pushBlocked", { defaultValue: "Blocked until the server has VAPID public key, private key and subject configured." })
    : preferences?.remotePushEnabled
      ? t("uxSettings.notifications.preferences.pushActive", { defaultValue: "{{devices}} device subscription(s) active for this company.", devices: pushSubscriptions.data?.length ?? 0 })
      : t("uxSettings.notifications.preferences.pushIdle", { defaultValue: "Web Push uses this browser subscription even when Paperclip is closed. Notices remain generic." });
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3"><h1 className="text-2xl font-semibold">{t("uxSettings.notifications.preferences.title", { defaultValue: "Notification preferences" })}</h1>
        <SettingsScopeHeader scope="user" scopeName={companyName} description={t("uxSettings.notifications.preferences.scope", { defaultValue: "These settings apply only to your account in {{company}}. The notices themselves are listed in the notification inbox.", company: companyName })} links={[{ to: INBOX_PATH, label: t("uxSettings.notifications.preferences.inboxLink", { defaultValue: "Open notification inbox" }) }]} />
      </header>
      {snapshot.error ? <Card><CardContent className="flex items-start gap-3 pt-6"><CircleAlert className="size-5 text-destructive" /><p role="alert" className="text-sm">{snapshot.error.message}</p></CardContent></Card> : null}
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="size-5" />{t("uxSettings.notifications.preferences.categoriesTitle", { defaultValue: "What to be notified about" })}</CardTitle><CardDescription>{t("uxSettings.notifications.preferences.categoriesDescription", { defaultValue: "Choose which kinds of open work create notices for you in {{company}}.", company: companyName })}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{categories.map((category) => <div key={category.id} className="flex items-start gap-3"><Checkbox id={`notification-${category.id}`} checked={preferences?.categories.includes(category.id) ?? true} onCheckedChange={(checked) => updateCategories(category.id, checked)} disabled={save.isPending || !snapshot.data} /><div className="flex flex-col gap-1"><Label htmlFor={`notification-${category.id}`}>{category.label}</Label><p className="text-sm text-muted-foreground">{category.description}</p></div></div>)}{save.error ? <p role="alert" className="text-sm text-destructive">{save.error.message}</p> : null}{save.isSuccess ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4" />{t("uxSettings.notifications.preferences.saved", { defaultValue: "Preferences saved" })}</p> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="size-5" />{t("uxSettings.notifications.preferences.deviceTitle", { defaultValue: "This device" })}</CardTitle><CardDescription>{t("uxSettings.notifications.preferences.deviceDescription", { defaultValue: "Choose whether this account receives generic system notices for {{company}}.", company: companyName })}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">{t("uxSettings.notifications.preferences.browserPermission", { defaultValue: "Browser permission: {{permission}}. Notices contain no task or customer text.", permission: permissionLabels[browserPermission] ?? browserPermission })}</p><Button variant="outline" disabled={!snapshot.data || save.isPending || browserPermission === "unsupported" || browserPermission === "denied" || preferences?.browserEnabled} onClick={enableBrowser}>{preferences?.browserEnabled ? t("uxSettings.notifications.preferences.browserEnabled", { defaultValue: "Browser notices enabled" }) : t("uxSettings.notifications.preferences.enableBrowser", { defaultValue: "Enable browser notices" })}</Button>{preferences?.browserEnabled ? <Button variant="ghost" onClick={async () => { await clearForegroundProductNotifications(); save.mutate({ categories: preferences.categories ?? [], browserEnabled: false }); }}>{t("uxSettings.notifications.preferences.disableBrowser", { defaultValue: "Turn off and clear browser notices" })}</Button> : null}<div className="flex flex-col gap-2 border-t pt-4"><p className="text-sm font-medium">{t("uxSettings.notifications.preferences.pushTitle", { defaultValue: "Remote web push" })}</p><p className="text-sm text-muted-foreground">{remotePushText}</p>{pushError ? <p role="alert" className="text-sm text-destructive">{pushError}</p> : null}{preferences?.remotePushEnabled ? <Button variant="outline" onClick={disableRemotePush}>{t("uxSettings.notifications.preferences.pushDisable", { defaultValue: "Turn off web push for this company" })}</Button> : <Button variant="outline" disabled={!remotePushSupported || !pushConfig.data?.enabled || preferences?.remotePushStatus === "blocked_configuration"} onClick={enableRemotePush}>{!remotePushSupported ? t("uxSettings.notifications.preferences.pushUnsupported", { defaultValue: "Web Push unsupported in this browser" }) : pushConfig.data?.enabled ? t("uxSettings.notifications.preferences.pushEnable", { defaultValue: "Enable remote web push" }) : t("uxSettings.notifications.preferences.pushUnavailable", { defaultValue: "Web Push configuration unavailable" })}</Button>}</div><p className="text-sm text-muted-foreground">{t("uxSettings.notifications.preferences.whatsapp", { defaultValue: "WhatsApp remains unavailable until an authorized channel and consent flow exist." })}</p></CardContent></Card>
      <DailyBriefPreferences companyId={companyId} />
    </main>
  );
}

export default NotificationSettings;
