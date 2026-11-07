import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productizationAccountsApi } from "@/api/productization-accounts";
import { productizationAgencyApi, type AgencyPackageSummary } from "@/api/productization-agency";
import type { AgencyBrandSettings } from "@/api/productization-agency";
import { useAccountIdentity } from "@/api/companies-query";
import { PackageInstallPanel } from "@/features/productization/catalog/PackageInstallPanel";
import { PublicBusinessBrand } from "@/components/PublicBusinessBrand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";

export function AgencyWorkspace() {
  const { t } = useTranslation();
  const identity = useAccountIdentity();
  if (!identity.settled) return <main className="mx-auto grid w-full max-w-6xl gap-4 p-6"><p role="status">{t("agencyPage.userLoading")}</p></main>;
  if (!identity.userId) return <main className="mx-auto grid w-full max-w-6xl gap-4 p-6"><p role="status">{t("agencyPage.signIn")}</p></main>;
  return <AgencyWorkspaceForUser key={identity.userId} userId={identity.userId} />;
}

function AgencyWorkspaceForUser({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const accountsKey = ["product-accounts", userId] as const;
  const accounts = useQuery({ queryKey: accountsKey, queryFn: productizationAccountsApi.list });
  const managedAccounts = (accounts.data ?? []).filter(({ role }) => role === "owner" || role === "admin");
  const [accountId, setAccountId] = useState("");
  const currentAccountId = managedAccounts.some(({ account }) => account.id === accountId) ? accountId : (managedAccounts[0]?.account.id ?? "");
  const operationStatusLabel = (status: string) => ({
    awaiting_capacity: t("agencyPage.awaitingCapacity"), creating: t("agencyPage.creating"),
    package_ready: t("agencyPage.packageReady"), ready: t("agencyPage.ready"),
  }[status] ?? status);
  const portfolioKey = ["agency", userId, currentAccountId, "portfolio"] as const;
  const portfolio = useQuery({ queryKey: portfolioKey, queryFn: ({ signal }) => productizationAgencyApi.portfolio(currentAccountId, signal), enabled: Boolean(currentAccountId) });
  const operationsKey = ["agency", userId, currentAccountId, "operations"] as const;
  const operations = useQuery({ queryKey: operationsKey, queryFn: ({ signal }) => productizationAgencyApi.operations(currentAccountId, signal), enabled: Boolean(currentAccountId) });
  const [sourceCompanyId, setSourceCompanyId] = useState("");
  const companies = portfolio.data?.companies ?? [];
  const selectedSourceId = companies.some((company) => company.companyId === sourceCompanyId) ? sourceCompanyId : (companies[0]?.companyId ?? "");
  const packages = useQuery({ queryKey: ["agency", userId, currentAccountId, selectedSourceId, "packages"], queryFn: ({ signal }) => productizationAgencyApi.packages(selectedSourceId, signal), enabled: Boolean(selectedSourceId) });
  const publishedPackages = (packages.data ?? []).filter((item) => item.status === "published");
  const [packageId, setPackageId] = useState("");
  const selectedPackageId = publishedPackages.some((item) => item.id === packageId) ? packageId : (publishedPackages[0]?.id ?? "");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [attested, setAttested] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [operation, setOperation] = useState<Awaited<ReturnType<typeof productizationAgencyApi.createClient>> | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    void queryClient.removeQueries({ queryKey: ["agency", userId] });
    void queryClient.removeQueries({ queryKey: ["product-accounts", userId] });
  }, [queryClient, userId]);

  const createClient = useMutation({
    retry: false,
    mutationFn: () => productizationAgencyApi.createClient(currentAccountId, {
      name: clientName.trim(), description: description.trim(), sourceCompanyId: selectedSourceId,
      sourcePackageId: selectedPackageId, idempotencyKey, attestPublishedPackage: true,
    }),
    onSuccess: async (result) => {
      setOperation(result); setMessage(result.nextStep);
      if (result.status !== "awaiting_capacity") setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: portfolioKey });
      await queryClient.invalidateQueries({ queryKey: operationsKey });
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const resume = useMutation({
    retry: false,
    mutationFn: (operationId: string) => productizationAgencyApi.resume(currentAccountId, operationId),
    onSuccess: async (result) => { setOperation(result); setMessage(result.nextStep); await queryClient.invalidateQueries({ queryKey: portfolioKey }); await queryClient.invalidateQueries({ queryKey: operationsKey }); },
    onError: (error: Error) => setMessage(error.message),
  });
  const sourceName = useMemo(() => companies.find((company) => company.companyId === selectedSourceId)?.name ?? "", [companies, selectedSourceId]);
  const [brandCompanyId, setBrandCompanyId] = useState("");
  const selectedBrandCompanyId = companies.some((company) => company.companyId === brandCompanyId) ? brandCompanyId : (companies[0]?.companyId ?? "");
  const brandKey = ["agency", userId, currentAccountId, selectedBrandCompanyId, "brand"] as const;
  const brandQuery = useQuery({ queryKey: brandKey, queryFn: ({ signal }) => productizationAgencyApi.getBrand(selectedBrandCompanyId, signal), enabled: Boolean(selectedBrandCompanyId) });
  const [brandDraft, setBrandDraft] = useState<{ companyId: string; value: AgencyBrandSettings } | null>(null);
  const currentBrand = (brandDraft?.companyId === selectedBrandCompanyId ? brandDraft.value : null) ?? brandQuery.data ?? null;
  const saveBrand = useMutation({
    retry: false,
    mutationFn: () => productizationAgencyApi.saveBrand(selectedBrandCompanyId, {
      publicEnabled: currentBrand!.publicEnabled, displayName: currentBrand!.displayName,
      primaryColor: currentBrand!.primaryColor, accentColor: currentBrand!.accentColor,
      logoAssetId: currentBrand!.logoAssetId, requestedDomain: currentBrand!.requestedDomain,
    }),
    onSuccess: (saved) => { setBrandDraft({ companyId: selectedBrandCompanyId, value: saved }); void queryClient.invalidateQueries({ queryKey: brandKey }); },
    onError: (error: Error) => setMessage(error.message),
  });
  const [clientUserId, setClientUserId] = useState("");
  const addClientUser = useMutation({
    retry: false,
    mutationFn: () => productizationAgencyApi.addClientUser(selectedBrandCompanyId, clientUserId.trim()),
    onSuccess: () => { setClientUserId(""); setMessage(t("agencyPage.userAdded")); },
    onError: (error: Error) => setMessage(error.message),
  });
  const patchBrand = (patch: Partial<AgencyBrandSettings>) => setBrandDraft({ companyId: selectedBrandCompanyId, value: { ...(currentBrand ?? brandQuery.data!), ...patch } });
  const startNewProvisioningRequest = () => { setOperation(null); setIdempotencyKey(crypto.randomUUID()); };

  return <main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
    <Card>
      <CardHeader><CardTitle>{t("agencyPage.title")}</CardTitle><CardDescription>{t("agencyPage.pageDescription")}</CardDescription></CardHeader>
      <CardContent className="grid gap-4">
        {accounts.isLoading && <p role="status">{t("agencyPage.loadingAccounts")}</p>}
        {accounts.isError && <p role="alert">{t("agencyPage.accountsError")} {accounts.error.message}</p>}
        {!accounts.isLoading && managedAccounts.length === 0 && <p role="status">{t("agencyPage.noManagedAccounts")}</p>}
        {managedAccounts.length > 0 && <label className="grid max-w-xl gap-2 text-sm font-medium">{t("agencyPage.account")}
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={currentAccountId} onChange={(event) => { setAccountId(event.target.value); setOperation(null); }}>
            {managedAccounts.map(({ account }) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>}
      </CardContent>
    </Card>

    {currentAccountId && <>
      <Card><CardHeader><CardTitle>{t("agencyPage.consumption")}</CardTitle><CardDescription>{portfolio.data ? `${new Date(portfolio.data.period.start).toLocaleDateString()} – ${new Date(portfolio.data.period.end).toLocaleDateString()}` : t("agencyPage.recordedUsage")}</CardDescription></CardHeader><CardContent className="grid gap-3">
        {portfolio.isLoading && <p role="status">{t("agencyPage.loadingUsage")}</p>}
        {portfolio.isError && <p role="alert">{t("agencyPage.usageError")} {portfolio.error.message}</p>}
        {portfolio.data && <>
          <p className="text-sm">{t("agencyPage.costLabel")}: <strong>{(portfolio.data.aggregate.costCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}</strong> · {t("agencyPage.costSourceNote")}</p>
          <div className="grid gap-2 md:grid-cols-2">{portfolio.data.companies.map((company) => <div className="flex items-center justify-between gap-3 rounded-md border p-3" key={company.companyId}><span className="min-w-0 truncate">{company.name}</span><span className="text-sm text-muted-foreground">{company.status} · {(company.costCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}</span></div>)}</div>
          <p className="text-sm text-muted-foreground">{t("agencyPage.capacityMetrics")}: {portfolio.data.accountUsage.map((item) => `${item.metric}: ${item.consumed} (${item.periodKey})`).join(" · ") || t("agencyPage.noUsage")}</p>
        </>}
      </CardContent></Card>

      {operations.data && operations.data.length > 0 && <Card><CardHeader><CardTitle>{t("agencyPage.onboarding")}</CardTitle><CardDescription>{t("agencyPage.requesterOperations")}</CardDescription></CardHeader><CardContent className="grid gap-3">{operations.data.map((item) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3" key={item.id}>
        <div className="grid gap-1"><span className="font-medium">{item.companyName}</span><span className="text-sm text-muted-foreground">{operationStatusLabel(item.status)}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          {item.status === "package_ready" && item.packageId && <Button type="button" variant="outline" onClick={() => setOperation(item)}>{t("agencyPage.continueInstall")}</Button>}
          {item.status !== "package_ready" && item.status !== "ready" && <Button type="button" variant="outline" disabled={resume.isPending} onClick={() => resume.mutate(item.id)}>{item.status === "awaiting_capacity" ? t("agencyPage.retryCapacity") : item.status === "creating" ? t("agencyPage.checkStatus") : t("agencyPage.reconcile")}</Button>}
        </div>
      </div>)}</CardContent></Card>}

      <Card><CardHeader><CardTitle>{t("agencyPage.createClient")}</CardTitle><CardDescription>{t("agencyPage.createClientDescription")}</CardDescription></CardHeader><CardContent>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); createClient.mutate(); }}>
          <label className="grid max-w-xl gap-2 text-sm font-medium">{t("agencyPage.sourceCompany")}
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={selectedSourceId} onChange={(event) => { setSourceCompanyId(event.target.value); setPackageId(""); startNewProvisioningRequest(); }}>
              {companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.name}</option>)}
            </select>
          </label>
          <label className="grid max-w-xl gap-2 text-sm font-medium">{t("agencyPage.publishedPackage")}
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={selectedPackageId} onChange={(event) => { setPackageId(event.target.value); startNewProvisioningRequest(); }}>
              {publishedPackages.map((item: AgencyPackageSummary) => <option key={item.id} value={item.id}>{item.name} · {item.packageVersion}</option>)}
            </select>
          </label>
          {packages.isLoading && <p role="status">{t("agencyPage.loadingPackages", { company: sourceName })}</p>}
          {!packages.isLoading && selectedSourceId && publishedPackages.length === 0 && <p role="status">{t("agencyPage.noPublishedPackages")}</p>}
          <label className="grid max-w-xl gap-2 text-sm font-medium">{t("agencyPage.clientCompanyName")}<Input value={clientName} maxLength={120} onChange={(event) => { setClientName(event.target.value); startNewProvisioningRequest(); }} /></label>
          <label className="grid max-w-xl gap-2 text-sm font-medium">{t("agencyPage.description")}<Input value={description} maxLength={2000} onChange={(event) => { setDescription(event.target.value); startNewProvisioningRequest(); }} /></label>
          <label className="flex max-w-3xl items-start gap-2 text-sm"><Checkbox checked={attested} onCheckedChange={(checked) => setAttested(checked === true)} /><span>{t("agencyPage.shareAttestation")}</span></label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("agencyPage.sourceHint", { company: sourceName || t("accountPage.none") })}</p>
            <Button disabled={!currentAccountId || !selectedSourceId || !selectedPackageId || !clientName.trim() || !attested || createClient.isPending || packages.isLoading}>{t("agencyPage.provisionClient")}</Button>
          </div>
        </form>
        {message && <p className="mt-3 text-sm" role="status">{message}</p>}
        {createClient.isError && <p className="mt-2 text-sm text-destructive" role="alert">{createClient.error.message}</p>}
        {operation && <div className="mt-4 grid gap-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2"><Badge variant={operation.status === "awaiting_capacity" ? "secondary" : "default"}>{operationStatusLabel(operation.status)}</Badge><span className="font-medium">{operation.companyName}</span></div>
          {operation.status === "awaiting_capacity" && <Button type="button" variant="outline" disabled={resume.isPending} onClick={() => resume.mutate(operation.id)}>{t("agencyPage.retryCapacityAvailable")}</Button>}
          {operation.status === "package_ready" && operation.packageId && <PackageInstallPanel companyId={operation.companyId} packageId={operation.packageId} />}
          {resume.isError && <p role="alert" className="text-sm text-destructive">{resume.error.message}</p>}
        </div>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>{t("agencyPage.publicBrandAccess")}</CardTitle><CardDescription>{t("agencyPage.publicBrandDescription")}</CardDescription></CardHeader><CardContent className="grid gap-4">
        <label className="grid max-w-xl gap-2 text-sm font-medium">{t("agencyPage.clientCompany")}
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={selectedBrandCompanyId} onChange={(event) => { setBrandCompanyId(event.target.value); }}>
            {companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.name}</option>)}
          </select>
        </label>
        {brandQuery.isLoading && <p role="status">{t("agencyPage.loadingSettings")}</p>}
        {brandQuery.isError && <p role="alert">{t("agencyPage.settingsError")}</p>}
        {currentBrand && <>
          <label className="grid max-w-xl gap-2 text-sm font-medium">{t("agencyPage.publicName")}<Input value={currentBrand.displayName} maxLength={120} onChange={(event) => patchBrand({ displayName: event.target.value })} /></label>
          <div className="flex flex-wrap gap-4">
            <label className="grid gap-2 text-sm font-medium">{t("agencyPage.primaryColor")}<Input type="color" className="w-24" value={currentBrand.primaryColor} onChange={(event) => patchBrand({ primaryColor: event.target.value })} /></label>
            <label className="grid gap-2 text-sm font-medium">{t("agencyPage.secondaryColor")}<Input type="color" className="w-24" value={currentBrand.accentColor} onChange={(event) => patchBrand({ accentColor: event.target.value })} /></label>
          </div>
          <label className="grid max-w-xl gap-2 text-sm font-medium">{t("agencyPage.imageAsset")}<Input value={currentBrand.logoAssetId ?? ""} onChange={(event) => patchBrand({ logoAssetId: event.target.value || null })} /></label>
          <label className="grid max-w-xl gap-2 text-sm font-medium">{t("agencyPage.requestedDomain")}<Input value={currentBrand.requestedDomain ?? ""} onChange={(event) => patchBrand({ requestedDomain: event.target.value || null })} /></label>
          <p className="text-sm text-muted-foreground">{t("agencyPage.domainStatusLine", { status: currentBrand.domainStatus })}</p>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={currentBrand.publicEnabled} onCheckedChange={(checked) => patchBrand({ publicEnabled: checked === true })} />{t("agencyPage.publishBrand")}</label>
          {currentBrand.publicEnabled && <PublicBusinessBrand brand={{ displayName: currentBrand.displayName, primaryColor: currentBrand.primaryColor, accentColor: currentBrand.accentColor, logoUrl: currentBrand.logoUrl, domainStatus: "unavailable" }} />}
          <Button className="w-fit" variant="outline" disabled={saveBrand.isPending || !currentBrand.displayName.trim()} onClick={() => saveBrand.mutate()}>{t("agencyPage.saveBrand")}</Button>
          {saveBrand.isError && <p role="alert" className="text-sm text-destructive">{saveBrand.error.message}</p>}
        </>}
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); addClientUser.mutate(); }}>
          <label className="grid min-w-64 gap-2 text-sm font-medium">{t("agencyPage.userId")}<Input value={clientUserId} onChange={(event) => setClientUserId(event.target.value)} placeholder={t("agencyPage.existingUserId")} /></label>
          <Button variant="outline" disabled={!selectedBrandCompanyId || !clientUserId.trim() || addClientUser.isPending}>{t("agencyPage.grantViewer")}</Button>
        </form>
        <p className="text-sm text-muted-foreground">{t("agencyPage.memberPermissionNote")}</p>
        {addClientUser.isError && <p role="alert" className="text-sm text-destructive">{addClientUser.error.message}</p>}
      </CardContent></Card>
    </>}
  </main>;
}

export default AgencyWorkspace;
