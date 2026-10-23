import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productizationAccountsApi } from "@/api/productization-accounts";
import { useSearchParams } from "@/lib/router";
import { useAccountIdentity } from "@/api/companies-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectPopover } from "@/components/ui/select";
import { useTranslation } from "@/i18n";
import { SettingsScopeHeader } from "@/components/product-settings/SettingsScopeHeader";

export default function ProductBilling() {
  const { t } = useTranslation();
  const identity = useAccountIdentity();
  if (!identity.settled) return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6"><p role="status">{t("common.loading", { defaultValue: "Loading…" })}</p></main>;
  if (!identity.userId) return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6"><p role="status">{t("productBilling.signIn", { defaultValue: "Sign in to manage billing." })}</p></main>;
  return <BillingForUser key={identity.userId} userId={identity.userId} />;
}

function BillingForUser({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const requestedPlanId = searchParams.get("planId");
  const queryClient = useQueryClient();
  const accountsKey = ["product-accounts", userId] as const;
  const plansKey = ["product-plans", userId] as const;
  useEffect(() => () => {
    void queryClient.removeQueries({ queryKey: accountsKey });
    void queryClient.removeQueries({ queryKey: ["product-account", userId] });
    void queryClient.removeQueries({ queryKey: ["product-billing-status", userId] });
    void queryClient.removeQueries({ queryKey: plansKey });
  }, [queryClient, userId]);
  const accounts = useQuery({ queryKey: accountsKey, queryFn: productizationAccountsApi.list });
  const plans = useQuery({ queryKey: plansKey, queryFn: productizationAccountsApi.plans });
  const preparedPlan = useRef<string | null>(null);
  const prepare = useMutation({ mutationFn: (planId: string) => productizationAccountsApi.prepareSignupPlan(planId), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: accountsKey }); } });
  useEffect(() => {
    if (!requestedPlanId || !accounts.data || accounts.data.length || prepare.isPending || preparedPlan.current === requestedPlanId) return;
    if (!plans.data?.some(plan => plan.id === requestedPlanId && plan.enabled)) return;
    preparedPlan.current = requestedPlanId;
    prepare.mutate(requestedPlanId);
  }, [requestedPlanId, accounts.data, plans.data, prepare.isPending]);

  return <main className="mx-auto grid w-full max-w-4xl gap-4 p-6"><SettingsScopeHeader scope="account" description={t("uxSettings.billing.scope", { defaultValue: "Subscription, invoices and limits belong to each commercial account listed below, not to your user or one company. Manage who belongs to an account and which companies it covers in Accounts." })} links={[{ to: "/company/settings/accounts", label: t("uxSettings.billing.accountsLink", { defaultValue: "Commercial accounts" }) }]} /><Card><CardHeader><CardTitle>{t("productBilling.title", { defaultValue: "Paperclip billing" })}</CardTitle><CardDescription>{t("productBilling.description", { defaultValue: "Product subscription and limits for commercial accounts. Model and provider costs remain under each company’s Costs." })}</CardDescription></CardHeader><CardContent>
    {prepare.isError && <div role="alert" className="flex items-center gap-2 text-sm text-destructive"><span>{t("productBilling.prepareError", { defaultValue: "Could not prepare the selected plan." })}</span><Button variant="outline" onClick={() => { preparedPlan.current = null; prepare.reset(); if (requestedPlanId) { preparedPlan.current = requestedPlanId; prepare.mutate(requestedPlanId); } }}>{t("productBilling.retry", { defaultValue: "Retry" })}</Button></div>}
    {accounts.isLoading || (requestedPlanId && prepare.isPending) ? <p role="status">{t("common.loading", { defaultValue: "Loading…" })}</p> : accounts.isError ? <p role="alert">{t("productBilling.loadError", { defaultValue: "Could not load billing." })}</p> : accounts.data?.length ? <div className="grid gap-3">{accounts.data.map(({ account, role }) => <BillingAccount key={account.id} userId={userId} account={account} role={role} plans={plans.data ?? []} />)}</div> : <p className="text-sm text-muted-foreground">{t("productBilling.empty", { defaultValue: "Create a commercial account before configuring billing." })}</p>}
  </CardContent></Card></main>;
}

function BillingAccount({ userId, account, role, plans }: { userId: string; account: { id: string; name: string; planId: string; access: string; trialStartedAt?: string | null; trialExpiresAt?: string | null }; role: string; plans: Array<{ id: string; name: string; checkoutAvailable: boolean; trialAvailable?: boolean }> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["product-account", userId, account.id], queryFn: () => productizationAccountsApi.get(account.id) });
  const billing = useQuery({ queryKey: ["product-billing-status", userId, account.id], queryFn: () => productizationAccountsApi.billingStatus(account.id), enabled: Boolean(data.data?.billingConfigured), retry: false });
  const [planId, setPlanId] = useState("");
  const [trialError, setTrialError] = useState<string | null>(null);
  const trial = useMutation({ mutationFn: () => productizationAccountsApi.startTrial(account.id), onSuccess: async () => { setTrialError(null); await queryClient.invalidateQueries({ queryKey: ["product-accounts", userId] }); await queryClient.invalidateQueries({ queryKey: ["product-account", userId, account.id] }); }, onError: error => setTrialError(error instanceof Error ? error.message : t("productBilling.trialError", { defaultValue: "Could not start trial." })) });
  const scopeCurrent = useRef(true);
  useEffect(() => {
    scopeCurrent.current = true;
    return () => { scopeCurrent.current = false; };
  }, [userId, account.id]);
  const open = async (fn: () => Promise<{ url: string }>) => {
    try {
      const result = await fn();
      if (!scopeCurrent.current) return;
      window.location.assign(result.url);
    } catch (error) {
      if (!scopeCurrent.current) return;
      alert(error instanceof Error ? error.message : t("productBilling.openError", { defaultValue: "Could not open billing." }));
    }
  };
  const selected = planId || account.planId;
  const status = billing.data;
  const confirmationLabel = status?.confirmation === "confirmed"
    ? `${status.subscription.planName} · ${status.subscription.status}${status.subscription.cancelAtPeriodEnd ? ` · ${t("productBilling.cancellationScheduled", { defaultValue: "cancellation scheduled" })}` : ""}`
    : status?.confirmation === "awaiting_checkout" ? t("productBilling.confirmation.noSubscription", { defaultValue: "No confirmed subscription yet" })
      : status?.confirmation === "awaiting_subscription" ? t("productBilling.confirmation.waiting", { defaultValue: "Waiting for Stripe subscription confirmation" })
        : status?.confirmation === "unconfirmed" ? t("productBilling.confirmation.unmatched", { defaultValue: "Stripe state could not be matched to this account" })
          : data.data?.billingConfigured ? t("productBilling.confirmation.loading", { defaultValue: "Loading confirmed billing state" }) : t("productBilling.confirmation.unconfigured", { defaultValue: "Billing not configured" });
  const periodEnd = status?.confirmation === "confirmed" && status.subscription.currentPeriodEnd
    ? new Date(status.subscription.currentPeriodEnd).toLocaleDateString()
    : null;
  return <section className="grid gap-3 rounded-md border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">{account.name}</h2><p className="text-sm text-muted-foreground">{confirmationLabel} · {t("productBilling.accessLabel", { defaultValue: "access" })} {status?.access ?? account.access}{periodEnd ? ` · ${t("productBilling.periodEnds", { defaultValue: "period ends" })} ${periodEnd}` : ""}</p><p className="text-sm text-muted-foreground">{data.data?.usage.map(metric => `${metric.metric}: ${metric.consumed}`).join(" · ") || t("productBilling.noUsage", { defaultValue: "No recorded usage" })}</p>{billing.isError && <p role="alert" className="text-sm text-destructive">{billing.error.message}</p>}</div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void billing.refetch()} disabled={!data.data?.billingConfigured || billing.isFetching}>{t("productBilling.refreshConfirmed", { defaultValue: "Refresh confirmed state" })}</Button>{role !== "member" && status?.portalAvailable && <Button onClick={() => void open(() => productizationAccountsApi.portal(account.id))}>{t("productBilling.managePlan", { defaultValue: "Manage plan, cancellation and payment" })}</Button>}</div>
    </div>
    {account.access === "trial_eligible" && account.trialExpiresAt && <p className="text-sm">{t("productBilling.trialEnds", { defaultValue: "Trial access ends {{date}}.", date: new Date(account.trialExpiresAt).toLocaleDateString() })}</p>}
    {role === "owner" && account.access !== "trial_eligible" && !account.trialStartedAt && plans.find(plan => plan.id === account.planId)?.trialAvailable && <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground">{t("productBilling.trialVerificationRequired", { defaultValue: "Start a trial after verifying the account email." })}</p><Button variant="outline" disabled={trial.isPending} onClick={() => trial.mutate()}>{trial.isPending ? t("productBilling.startingTrial", { defaultValue: "Starting…" }) : t("productBilling.startTrial", { defaultValue: "Start trial" })}</Button></div>}
    {trialError && <p role="alert" className="text-sm text-destructive">{trialError}</p>}
    {role !== "member" && status?.confirmation === "awaiting_checkout" && status.checkoutAvailable && <div className="flex flex-wrap items-center gap-2"><SelectPopover aria-label={t("productBilling.selectPlanFor", { defaultValue: "Plan for {{name}}", name: account.name })} value={selected} onValueChange={setPlanId} placeholder={t("productBilling.selectPlan", { defaultValue: "Select a plan" })} options={plans.map(plan => ({ value: plan.id, label: plan.name, suffix: plan.checkoutAvailable ? undefined : <span className="text-muted-foreground">{t("productBilling.notAvailable", { defaultValue: "Unavailable" })}</span> }))} /><Button variant="outline" disabled={!plans.some(plan => plan.id === selected && plan.checkoutAvailable)} onClick={() => void open(() => productizationAccountsApi.checkout(account.id, selected))}>{t("productBilling.choosePlan", { defaultValue: "Choose plan" })}</Button></div>}
    {status?.confirmation === "confirmed" && status.invoices.length > 0 && <div className="grid gap-2"><h3 className="text-sm font-medium">{t("productBilling.invoices", { defaultValue: "Invoices" })}</h3>{status.invoices.map(invoice => <p key={invoice.id} className="text-sm text-muted-foreground">{invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : invoice.id} · {invoice.status}{invoice.amountPaid !== null && invoice.currency ? ` · ${invoice.amountPaid} ${invoice.currency.toUpperCase()} ${t("productBilling.minorUnits", { defaultValue: "minor units" })}` : ""}{invoice.hostedUrl && <> · <a className="underline" href={invoice.hostedUrl} target="_blank" rel="noreferrer">{t("productBilling.openInvoice", { defaultValue: "Open invoice" })}</a></>}</p>)}</div>}
    {status?.confirmation === "confirmed" && status.invoices.length === 0 && <p className="text-sm text-muted-foreground">{t("productBilling.noConfirmedInvoices", { defaultValue: "No confirmed invoices." })}</p>}
  </section>;
}
