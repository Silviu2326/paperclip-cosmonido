import { useEffect } from "react";
import { Link2 } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { DecisionModelSettingsSection } from "../components/decision-models/DecisionModelSettings";
import { FastResponseSettingsSection } from "../components/fast-responses/FastResponseSettings";
import { useFastResponsesEnabled } from "../hooks/useFastResponsesEnabled";
import { Navigate } from "@/lib/router";
import { useTranslation } from "@/i18n";

export function CompanyConnections() {
  const { t } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { enabled, loaded } = useFastResponsesEnabled();

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("companyConnections.companyFallback"), href: "/dashboard" },
      { label: t("companyConnections.settings"), href: "/company/settings" },
      { label: t("companyConnections.breadcrumb") },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name, t]);

  if (!loaded) return null;
  if (!enabled) return <Navigate to="/company/settings" replace />;

  if (!selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("companyConnections.noCompany")}
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t("companyConnections.heading")}</h1>
      </div>
      <DecisionModelSettingsSection key={selectedCompanyId} companyId={selectedCompanyId} />
      <div className="max-w-2xl border-t border-border pt-8">
        <FastResponseSettingsSection key={`fast-${selectedCompanyId}`} companyId={selectedCompanyId} />
      </div>
    </div>
  );
}
