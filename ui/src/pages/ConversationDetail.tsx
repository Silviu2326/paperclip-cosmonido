import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation, ConversationMessagePage } from "@paperclipai/shared";
import { MessagesSquare } from "lucide-react";
import { Link, useParams } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { conversationsApi } from "../api/conversations";
import { queryKeys } from "../lib/queryKeys";
import { ConversationActions } from "../components/inbox/ConversationActions";
import { ConversationComposer } from "../components/inbox/ConversationComposer";
import { ConversationThread } from "../components/inbox/ConversationThread";

// Served at /conversations/:conversationId. Same panel the inbox list opens into.
export function ConversationDetail() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const history = useInfiniteQuery({
    queryKey: [...queryKeys.conversations.detail(conversationId ?? ""), "thread"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ConversationMessagePage & { conversation: Conversation | null }> => {
      if (pageParam) return { ...await conversationsApi.messages(conversationId!, pageParam), conversation: null };
      const detail = await conversationsApi.get(conversationId!);
      return { conversation: detail, items: detail.messages, nextCursor: detail.nextMessageCursor };
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!conversationId && !!selectedCompanyId,
  });
  const conversation = history.data?.pages[0]?.conversation;
  const messages = [...new Map(history.data?.pages.toReversed().flatMap((page) => page.items).map((message) => [message.id, message])).values()];

  useEffect(() => {
    setBreadcrumbs([
      { label: t("conversations.title"), href: "/conversations" },
      { label: conversation?.subject || t("conversations.list.noSubject") },
    ]);
  }, [setBreadcrumbs, t, conversation?.subject]);

  async function refresh() {
    setActionError(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId ?? "") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list(selectedCompanyId ?? "") }),
    ]);
  }

  async function sendDraft(messageId: string) {
    setBusy(true);
    try {
      await conversationsApi.send(messageId);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("conversations.errors.send"));
    } finally {
      setBusy(false);
    }
  }

  async function reconcile(messageId: string, outcome?: "sent" | "failed") {
    setBusy(true);
    try {
      await conversationsApi.reconcile(messageId, outcome ? { outcome } : {});
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("conversations.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  if (!selectedCompanyId || !conversationId) {
    return <EmptyState icon={MessagesSquare} message={t("conversations.title")} />;
  }
  if (history.isLoading) return <PageSkeleton variant="list" />;
  if (!conversation) {
    return <EmptyState icon={MessagesSquare} message={t("conversations.detail.notFound")} />;
  }

  const uncertain = messages.filter((m) => m.deliveryStatus === "uncertain");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">
            {conversation.subject || t("conversations.list.noSubject")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(`conversations.channel.${conversation.channel}`)} · {t(`conversations.status.${conversation.status}`)}
          </p>
        </div>
        <Link to="/conversations" className="text-sm text-muted-foreground hover:underline">
          {t("conversations.detail.back")}
        </Link>
      </div>

      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}

      <ConversationActions
        conversation={conversation}
        companyId={selectedCompanyId}
        onChanged={refresh}
        onError={setActionError}
      />

      {uncertain.length > 0 && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <h2 className="text-sm font-medium">{t("conversations.reconcile.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("conversations.reconcile.description")}</p>
          {uncertain.map((message) => (
            <div key={message.id} className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => reconcile(message.id)}>
                {t("conversations.reconcile.check")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => reconcile(message.id, "sent")}>
                {t("conversations.reconcile.markSent")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => reconcile(message.id, "failed")}>
                {t("conversations.reconcile.markFailed")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("conversations.thread.title")}</h2>
        {history.hasNextPage && (
          <Button variant="outline" size="sm" disabled={history.isFetching} onClick={() => void history.fetchNextPage()}>
            {t("conversations.thread.loadOlder")}
          </Button>
        )}
        {history.error && <p role="alert" className="text-sm text-destructive">{t("conversations.thread.loadError")}</p>}
        <ConversationThread
          messages={messages}
          busy={busy}
          onSend={sendDraft}
          onReconcile={(messageId) => reconcile(messageId)}
        />
      </section>

      <ConversationComposer key={conversation.id} conversationId={conversation.id} onChanged={refresh} />
    </div>
  );
}
