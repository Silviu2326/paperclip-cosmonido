import { useEffect } from "react";
import { Handshake } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { EmptyState } from "../../components/EmptyState";

// Sprint 2 pista A (CRM). Placeholder: pipeline board lands with the CRM track.
export function Opportunities() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.opportunities") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={Handshake} message={t("nav.opportunities")} />;
}
