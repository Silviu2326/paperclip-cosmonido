import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompany } from "@/context/CompanyContext";
import { authApi } from "@/api/auth";
import { productizationSecurityApi, type RetentionPreview } from "@/api/productization-security";
import { Link } from "@/lib/router";
import { useAccountIdentity } from "@/api/companies-query";
import { useTranslation } from "@/i18n";
import { SettingsScopeHeader, type SettingsContextLink } from "@/components/product-settings/SettingsScopeHeader";

export type SecuritySettingsSection = "access" | "retention";

// The old /product-security route becomes the "access" section; the parent mounts the other two paths.
const ACCESS_PATH = "/product-security";
const RETENTION_PATH = "/company/settings/retention";

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object"); }

/**
 * One security surface per `section`. Each section is its own component with its own hooks, so hidden scopes
 * never mount or fetch: `access` = this user's 2FA and sessions, `retention` = the selected company's data
 * retention. Deleting a commercial account lives on that account's card in Accounts.
 */
export function SecuritySettings({ section = "access" }: { section?: SecuritySettingsSection }) {
  const { t } = useTranslation();
  const identity = useAccountIdentity();
  const { selectedCompanyId } = useCompany();
  if (!identity.settled) return <p role="status">{t("securitySettings.loadingAccount")}</p>;
  if (!identity.userId) return <p role="alert">{t("securitySettings.signIn")}</p>;
  const scopeKey = `${identity.userId}:${selectedCompanyId}`;
  if (section === "retention") return <RetentionSecuritySettings key={scopeKey} userId={identity.userId} companyId={selectedCompanyId} />;
  return <AccessSecuritySettings key={scopeKey} userId={identity.userId} />;
}

function AccessSecuritySettings({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionsKey = ["auth", "security", "sessions", userId] as const;
  const twoFactorKey = ["auth", "security", "two-factor", userId] as const;
  const sessionQuery = useQuery({ queryKey: sessionsKey, queryFn: authApi.listSessions });
  const twoFactorQuery = useQuery({ queryKey: twoFactorKey, queryFn: authApi.getTwoFactorEnabled });
  useEffect(() => () => { queryClient.removeQueries({ queryKey: sessionsKey, exact: true }); queryClient.removeQueries({ queryKey: twoFactorKey, exact: true }); }, [queryClient, userId]);

  const enrollmentMutation = useMutation({ mutationFn: () => authApi.enableTotp(password), onSuccess: (payload) => {
    const result = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
    if (!isRecord(result) || typeof result.totpURI !== "string" || !Array.isArray(result.backupCodes)) { setNotice(t("securitySettings.enrollmentInvalid")); return; }
    setEnrollment({ totpURI: result.totpURI, backupCodes: result.backupCodes.filter((item): item is string => typeof item === "string") });
    setNotice(t("securitySettings.enrollmentHelp"));
  } });
  const verifyMutation = useMutation({ mutationFn: () => authApi.verifyTotp(code.trim()), onSuccess: async () => { setEnrollment(null); setCode(""); setPassword(""); setNotice(t("securitySettings.enabledNotice")); await queryClient.invalidateQueries({ queryKey: ["auth", "security", "two-factor"] }); await queryClient.invalidateQueries({ queryKey: ["auth", "session"] }); } });
  const disableMutation = useMutation({ mutationFn: () => authApi.disableTwoFactor(password), onSuccess: async () => { setPassword(""); setNotice(t("securitySettings.disabledNotice")); await queryClient.invalidateQueries({ queryKey: ["auth", "security", "two-factor"] }); await queryClient.invalidateQueries({ queryKey: ["auth", "session"] }); } });
  const backupCodesMutation = useMutation({ mutationFn: () => authApi.generateBackupCodes(password), onSuccess: (payload) => {
    const result = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
    const codes = isRecord(result) && Array.isArray(result.backupCodes) ? result.backupCodes.filter((item): item is string => typeof item === "string") : [];
    setEnrollment(codes.length ? { totpURI: "", backupCodes: codes } : null); setNotice(codes.length ? t("securitySettings.newCodesNotice") : t("securitySettings.noCodesNotice")); setPassword("");
  } });
  const revokeMutation = useMutation({ mutationFn: (token: string) => authApi.revokeSession(token), onSuccess: async () => { setNotice(t("securitySettings.sessionRevoked")); await queryClient.invalidateQueries({ queryKey: ["auth", "security", "sessions"] }); await queryClient.invalidateQueries({ queryKey: ["auth", "session"] }); } });
  const error = [enrollmentMutation.error, verifyMutation.error, disableMutation.error, backupCodesMutation.error, revokeMutation.error].find(Boolean);
  const links: SettingsContextLink[] = [
    { to: RETENTION_PATH, label: t("uxSettings.security.links.retention", { defaultValue: "Company data retention" }) },
  ];

  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
    <header className="flex flex-col gap-3"><div><h1 className="text-2xl font-semibold">{t("uxSettings.security.access.title", { defaultValue: "Sign-in security" })}</h1><p className="mt-1 text-sm text-muted-foreground">{t("securitySettings.description")}</p></div>
      <SettingsScopeHeader scope="user" description={t("uxSettings.security.access.scope", { defaultValue: "Two-step verification and sessions apply only to your own sign-in, in every company. Company data retention lives in its own section." })} links={links} />
    </header>
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {error instanceof Error && <p role="alert" className="text-sm text-destructive">{t("securitySettings.actionError")}</p>}
    <Card><CardHeader><CardTitle>{t("securitySettings.totpTitle")}</CardTitle><CardDescription>{t("securitySettings.totpDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
      {twoFactorQuery.isLoading ? <p className="text-sm text-muted-foreground">{t("securitySettings.loadingStatus")}</p> : twoFactorQuery.error ? <p role="alert" className="text-sm text-destructive">{t("securitySettings.statusError")}</p> : twoFactorQuery.data ? <>
        <p className="text-sm">{t("securitySettings.enabled")}</p><label className="flex flex-col gap-2 text-sm" htmlFor="security-password-disable">{t("securitySettings.confirmPasswordManage")}<Input id="security-password-disable" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => backupCodesMutation.mutate()} disabled={!password || backupCodesMutation.isPending}>{t("securitySettings.generateCodes")}</Button><Button variant="destructive" onClick={() => disableMutation.mutate()} disabled={!password || disableMutation.isPending}>{t("securitySettings.disable")}</Button></div>
      </> : enrollment ? <>
        {enrollment.totpURI && <div className="flex flex-col gap-2"><p className="text-sm">{t("securitySettings.manualUri")}</p><code className="break-all rounded-md border border-border p-3 text-xs">{enrollment.totpURI}</code></div>}
        {enrollment.backupCodes.length > 0 && <div className="flex flex-col gap-2"><p className="text-sm font-medium">{t("securitySettings.saveCodes")}</p><pre className="overflow-auto rounded-md border border-border p-3 text-xs">{enrollment.backupCodes.join("\n")}</pre></div>}
        {enrollment.totpURI && <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); verifyMutation.mutate(); }}><label className="flex flex-col gap-2 text-sm" htmlFor="security-totp-verify">{t("securitySettings.verifyCode")}<Input id="security-totp-verify" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required /></label><Button type="submit" disabled={!code.trim() || verifyMutation.isPending}>{t("securitySettings.verifyEnable")}</Button></form>}
        {!enrollment.totpURI && <Button variant="outline" onClick={() => setEnrollment(null)}>{t("securitySettings.done")}</Button>}
      </> : <><p className="text-sm">{t("securitySettings.notEnabled")}</p><label className="flex flex-col gap-2 text-sm" htmlFor="security-password-enable">{t("securitySettings.confirmPassword")}<Input id="security-password-enable" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><Button onClick={() => enrollmentMutation.mutate()} disabled={!password || enrollmentMutation.isPending}>{t("securitySettings.setupAuthenticator")}</Button></>}
      {twoFactorQuery.data && enrollment && !enrollment.totpURI && <div className="flex flex-col gap-2"><p className="text-sm font-medium">{t("securitySettings.saveCodes")}</p><pre className="overflow-auto rounded-md border border-border p-3 text-xs">{enrollment.backupCodes.join("\n")}</pre><Button variant="outline" onClick={() => setEnrollment(null)}>{t("securitySettings.done")}</Button></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("securitySettings.sessionsTitle")}</CardTitle><CardDescription>{t("securitySettings.sessionsDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
      {sessionQuery.isLoading ? <p className="text-sm text-muted-foreground">{t("securitySettings.loadingSessions")}</p> : sessionQuery.error ? <p role="alert" className="text-sm text-destructive">{t("securitySettings.sessionsError")}</p> : (sessionQuery.data ?? []).length ? (sessionQuery.data ?? []).map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"><div className="min-w-0"><p className="text-sm">{session.userAgent || t("securitySettings.unknownDevice")}</p><p className="text-xs text-muted-foreground">{session.ipAddress || t("securitySettings.ipUnavailable")} · {t("securitySettings.expires")} {new Date(session.expiresAt).toLocaleString()}</p></div><Button variant="outline" size="sm" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate(session.token)}>{t("securitySettings.revoke")}</Button></div>) : <p className="text-sm text-muted-foreground">{t("securitySettings.noSessions")}</p>}
    </CardContent></Card>
  </div>;
}

function RetentionSecuritySettings({ userId, companyId }: { userId: string; companyId: string | null }) {
  const { t } = useTranslation();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [conversationEnabled, setConversationEnabled] = useState(false);
  const [conversationDays, setConversationDays] = useState("365");
  const [filesEnabled, setFilesEnabled] = useState(false);
  const [fileDays, setFileDays] = useState("30");
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const retentionKey = ["productization", "security", companyId] as const;
  useEffect(() => () => { queryClient.removeQueries({ queryKey: retentionKey, exact: true }); }, [queryClient, userId, companyId]);
  const retentionQuery = useQuery({ queryKey: retentionKey, queryFn: () => productizationSecurityApi.retention(companyId!), enabled: Boolean(companyId) });
  useEffect(() => {
    if (!retentionQuery.data) return;
    setConversationEnabled(retentionQuery.data.conversations.enabled);
    setConversationDays(String(retentionQuery.data.conversations.days));
    setFilesEnabled(retentionQuery.data.files.enabled);
    setFileDays(String(retentionQuery.data.files.days));
    setPreview(null);
  }, [retentionQuery.data]);

  const retentionPreviewMutation = useMutation({ mutationFn: () => productizationSecurityApi.previewRetention(companyId!, { conversations: { enabled: conversationEnabled, days: Number(conversationDays) }, files: { enabled: filesEnabled, days: Number(fileDays) } }), onSuccess: setPreview });
  const retentionMutation = useMutation({
    mutationFn: () => {
      if (!retentionQuery.data || !preview) throw new Error(t("securitySettings.previewFirst"));
      return productizationSecurityApi.updateRetention(companyId!, { revision: retentionQuery.data.revision, previewId: preview.id, conversations: { enabled: conversationEnabled, days: Number(conversationDays) }, files: { enabled: filesEnabled, days: Number(fileDays) } });
    },
    onSuccess: (policy) => { setPreview(null); queryClient.setQueryData(retentionKey, policy); void queryClient.invalidateQueries({ queryKey: retentionKey }); },
  });
  const error = [retentionPreviewMutation.error, retentionMutation.error].find(Boolean);
  const links: SettingsContextLink[] = [
    { to: ACCESS_PATH, label: t("uxSettings.security.links.access", { defaultValue: "Sign-in security" }) },
  ];

  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
    <header className="flex flex-col gap-3"><div><h1 className="text-2xl font-semibold">{t("uxSettings.security.retention.title", { defaultValue: "Data retention" })}</h1><p className="mt-1 text-sm text-muted-foreground">{t("securitySettings.retentionDescription")}</p></div>
      <SettingsScopeHeader scope="company" scopeName={selectedCompany?.name} description={t("uxSettings.security.retention.scope", { defaultValue: "This policy applies to the selected company's closed conversations and files. Your own sign-in security is managed separately." })} links={links} />
    </header>
    {error instanceof Error && <p role="alert" className="text-sm text-destructive">{t("securitySettings.actionError")}</p>}
    <Card><CardHeader><CardTitle>{t("securitySettings.retentionTitle")}</CardTitle><CardDescription>{t("securitySettings.retentionDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
      {!companyId ? <p className="text-sm text-muted-foreground">{t("securitySettings.chooseCompany")}</p> : retentionQuery.isLoading ? <p className="text-sm text-muted-foreground">{t("securitySettings.loadingPolicy")}</p> : retentionQuery.error ? <p role="alert" className="text-sm text-destructive">{t("securitySettings.policyError")}</p> : retentionQuery.data ? <>
        <p className="text-sm">{t("securitySettings.enforcement")}: <span className="font-medium">{retentionQuery.data.enforcement}</span>{retentionQuery.data.blocker ? ` · ${retentionQuery.data.blocker}` : ""}</p>
        <div className="flex flex-wrap gap-4 text-sm"><Link className="text-primary underline underline-offset-2" to="/company/settings/access">{t("securitySettings.manageAccess")}</Link><Link className="text-primary underline underline-offset-2" to="/company/export">{t("securitySettings.portability")}</Link></div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={conversationEnabled} onCheckedChange={(checked) => { setConversationEnabled(checked === true); setPreview(null); }} />{t("securitySettings.redactConversations")}</label>
        <label className="flex flex-col gap-2 text-sm" htmlFor="retention-conversation-days">{t("securitySettings.conversationDays")}<Input id="retention-conversation-days" type="number" min={30} max={3650} value={conversationDays} onChange={(event) => { setConversationDays(event.target.value); setPreview(null); }} /></label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={filesEnabled} onCheckedChange={(checked) => { setFilesEnabled(checked === true); setPreview(null); }} />{t("securitySettings.purgeFiles")}</label>
        <label className="flex flex-col gap-2 text-sm" htmlFor="retention-file-days">{t("securitySettings.fileDays")}<Input id="retention-file-days" type="number" min={7} max={3650} value={fileDays} onChange={(event) => { setFileDays(event.target.value); setPreview(null); }} /></label>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => retentionPreviewMutation.mutate()} disabled={retentionPreviewMutation.isPending || !Number.isInteger(Number(conversationDays)) || !Number.isInteger(Number(fileDays))}>{retentionPreviewMutation.isPending ? t("securitySettings.counting") : t("securitySettings.previewRecords")}</Button>{preview && <Button onClick={() => retentionMutation.mutate()} disabled={retentionMutation.isPending}>{retentionMutation.isPending ? t("securitySettings.savingPolicy") : t("securitySettings.confirmSave")}</Button>}</div>
        {preview && <p role="status" className="text-sm text-muted-foreground">{t("securitySettings.previewLine", { conversations: preview.counts.closedConversations, files: preview.counts.files, versions: preview.counts.versions, bytes: preview.counts.bytes, time: new Date(preview.expiresAt).toLocaleTimeString() })} {preview.counts.filesBlocker ? t("securitySettings.filePurgeBlocked", { reason: preview.counts.filesBlocker }) : ""}</p>}
      </> : <p role="status" className="text-sm text-muted-foreground">{t("securitySettings.loadingPolicy")}</p>}
    </CardContent></Card>
  </div>;
}
