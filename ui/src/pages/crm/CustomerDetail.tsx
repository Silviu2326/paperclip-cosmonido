import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Users } from "lucide-react";
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
import { CustomerOpportunitiesTab } from "../../components/crm/CustomerOpportunitiesTab";
import { ActivityTimeline } from "../../components/crm/ActivityTimeline";
import { LinkedConversations } from "../../components/crm/LinkedConversations";
import { useCompany } from "../../context/CompanyContext";
import { CustomerPortalSettings } from "../CustomerPortalSettings";
import { ExternalReview } from "../ExternalReview";
import { externalReviewApi } from "../../api/external-review";
import { useAccountIdentity } from "../../api/companies-query";
import { ServiceAgreements } from "../ServiceAgreements";
import { AccentPill, MUTED, PartyAvatar, useHealthMeta } from "../../components/crm/CustomerListParts";
import { accentTint } from "../../lib/accent";

export function CustomerDetail() {
  const { customerId = "" } = useParams<{ customerId: string }>();
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const identity = useAccountIdentity();
  const healthMeta = useHealthMeta();
  const [tab, setTab] = useState("summary");

  const customerQuery = useQuery({
    queryKey: queryKeys.customers.detail(customerId),
    queryFn: () => crmApi.customers.get(customerId),
    enabled: !!customerId,
  });
  const customer = customerQuery.data;
  const reviewDeliverables = useInfiniteQuery({
    queryKey: ["external-review-deliverables", customer?.companyId ?? "", customer?.id ?? customerId, identity.userId ?? "anonymous"],
    queryFn: ({ pageParam }) => externalReviewApi.deliverables(customer!.companyId, customer!.id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(customer && selectedCompanyId === customer.companyId && identity.userId),
  });
  const deliverables = reviewDeliverables.data?.pages.flatMap((page) => page.items) ?? [];

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
  const health = healthMeta(customer.health);
  const accent = archived ? MUTED : health.color;

  return (
    <div className="space-y-4">
      <Link to="/customers" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t("crm.customers.allCustomers")}
      </Link>

      <header
        className="relative flex flex-wrap items-start gap-4 overflow-hidden rounded-2xl border p-5"
        style={{ borderColor: `color-mix(in oklab, ${accent} 30%, var(--border))`, background: `radial-gradient(120% 140% at 0% 0%, ${accentTint(accent, 13)}, transparent 55%), var(--card)` }}
      >
        <span aria-hidden="true" className="absolute left-5 top-0 h-0.5 w-10 rounded-b-full" style={{ background: accent }} />
        <PartyAvatar name={customer.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {customer.domain ?? (customer.kind === "person" ? t("uxCrm.list.person", { defaultValue: "Persona" }) : t("crm.customers.noDomain"))}
            {" · "}
            {t("uxCrm.list.customerSince", { date: new Date(customer.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }), defaultValue: "cliente desde {{date}}" })}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {archived ? <AccentPill color={MUTED}>{t("crm.customers.archivedBadge")}</AccentPill> : <AccentPill color={health.color} strong>{health.label}</AccentPill>}
            {customer.tags.map((tag) => <AccentPill key={tag} color={MUTED}>{tag}</AccentPill>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={archive.isPending} onClick={() => archive.mutate(archived ? "active" : "archived")}>
            {archived ? t("crm.customers.restore") : t("crm.customers.archive")}
          </Button>
          {!archived && (
            <Button asChild>
              <Link to={`/sales/proposals?customerId=${encodeURIComponent(customer.id)}`}>
                <FileText className="h-4 w-4" />
                {t("uxCrm.customerProposals", { defaultValue: "Proposals" })}
              </Link>
            </Button>
          )}
        </div>
      </header>
      {archive.error && <p className="text-sm text-destructive">{t("crm.customers.updateError")}</p>}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="max-w-full overflow-x-auto">
        <TabsList>
          <TabsTrigger value="summary">{t("crm.customers.summaryTab")}</TabsTrigger>
          <TabsTrigger value="contacts">{t("crm.customers.contactsTab")}</TabsTrigger>
          <TabsTrigger value="opportunities">{t("crm.customers.opportunitiesTab")}</TabsTrigger>
          <TabsTrigger value="activity">{t("crm.customers.activityTab")}</TabsTrigger>
          <TabsTrigger value="conversations">{t("crm.customers.conversationsTab")}</TabsTrigger>
          <TabsTrigger value="services">{t("uxCrm.services", { defaultValue: "Services" })}</TabsTrigger>
          <TabsTrigger value="memory">{t("crm.customers.memoryTab")}</TabsTrigger>
          <TabsTrigger value="portal">{t("crm.customers.portalTab", { defaultValue: "Portal de cliente" })}</TabsTrigger>
          <TabsTrigger value="review">{t("externalReview.title", { defaultValue: "Revisión por el cliente" })}</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="summary" className="pt-4">
          <CustomerSummary customer={customer} />
        </TabsContent>

        <TabsContent value="contacts" className="pt-4">
          {selectedCompanyId && <CustomerContactsTab companyId={selectedCompanyId} customerId={customer.id} />}
        </TabsContent>

        <TabsContent value="opportunities" className="pt-4">
          <CustomerOpportunitiesTab companyId={customer.companyId} customerId={customer.id} />
        </TabsContent>

        <TabsContent value="activity" className="pt-4">
          <ActivityTimeline companyId={customer.companyId} subjectKind="customer" subjectId={customer.id} />
        </TabsContent>

        <TabsContent value="conversations" className="pt-4">
          <LinkedConversations companyId={customer.companyId} filter={{ customerId: customer.id }} />
        </TabsContent>

        <TabsContent value="services" className="pt-4">
          <ServiceAgreements customerId={customer.id} />
        </TabsContent>

        <TabsContent value="memory" className="pt-4">
          <CustomerMemory customerId={customer.id} />
        </TabsContent>
        <TabsContent value="portal" className="pt-4">
          {customer.companyId === selectedCompanyId && <CustomerPortalSettings companyId={customer.companyId} customerId={customer.id} />}
        </TabsContent>
        <TabsContent value="review" className="pt-4">
          {customer.companyId === selectedCompanyId ? (
            <ExternalReview
                key={`${customer.companyId}:${customer.id}:${identity.userId ?? "anonymous"}`}
              companyId={customer.companyId}
              customerId={customer.id}
              deliverables={deliverables}
              onLoadMore={() => reviewDeliverables.fetchNextPage()}
              hasMore={reviewDeliverables.hasNextPage}
              loadingMore={reviewDeliverables.isFetchingNextPage}
              deliverablesError={reviewDeliverables.error instanceof Error ? reviewDeliverables.error.message : null}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
