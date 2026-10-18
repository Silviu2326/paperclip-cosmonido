import { useEffect } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { NewAgentSetup } from "../components/new-agent/NewAgentSetup";
import { useTranslation } from "@/i18n";

export function NewAgent() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { t } = useTranslation();
  useEffect(() => {
    setBreadcrumbs([
      { label: t("newAgent.breadcrumbAgents"), href: "/agents" },
      { label: t("newAgent.breadcrumbNew") },
    ]);
  }, [setBreadcrumbs, t]);
  return <NewAgentSetup />;
}
