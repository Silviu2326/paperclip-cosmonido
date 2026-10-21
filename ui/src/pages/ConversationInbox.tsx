import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { conversationsApi, type ConversationFilters } from "../api/conversations";
import { queryKeys } from "../lib/queryKeys";
import { ConversationFilterBar } from "../components/inbox/ConversationFilters";
import { ConversationList } from "../components/inbox/ConversationList";

// Served at /conversations. /inbox is the task inbox and is not touched here.
type Tab = "all" | "waiting" | "overdue";
const PAGE = 25;
const MAX_LIMIT = 100;

export function ConversationInbox() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [tab, setTab] = useState<Tab>("all");
  const [filters, setFilters] = useState<ConversationFilters>({});
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    setBreadcrumbs([{ label: t("conversations.title") }]);
  }, [setBreadcrumbs, t]);

  const query: ConversationFilters = {
    ...filters,
    limit,
    status: tab === "waiting" ? "waiting_us" : filters.status,
    overdue: tab === "overdue" ? true : undefined,
  };

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: [...queryKeys.conversations.list(selectedCompanyId ?? ""), query],
    queryFn: () => conversationsApi.list(selectedCompanyId!, query),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Inbox} message={t("conversations.title")} />;
  }

  const tabs: Tab[] = ["all", "waiting", "overdue"];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t("conversations.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("conversations.description")}</p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`px-3 py-2 text-sm ${tab === key ? "border-b-2 border-foreground font-medium" : "text-muted-foreground"}`}
            onClick={() => {
              setTab(key);
              setLimit(PAGE);
            }}
          >
            {t(`conversations.tabs.${key}`)}
          </button>
        ))}
      </div>

      <ConversationFilterBar
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setLimit(PAGE);
        }}
      />

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">{t("conversations.list.loadError")}</p>
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={Inbox} message={t("conversations.list.empty")} />
      ) : (
        <div className="space-y-3">
          <ConversationList items={data.items} />
          {data.nextCursor && limit < MAX_LIMIT && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" disabled={isFetching} onClick={() => setLimit(Math.min(limit + PAGE, MAX_LIMIT))}>
                {t("conversations.list.loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
