import { useEffect } from "react";
import { UserRound } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { EmptyState } from "../../components/EmptyState";

// Sprint 2 pista A (CRM). Placeholder: real list lands with the CRM track.
export function Contacts() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.contacts") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={UserRound} message={t("nav.contacts")} />;
}
