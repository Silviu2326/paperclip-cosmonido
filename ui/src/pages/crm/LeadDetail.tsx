import { useEffect } from "react";
import { UserPlus } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { EmptyState } from "../../components/EmptyState";

// Sprint 2 pista B (Leads). Placeholder: lead detail and convert action land with the leads track.
export function LeadDetail() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.leads"), href: "/leads" }, { label: t("nav.leads") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={UserPlus} message={t("nav.leads")} />;
}
