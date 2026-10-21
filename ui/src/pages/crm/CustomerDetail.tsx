import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Link, useParams } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { crmApi } from "../../api/crm";
import { ApiError } from "../../api/client";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { queryKeys } from "../../lib/queryKeys";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerSummary } from "../../components/crm/CustomerSummary";
import { CustomerContactsTab } from "../../components/crm/CustomerContactsTab";
import { CustomerMemory } from "../../components/crm/CustomerMemory";
import { useCompany } from "../../context/CompanyContext";

export function CustomerDetail() {
  const { customerId = "" } = useParams<{ customerId: string }>();
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("summary");

  const customerQuery = useQuery({
    queryKey: queryKeys.customers.detail(customerId),
    queryFn: () => crmApi.customers.get(customerId),
    enabled: !!customerId,
  });
  const customer = customerQuery.data;

  useEffect(() => {
    setBreadcrumbs([
      { label: t("nav.customers"), href: "/customers" },
      { label: customer?.name ?? t("nav.customers") },
    ]);
  }, [setBreadcrumbs, t, customer?.name]);

  const archive = useMutation({
    mutationFn: (status: "active" | "archived") => crmApi.customers.update(customerId, { status }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.customers.detail(customerId), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.list(updated.companyId) });
    },
  });

  if (customerQuery.isLoading) return <PageSkeleton variant="detail" />;

  if (customerQuery.error) {
    const err = customerQuery.error;
    const message =
      err instanceof ApiError && err.status === 404
        ? t("crm.customers.notFound")
        : err instanceof ApiError && err.status === 403
          ? t("crm.customers.forbidden")
          : t("crm.customers.loadError");
    return <EmptyState icon={Users} message={message} />;
  }

  if (!customer) return <EmptyState icon={Users} message={t("crm.customers.notFound")} />;

  const archived = customer.status === "archived";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{customer.name}</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={archive.isPending}
            onClick={() => archive.mutate(archived ? "active" : "archived")}
          >
            {archived ? t("crm.customers.restore") : t("crm.customers.archive")}
          </Button>
          <Link to="/customers" className="text-sm text-muted-foreground hover:underline">
            {t("crm.customers.allCustomers")}
          </Link>
        </div>
      </div>
      {archive.error && <p className="text-sm text-destructive">{t("crm.customers.updateError")}</p>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="summary">{t("crm.customers.summaryTab")}</TabsTrigger>
          <TabsTrigger value="contacts">{t("crm.customers.contactsTab")}</TabsTrigger>
          <TabsTrigger value="opportunities">{t("crm.customers.opportunitiesTab")}</TabsTrigger>
          <TabsTrigger value="activity">{t("crm.customers.activityTab")}</TabsTrigger>
          <TabsTrigger value="memory">{t("crm.customers.memoryTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="pt-4">
          <CustomerSummary customer={customer} />
        </TabsContent>

        <TabsContent value="contacts" className="pt-4">
          {selectedCompanyId && <CustomerContactsTab companyId={selectedCompanyId} customerId={customer.id} />}
        </TabsContent>

        <TabsContent value="opportunities" className="pt-4">
          <p className="text-sm text-muted-foreground">{t("crm.customers.placeholderOpportunities")}</p>
        </TabsContent>

        <TabsContent value="activity" className="pt-4">
          <p className="text-sm text-muted-foreground">{t("crm.customers.placeholderActivity")}</p>
        </TabsContent>

        <TabsContent value="memory" className="pt-4">
          <CustomerMemory customerId={customer.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
