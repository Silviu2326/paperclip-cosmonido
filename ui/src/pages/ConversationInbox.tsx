import { useEffect } from "react";
import { Inbox } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";

// Sprint 2 pista C (Bandeja de conversaciones). Served at /conversations: /inbox already
// belongs to the task inbox. Placeholder: list lands with the inbox track.
export function ConversationInbox() {
  useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.inbox") }]);
  }, [setBreadcrumbs, t]);

  return <EmptyState icon={Inbox} message={t("nav.inbox")} />;
}
