import { useEffect } from "react";
import { Users } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { EmptyState } from "../../components/EmptyState";

// Sprint 2 pista A/K (CRM). Placeholder: detail, contacts, opportunities and memory tab land later.
export function CustomerDetail() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.customers"), href: "/customers" }, { label: t("nav.customers") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={Users} message={t("nav.customers")} />;
}
