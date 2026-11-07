import { useQueries, useQuery } from "@tanstack/react-query";
import type { Conversation } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { conversationsApi } from "../../api/conversations";
import { PageSkeleton } from "../PageSkeleton";

export interface LinkedConversationsProps {
  companyId: string;
  /** Lists conversations of a customer or a contact. Null when the record has neither. */
  filter: { customerId?: string; contactId?: string } | null;
  /** Conversations referenced directly by the record (for example a lead's own conversation). */
  conversationIds?: string[];
}

/** Conversations of a customer or lead, each linking to its inbox detail page. */
export function LinkedConversations({ companyId, filter, conversationIds = [] }: LinkedConversationsProps) {
  const { t } = useTranslation();

  const listQuery = useQuery({
    queryKey: ["crm-linked-conversations", companyId, filter?.customerId ?? null, filter?.contactId ?? null],
    queryFn: () => conversationsApi.list(companyId, { customerId: filter?.customerId, contactId: filter?.contactId, limit: 50 }),
    enabled: Boolean(companyId && filter),
  });

  const pinnedQueries = useQueries({
    queries: conversationIds.map((id) => ({
      queryKey: ["crm-linked-conversation", id],
      queryFn: () => conversationsApi.get(id),
      enabled: Boolean(id),
    })),
  });

  const byId = new Map<string, Conversation>();
  for (const result of pinnedQueries) if (result.data) byId.set(result.data.id, result.data);
  for (const item of listQuery.data?.items ?? []) if (!byId.has(item.id)) byId.set(item.id, item);
  const items = [...byId.values()];

  const loading = listQuery.isLoading || pinnedQueries.some((result) => result.isLoading);
  const failed = listQuery.error || pinnedQueries.some((result) => result.error);

  if (loading) return <PageSkeleton variant="list" />;
  if (failed) return <p className="text-sm text-destructive">{t("crm.conversations.loadError")}</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("crm.conversations.empty")}</p>;

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((conversation) => (
        <li key={conversation.id}>
          <Link to={`/conversations/${conversation.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-muted/40">
            <span className="text-sm font-medium">{conversation.subject ?? t(`crm.conversations.channels.${conversation.channel}`)}</span>
            <span className="text-xs text-muted-foreground">
              {t(`crm.conversations.channels.${conversation.channel}`)} · {t(`crm.conversations.statuses.${conversation.status}`)}
              {conversation.lastMessageAt ? ` · ${new Date(conversation.lastMessageAt).toLocaleString()}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
