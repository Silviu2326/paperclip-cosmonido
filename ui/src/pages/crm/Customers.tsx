import { useEffect } from "react";
import { Users } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { EmptyState } from "../../components/EmptyState";

// Sprint 2 pista A (CRM). Placeholder: real list lands with the CRM track.
export function Customers() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.customers") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={Users} message={t("nav.customers")} />;
}
