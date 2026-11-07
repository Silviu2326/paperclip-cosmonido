import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accessApi } from "@/api/access";
import { productizationAccountsApi } from "@/api/productization-accounts";
import type { CompanyUserDirectoryEntry } from "@/api/access";
import { useAccountIdentity } from "@/api/companies-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { useCompany } from "@/context/CompanyContext";
import { useTranslation } from "@/i18n";
import { SettingsScopeHeader } from "@/components/product-settings/SettingsScopeHeader";
import { Link } from "@/lib/router";
import { AccountDeletionZone } from "@/components/AccountDeletionZone";

export function availableCompanyMemberChoices(
  users: CompanyUserDirectoryEntry[],
  linkedUserIds: Iterable<string>,
) {
  const linked = new Set(linkedUserIds);
  return users
    .filter(entry => entry.status === "active" && !linked.has(entry.principalId))
    .map(entry => ({
      id: entry.principalId,
      label: entry.user?.name || entry.user?.email || entry.principalId,
      email: entry.user?.email ?? null,
    }));
}

export function ProductAccounts() {
  const { t } = useTranslation();
  const identity = useAccountIdentity();
  if (!identity.settled) return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6"><p role="status">{t("accountPage.loading")}</p></main>;
  if (!identity.userId) return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6"><p role="status">{t("accountPage.signIn")}</p></main>;
  return <AccountsForUser key={identity.userId} userId={identity.userId} />;
}

function AccountsForUser({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [companyIds, setCompanyIds] = useState<Record<string, string>>({});
  const [memberIds, setMemberIds] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const { selectedCompanyId } = useCompany();
  const listKey = ["product-accounts", userId] as const;
  useEffect(() => () => {
    void qc.removeQueries({ queryKey: listKey });
    void qc.removeQueries({ queryKey: ["product-account", userId] });
    void qc.removeQueries({ queryKey: ["product-account-members", userId] });
  }, [qc, userId]);
  useEffect(() => setMemberIds({}), [selectedCompanyId]);

  const list = useQuery({ queryKey: listKey, queryFn: productizationAccountsApi.list });
  const create = useMutation({
    mutationFn: (accountName: string) => productizationAccountsApi.create(accountName),
    onSuccess: () => { setName(""); setMessage(""); void qc.invalidateQueries({ queryKey: listKey }); },
    onError: error => setMessage(error.message),
  });
  const grant = useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: string }) => productizationAccountsApi.grantCompany(id, companyId),
    onSuccess: (_, variables) => {
      setMessage(t("accountPage.grantConfirmed"));
      setCompanyIds(current => ({ ...current, [variables.id]: "" }));
      void qc.invalidateQueries({ queryKey: listKey });
      void qc.invalidateQueries({ queryKey: ["product-account", userId, variables.id] });
    },
    onError: error => setMessage(error.message),
  });
  const addMember = useMutation({
    mutationFn: ({ id, memberUserId }: { id: string; memberUserId: string }) => productizationAccountsApi.addMember(id, memberUserId, "member"),
    onSuccess: (_, variables) => {
      setMemberIds(current => ({ ...current, [variables.id]: "" }));
      void qc.invalidateQueries({ queryKey: ["product-account-members", userId, variables.id] });
    },
    onError: error => setMessage(error.message),
  });

  return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6">
    <SettingsScopeHeader scope="account" description={t("uxSettings.accounts.scope", { defaultValue: "Commercial accounts group the companies, members and plan limits you pay for. They are separate from your user profile and from the settings of a single company. Billing for each account is managed in Billing." })} links={[{ to: "/company/settings/billing", label: t("uxSettings.accounts.billingLink", { defaultValue: "Billing and plan" }) }]} />
    <Card><CardHeader><CardTitle>{t("accountPage.title")}</CardTitle><CardDescription>{t("accountPage.description")}</CardDescription></CardHeader><CardContent className="grid gap-3">
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); create.mutate(name); }}><input aria-label={t("accountPage.accountName")} className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={name} onChange={event => setName(event.target.value)} placeholder={t("accountPage.accountName")}/><Button disabled={!name.trim() || create.isPending}>{t("accountPage.create")}</Button></form>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </CardContent></Card>
    {list.isLoading ? <p role="status">{t("accountPage.loadingAccounts")}</p> : list.isError ? <p role="alert">{t("accountPage.loadError")} {list.error.message}</p> : list.data?.map(({ account, role }) => <AccountCard
      key={account.id}
      userId={userId}
      account={account}
      role={role}
      selectedCompanyId={selectedCompanyId}
      companyId={companyIds[account.id] ?? ""}
      setCompanyId={value => setCompanyIds(current => ({ ...current, [account.id]: value }))}
      memberId={memberIds[account.id] ?? ""}
      setMemberId={value => setMemberIds(current => ({ ...current, [account.id]: value }))}
      onAddMember={() => addMember.mutate({ id: account.id, memberUserId: memberIds[account.id] ?? "" })}
      addMemberPending={addMember.isPending}
      onGrant={() => grant.mutate({ id: account.id, companyId: companyIds[account.id] ?? "" })}
    />)}
  </main>;
}

function AccountCard({ userId, account, role, selectedCompanyId, companyId, setCompanyId, memberId, setMemberId, onAddMember, addMemberPending, onGrant }: {
  userId: string;
  account: { id: string; name: string; planId: string; access: string };
  role: string;
  selectedCompanyId: string | null;
  companyId: string;
  setCompanyId: (value: string) => void;
  memberId: string;
  setMemberId: (value: string) => void;
  onAddMember: () => void;
  addMemberPending: boolean;
  onGrant: () => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["product-account", userId, account.id], queryFn: () => productizationAccountsApi.get(account.id) });
  const members = useQuery({ queryKey: ["product-account-members", userId, account.id], queryFn: () => productizationAccountsApi.members(account.id) });
  const canManageMembers = role === "owner" || role === "admin";
  const directory = useQuery({
    queryKey: ["product-account-company-member-candidates", selectedCompanyId],
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: canManageMembers && Boolean(selectedCompanyId),
  });
  const availableMembers = availableCompanyMemberChoices(directory.data?.users ?? [], members.data?.map(member => member.userId) ?? []);
  const canSubmitMember = Boolean(memberId.trim()) && !addMemberPending && !members.isLoading && !members.isError && !directory.isLoading;
  // Only the companies this user can already see (the authorized company list) are offered; already linked ones are left out.
  const { companies } = useCompany();
  const linkedCompanyIds = new Set(query.data?.companies.map(company => company.companyId) ?? []);
  const linkableCompanies = companies.filter(company => company.status !== "archived" && !linkedCompanyIds.has(company.id));
  return <Card><CardHeader><CardTitle>{account.name}</CardTitle><CardDescription>{t("accountPage.plan")} {account.planId} · {t("accountPage.access")} {account.access} · {t("accountPage.role")} {role}</CardDescription></CardHeader><CardContent className="grid gap-3">
    <p className="text-sm">{t("accountPage.linkedCompanies")}: {query.data?.companies.map(company => company.companyName).join(", ") || t("accountPage.none")}</p>
    <p className="text-sm text-muted-foreground">{t("accountPage.capacity")}: {query.data?.capacity.companies ?? 0} {t("accountPage.companies")} · {query.data?.capacity.agents ?? 0} {t("accountPage.agents")} · {query.data?.capacity.connections ?? 0} {t("accountPage.connections")}</p>
    <p className="text-sm">{t("accountPage.members")}: {members.data?.map(member => `${member.userId} (${member.role})`).join(", ") || t("accountPage.none")}</p>
    {canManageMembers && <>
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); onGrant(); }}><NativeSelect aria-label={t("accountPage.companyIdFor", { name: account.name })} className="min-w-48 flex-1" value={companyId} onChange={event => setCompanyId(event.target.value)} disabled={!linkableCompanies.length}><option value="">{linkableCompanies.length ? t("uxSettings.accounts.chooseCompany", { defaultValue: "Choose a company to link" }) : t("uxSettings.accounts.noLinkableCompanies", { defaultValue: "No other companies available to link" })}</option>{linkableCompanies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</NativeSelect><Button variant="outline" disabled={!companyId}>{t("accountPage.linkCompany")}</Button></form>
      <form className="flex flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); if (canSubmitMember) onAddMember(); }}>
        <NativeSelect
          aria-label={t("uxAccounts.memberFor", { defaultValue: "Company member to add" })}
          className="min-w-48 flex-1"
          value={availableMembers.some(member => member.id === memberId) ? memberId : ""}
          onChange={event => setMemberId(event.target.value)}
          disabled={!selectedCompanyId || directory.isLoading || members.isLoading || members.isError || !availableMembers.length || addMemberPending}
        >
          <option value="">{!selectedCompanyId
            ? t("uxAccounts.selectCompany", { defaultValue: "Select a company to find its members." })
            : directory.isLoading || members.isLoading
              ? t("uxAccounts.loadingMembers", { defaultValue: "Loading company members…" })
              : t("uxAccounts.chooseMember", { defaultValue: "Choose a company member" })}</option>
          {availableMembers.map(member => <option key={member.id} value={member.id}>{member.email && member.email !== member.label ? `${member.label} · ${member.email}` : member.label}</option>)}
        </NativeSelect>
        <Button variant="outline" disabled={!canSubmitMember}>{addMemberPending ? t("uxAccounts.addingMember", { defaultValue: "Adding…" }) : t("accountPage.addMember")}</Button>
      </form>
      {members.isError && <p role="alert" className="text-xs text-destructive">{t("uxAccounts.currentMembersError", { defaultValue: "The account member list could not be loaded. Try again before adding someone." })}</p>}
      {directory.isError && <p role="status" className="text-xs text-muted-foreground">{t("uxAccounts.directoryError", { defaultValue: "The company member list could not be loaded. You can still enter a user ID below." })}</p>}
      {!selectedCompanyId && <p className="text-xs text-muted-foreground">{t("uxAccounts.directoryScope", { defaultValue: "Select a company to choose from its active members." })}</p>}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">{t("uxAccounts.externalMember", { defaultValue: "Add someone by user ID" })}</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input aria-label={t("accountPage.userIdFor", { name: account.name })} className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={availableMembers.some(member => member.id === memberId) ? "" : memberId} onChange={event => setMemberId(event.target.value)} placeholder={t("accountPage.memberId")}/>
          <Link className="text-sm text-primary underline-offset-4 hover:underline" to="/company/settings/members">{t("uxAccounts.inviteLink", { defaultValue: "Invite a company member" })}</Link>
        </div>
      </details>
    </>}
    {query.isError && <p role="alert">{t("accountPage.usageError")}</p>}
    <p className="text-sm text-muted-foreground">{query.data?.usage.map(metric => `${metric.metric}: ${metric.consumed} (${metric.periodKey})`).join(" · ") || t("accountPage.noUsage")}</p>
    {role === "owner" && <AccountDeletionZone userId={userId} accountId={account.id} accountName={account.name} />}
    {query.data?.notices.map(notice => <p key={notice.id} role="status" className="text-sm text-muted-foreground">{t("productAccounts.notice", { defaultValue: "{{metric}} has reached {{threshold}}% of its limit ({{consumed}} of {{limit}}; {{period}}).", metric: notice.metric, threshold: notice.threshold, consumed: notice.consumed, limit: notice.limit, period: notice.periodKey })}</p>)}
  </CardContent></Card>;
}

export default ProductAccounts;
