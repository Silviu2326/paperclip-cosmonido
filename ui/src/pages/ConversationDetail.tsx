import { useEffect } from "react";
import { MessagesSquare } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";

// Sprint 2 pista C (Bandeja). Placeholder: thread view and composer land with the inbox track.
export function ConversationDetail() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.inbox"), href: "/conversations" }, { label: t("nav.inbox") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={MessagesSquare} message={t("nav.inbox")} />;
}
