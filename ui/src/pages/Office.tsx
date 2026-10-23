import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Armchair, MessageSquare, X } from "lucide-react";
import { characterStateForAgent } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import { loadOfficeAtlases, loadOfficeCatalog, OFFICE_CREDITS_URL, type OfficeAtlases, type OfficeCatalog } from "../office/catalog";
import { OfficeCanvas } from "../office/OfficeCanvas";
import { OfficeChat } from "../office/OfficeChat";
import { useOfficeLayout } from "../office/useOfficeLayout";
import { BackToTeamLink } from "../components/team-workspace/TeamWorkspaceLinks";

/** Pixel-art office for the selected company (contract 7). */
export function Office() {
  const { t, i18n } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [chatOpen, setChatOpen] = useState(true);

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.office") }]);
  }, [setBreadcrumbs, t]);

  // Falls back to the built-in catalog when the shipped one is missing or invalid (see loadOfficeCatalog).
  const catalogQuery = useQuery({
    queryKey: ["office", "catalog"] as const,
    queryFn: () => loadOfficeCatalog(),
    staleTime: Infinity,
    retry: false,
  });
  const catalog: OfficeCatalog | null = catalogQuery.data?.catalog ?? null;

  const atlasesQuery = useQuery({
    queryKey: ["office", "atlases", catalogQuery.data?.source] as const,
    queryFn: async (): Promise<OfficeAtlases> => loadOfficeAtlases(catalogQuery.data!.catalog),
    enabled: Boolean(catalog),
    staleTime: Infinity,
    retry: false,
  });

  const agentsQuery = useQuery({
    queryKey: ["agents", selectedCompanyId] as const,
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    refetchInterval: 15000,
  });
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);
  const present = useMemo(() => agents.filter(agent => characterStateForAgent(agent.status) !== "rest").length, [agents]);

  const office = useOfficeLayout(selectedCompanyId, catalog, agents);

  if (!selectedCompanyId) {
    return <EmptyState icon={Armchair} message={t("office.selectCompany")} />;
  }

  const ready = Boolean(catalog && atlasesQuery.data && office.layout);
  const failed = office.loadError || atlasesQuery.isError;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">
            {t("office.title")}{selectedCompany ? ` · ${selectedCompany.name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">{t("office.presentCount", { count: present })}</p>
        </div>
        <div className="flex items-center gap-2">
          <BackToTeamLink />
          <a href={OFFICE_CREDITS_URL} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            {t("office.credits")}
          </a>
          <Button type="button" variant="outline" size="sm" className="md:hidden" onClick={() => setChatOpen(open => !open)} aria-expanded={chatOpen}>
            {chatOpen ? <X /> : <MessageSquare />}
            {chatOpen ? t("office.hideChat") : t("office.showChat")}
          </Button>
        </div>
      </header>

      {failed ? (
        <p className="text-sm text-destructive">{t("office.loadError")}</p>
      ) : !ready ? (
        <PageSkeleton variant="list" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <section className="min-h-0 flex-1">
            <OfficeCanvas layout={office.layout!} catalog={catalog!} atlases={atlasesQuery.data!} agents={agents} />
          </section>
          <aside className={cn("min-h-0 w-full flex-col md:flex md:w-96 md:shrink-0", chatOpen ? "flex" : "hidden")}>
            <OfficeChat companyId={selectedCompanyId} catalog={catalog!} agents={agents} office={office} uiLanguage={i18n.language} />
          </aside>
        </div>
      )}

      {office.saving || office.saveError ? (
        <p className={cn("text-xs", office.saveError ? "text-destructive" : "text-muted-foreground")} role="status">
          {office.saveError ? t("office.saveError") : t("office.saving")}
        </p>
      ) : null}
    </div>
  );
}
