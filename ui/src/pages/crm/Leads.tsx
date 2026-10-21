import { useEffect } from "react";
import { UserPlus } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { EmptyState } from "../../components/EmptyState";

// Sprint 2 pista B (Leads). Placeholder: real list lands with the leads track.
export function Leads() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.leads") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={UserPlus} message={t("nav.leads")} />;
}
