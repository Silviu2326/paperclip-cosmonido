import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
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
import { ConversationSetup } from "../components/inbox/ConversationSetup";

// Served at /conversations. /inbox is the task inbox and is not touched here.
type Tab = "all" | "waiting" | "overdue";
const PAGE = 25;

export function ConversationInbox() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [tab, setTab] = useState<Tab>("all");
  const [filters, setFilters] = useState<ConversationFilters>({});

  useEffect(() => {
    setBreadcrumbs([{ label: t("conversations.title") }]);
  }, [setBreadcrumbs, t]);

  const query: ConversationFilters = {
    ...filters,
    limit: PAGE,
    status: tab === "waiting" ? "waiting_us" : filters.status,
    overdue: tab === "overdue" ? true : undefined,
  };

  const { data, isLoading, error, isFetching, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
    queryKey: [...queryKeys.conversations.list(selectedCompanyId ?? ""), query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => conversationsApi.list(selectedCompanyId!, { ...query, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Inbox} message={t("conversations.title")} />;
  }

  const tabs: Tab[] = ["all", "waiting", "overdue"];
  const items = [...new Map(data?.pages.flatMap((page) => page.items).map((conversation) => [conversation.id, conversation])).values()];
  const filtered = tab !== "all" || Object.values(filters).some(Boolean);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t("conversations.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("conversations.description")}</p>
      </div>

      <ConversationSetup key={selectedCompanyId} companyId={selectedCompanyId} />

      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`px-3 py-2 text-sm ${tab === key ? "border-b-2 border-foreground font-medium" : "text-muted-foreground"}`}
            onClick={() => {
              setTab(key);
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
        }}
      />

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : !data && error ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-destructive">{t("conversations.list.loadError")}</p>
          <Button variant="outline" onClick={() => void refetch()}>{t("conversations.setup.retry")}</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} message={t(filtered ? "conversations.list.empty" : "conversations.list.firstMessage")} />
      ) : (
        <div className="space-y-3">
          <ConversationList items={items} />
          {error && <p role="alert" className="text-sm text-destructive">{t("conversations.list.loadError")}</p>}
          {hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void fetchNextPage()}>
                {t("conversations.list.loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
