import { useEffect } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";

// Sprint 2 pista H (Agenda). Placeholder: calendar view lands with the calendar track.
export function Schedule() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.schedule") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={CalendarDays} message={t("nav.schedule")} />;
}
