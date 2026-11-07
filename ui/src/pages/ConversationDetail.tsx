import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation, ConversationMessage, ConversationMessagePage } from "@paperclipai/shared";
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
import { ConversationControls } from "../components/conversations/ConversationControls";
import { ConversationComposer, whatsappWindowRemaining } from "../components/conversations/ConversationComposer";
import { ConversationThread } from "../components/conversations/ConversationThread";
import { ChannelLabel } from "../components/conversations/ChannelLabel";
import { crmApi } from "../api/crm";

// Served at /conversations/:conversationId. Same panel the inbox list opens into.
export function ConversationDetail() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const actionLock = useRef(false);
  const retryDrafts = useRef(new Map<string, ConversationMessage>());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);

  const history = useInfiniteQuery({
    queryKey: [...queryKeys.conversations.detail(conversationId ?? ""), "thread", selectedCompanyId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ConversationMessagePage & { conversation: Conversation | null }> => {
      if (pageParam) return { ...await conversationsApi.messages(conversationId!, pageParam), conversation: null };
      const detail = await conversationsApi.get(conversationId!);
      return { conversation: detail, items: detail.messages, nextCursor: detail.nextMessageCursor };
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!conversationId && !!selectedCompanyId,
    refetchInterval: 30000,
  });
  const conversation = history.data?.pages[0]?.conversation;
  const contact = useQuery({
    queryKey: ["crm", selectedCompanyId, "contact", conversation?.contactId],
    queryFn: () => crmApi.contacts.get(conversation!.contactId!),
    enabled: !!conversation?.contactId && conversation.companyId === selectedCompanyId,
    staleTime: 60000,
  });
  const messages = [...new Map(history.data?.pages.toReversed().flatMap((page) => page.items).map((message) => [message.id, message])).values()];
  const remaining = conversation ? whatsappWindowRemaining(conversation, messages, now) : 0;
  const windowClosed = conversation?.channel === "whatsapp" && remaining <= 0;

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
    if (windowClosed) { setActionError(t("conversationsUx.templateOnly")); return; }
    if (actionLock.current) return;
    actionLock.current = true;
    setActionError(null);
    setBusy(true);
    try {
      await conversationsApi.send(messageId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("conversations.errors.send"));
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId ?? "") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list(selectedCompanyId ?? "") }),
      ]);
      setBusy(false);
      actionLock.current = false;
    }
  }

  async function retryMessage(message: ConversationMessage) {
    if (windowClosed) { setActionError(t("conversationsUx.templateOnly")); return; }
    if (actionLock.current) return;
    actionLock.current = true;
    setActionError(null);
    setBusy(true);
    try {
      const draft = retryDrafts.current.get(message.id) ?? await conversationsApi.draft(conversationId!, { body: message.body, attachments: message.attachments ?? [], idempotencyKey: `retry-${message.id}` });
      retryDrafts.current.set(message.id, draft);
      await conversationsApi.send(draft.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("conversations.errors.send"));
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId ?? "") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list(selectedCompanyId ?? "") }),
      ]);
      setBusy(false);
      actionLock.current = false;
    }
  }

  async function reconcile(messageId: string, outcome?: "sent" | "failed") {
    if (actionLock.current) return;
    actionLock.current = true;
    setActionError(null);
    setBusy(true);
    try {
      await conversationsApi.reconcile(messageId, outcome ? { outcome } : {});
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("conversations.errors.generic"));
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }

  if (!selectedCompanyId || !conversationId) {
    return <EmptyState icon={MessagesSquare} message={t("conversations.title")} />;
  }
  if (history.isLoading) return <PageSkeleton variant="list" />;
  if (!conversation && history.error) return <div className="flex flex-col items-start gap-2"><p role="alert" className="text-sm text-destructive">{t("conversations.thread.loadError")}</p><Button variant="outline" onClick={() => void history.refetch()}>{t("conversations.setup.retry")}</Button></div>;
  if (!conversation) {
    return <EmptyState icon={MessagesSquare} message={t("conversations.detail.notFound")} />;
  }

  const uncertain = messages.filter((m) => m.deliveryStatus === "uncertain" || m.deliveryStatus === "queued");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">
            {contact.data?.displayName || conversation.subject || t("conversations.list.noSubject")}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><ChannelLabel channel={conversation.channel} />{t(`conversations.status.${conversation.status}`)}</div>
        </div>
        <Link to="/conversations" className="text-sm text-muted-foreground hover:underline">
          {t("conversations.detail.back")}
        </Link>
      </div>

      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      {contact.error && <div className="flex items-center gap-2"><p role="alert" className="text-sm text-destructive">{t("conversationsUx.contactsError")}</p><Button size="sm" variant="outline" onClick={() => void contact.refetch()}>{t("conversations.setup.retry")}</Button></div>}

      <ConversationControls
        conversation={conversation}
        companyId={selectedCompanyId}
        onChanged={refresh}
        onError={setActionError}
      />

      {conversation.channel === "whatsapp" && <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">{windowClosed ? t("conversationsUx.windowClosed") : t("conversationsUx.windowOpen", { hours: Math.floor(remaining / 3600000), minutes: Math.floor(remaining / 60000) % 60 })}</p>}

      {uncertain.length > 0 && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <h2 className="text-sm font-medium">{t("conversations.reconcile.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("conversations.reconcile.description")}</p>
          {uncertain.map((message) => (
            <div key={message.id} className="flex flex-wrap items-center justify-end gap-2">
              <p className="min-w-0 flex-1 truncate text-sm">{message.body}</p>
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
        {history.error && <div className="flex items-center gap-2"><p role="alert" className="text-sm text-destructive">{t("conversations.thread.loadError")}</p><Button variant="outline" size="sm" onClick={() => void history.refetch()}>{t("conversations.setup.retry")}</Button></div>}
        <ConversationThread
          messages={messages}
          busy={busy}
          onSend={sendDraft}
          onReconcile={(messageId) => reconcile(messageId)}
          onRetry={retryMessage}
          pending={pending}
          windowClosed={windowClosed}
        />
      </section>

      <ConversationComposer key={conversation.id} conversation={conversation} windowClosed={windowClosed} onChanged={refresh} onPending={setPending} />
    </div>
  );
}
