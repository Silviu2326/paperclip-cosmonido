import { useQuery } from "@tanstack/react-query";
import { productizationAccountsApi } from "@/api/productization-accounts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n";

export default function Pricing() {
  const { t } = useTranslation();
  const plans = useQuery({ queryKey: ["product-plans", "public"], queryFn: productizationAccountsApi.plans, retry: false });
  return <main className="mx-auto grid w-full max-w-5xl gap-6 p-6">
    <header className="grid gap-2"><h1 className="text-2xl font-semibold">{t("productBilling.pricingTitle", { defaultValue: "Plans for Paperclip" })}</h1><p className="max-w-2xl text-sm text-muted-foreground">{t("productBilling.pricingDescription", { defaultValue: "Choose a configured plan. Prices are shown by the billing provider at checkout; no price is implied here." })}</p></header>
    {plans.isLoading ? <p role="status">{t("common.loading", { defaultValue: "Loading…" })}</p> : plans.isError ? <p role="alert">{t("productBilling.plansError", { defaultValue: "Plans could not be loaded. Please try again later." })}</p> : plans.data?.length ? <div className="grid gap-4 md:grid-cols-2">{plans.data.map(plan => <Card key={plan.id}>
      <CardHeader><CardTitle>{plan.name}</CardTitle><CardDescription>{t("productBilling.planLimits", { defaultValue: "Configured account limits" })}</CardDescription></CardHeader>
      <CardContent className="grid gap-4"><dl className="grid gap-2 text-sm">{Object.entries(plan.limits).map(([key, value]) => <div key={key} className="flex justify-between gap-4"><dt className="text-muted-foreground">{key}</dt><dd>{value === null ? t("productBilling.unlimited", { defaultValue: "Unlimited" }) : value}</dd></div>)}</dl>
        {plan.trialAvailable && plan.trialDays ? <p className="text-sm">{t("productBilling.trialOffer", { defaultValue: "Eligible accounts can start a {{days}}-day trial after email verification.", days: plan.trialDays })}</p> : <p className="text-sm text-muted-foreground">{t("productBilling.trialUnavailable", { defaultValue: "A trial is not currently configured." })}</p>}
        <p className="text-sm text-muted-foreground">{plan.checkoutAvailable ? t("productBilling.checkoutConfigured", { defaultValue: "Checkout is configured for this plan." }) : t("productBilling.checkoutUnavailable", { defaultValue: "Checkout is not configured for this plan." })}</p>
        <Button asChild><a href={`/signup?planId=${encodeURIComponent(plan.id)}&next=${encodeURIComponent(`/billing?planId=${plan.id}`)}`}>{t("productBilling.getStarted", { defaultValue: "Get started" })}</a></Button>
      </CardContent>
    </Card>)}</div> : <p className="text-sm text-muted-foreground">{t("productBilling.noPlans", { defaultValue: "No plans are currently available." })}</p>}
    <p className="text-xs text-muted-foreground">{t("productBilling.costsNote", { defaultValue: "Product subscription limits are separate from agent model and provider costs." })}</p>
  </main>;
}
