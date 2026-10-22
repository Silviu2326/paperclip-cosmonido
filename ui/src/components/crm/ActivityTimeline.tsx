import { useInfiniteQuery } from "@tanstack/react-query";
import type { CrmSubjectKind } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { crmApi } from "../../api/crm";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "../PageSkeleton";

/** Timeline of crm_activities for one subject, newest first, loaded page by page. */
export function ActivityTimeline({
  companyId,
  subjectKind,
  subjectId,
}: {
  companyId: string;
  subjectKind: CrmSubjectKind;
  subjectId: string;
}) {
  const { t } = useTranslation();
  const query = useInfiniteQuery({
    queryKey: ["crm", "activities", companyId, subjectKind, subjectId],
    queryFn: ({ pageParam }) =>
      crmApi.activities.list(companyId, { subjectKind, subjectId, cursor: pageParam ?? undefined, limit: 25 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(companyId && subjectId),
  });

  if (query.isLoading) return <PageSkeleton variant="list" />;
  if (query.error) return <p className="text-sm text-destructive">{t("crm.activities.loadError")}</p>;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("crm.activities.empty")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-0.5 border-l border-border pl-3">
            <span className="text-xs text-muted-foreground">
              {t(`crm.activities.kinds.${item.kind}`)} · {new Date(item.occurredAt).toLocaleString()}
            </span>
            <span className="text-sm">{item.summary}</span>
          </li>
        ))}
      </ol>
      {query.hasNextPage && (
        <Button size="sm" variant="outline" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {t("crm.activities.more")}
        </Button>
      )}
    </div>
  );
}
