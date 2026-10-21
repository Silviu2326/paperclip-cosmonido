import { useEffect } from "react";
import { Unplug } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";

// Sprint 2 pistas D/E (canales). Placeholder: channel settings land with the channels track.
// Not routed yet: the settings entry point is decided at integration.
export function ChannelsSettings() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.settings") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={Unplug} message={t("nav.settings")} />;
}
