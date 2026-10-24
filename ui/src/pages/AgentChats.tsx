import { usePrimaryAgentPresentation } from "@/components/primary-agent/PrimaryAgentPresentation";
import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { MessageCircle } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useAgentChatNavigation, useOpenAgentChat } from "@/hooks/useAgentChatNavigation";
import { recordedAgentChatIssueId, useRecentAgentChats } from "@/lib/recent-agent-chats";
import { Link, useNavigate } from "@/lib/router";
import { useDialogActions } from "@/context/DialogContext";
import { ApiError } from "@/api/client";
import { ChatLoadError, ChatNoAccess, ChatNoAgents, ChatNoSelection } from "@/components/chat/ChatStates";
import { agentRouteRef } from "@/lib/utils";

export function AgentChats() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { companyId, userId, enabled, loaded, agents, chats, session } = useAgentChatNavigation();
  useEffect(() => setBreadcrumbs([{ label: t("agentChats.breadcrumb") }]), [setBreadcrumbs, t]);
  return <AgentChatsContent key={`${companyId}:${userId}`} companyId={companyId} userId={userId}
    enabled={enabled} loaded={loaded} agents={agents} chats={chats} session={session} />;
}

function AgentChatsContent({ companyId, userId, enabled, loaded, agents, chats, session }: Pick<ReturnType<typeof useAgentChatNavigation>, "companyId" | "userId" | "enabled" | "loaded" | "agents" | "chats" | "session">) {
  const { t } = useTranslation();
  const primary = usePrimaryAgentPresentation(companyId);
  const { openNewAgent } = useDialogActions();
  const openChat = useOpenAgentChat(companyId, userId);
  const navigate = useNavigate();
  const recentIds = useRecentAgentChats(companyId ?? "", userId);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const blockingError = agents.error ?? session.error;
  const firstId = recentIds[0];
  const firstAgent = agents.data?.find(agent => agent.id === firstId);
  // An empty chat with an active agent can reopen from the roster alone. A
  // missing agent or a saved issue needs history to validate that visit.
  const needsHistory = !!firstId && (!firstAgent || !!recordedAgentChatIssueId(companyId ?? "", userId, firstId));
  const resolvingRecent = recentIds.length > 0 && !blockingError && (!agents.isFetched || !session.isFetched || (needsHistory && !chats.isFetched && !chats.error));
  const recentChatPath = loaded && enabled && companyId && !blockingError && !resolvingRecent
    ? recentIds.map(id => {
      const agent = agents.data?.find(item => item.id === id);
      const historyIssue = chats.data?.find(chat => chat.conversationAgentId === id);
      const savedIssueId = recordedAgentChatIssueId(companyId, userId, id);
      // A deleted or inaccessible issue must not silently reopen as a new chat.
      if (savedIssueId && chats.isSuccess && historyIssue?.id !== savedIssueId) return null;
      if (agent) return `/chats/${encodeURIComponent(agentRouteRef(agent))}`;
      if (historyIssue) return `/chats/${encodeURIComponent(id)}`;
      return null;
    }).find((path): path is string => path !== null)
    : undefined;
  const primaryAgent = agents.data?.find(agent => agent.id === primary?.primaryAgentId
    && agent.status !== "terminated" && agent.status !== "pending_approval");
  const entryPath = recentChatPath ?? (loaded && enabled && !blockingError && !resolvingRecent
    && agents.isFetched && session.isFetched && !primary?.loading && primaryAgent
    ? `/chats/${encodeURIComponent(agentRouteRef(primaryAgent))}` : undefined);
  useEffect(() => {
    if (entryPath) navigate(entryPath, { replace: true });
  }, [navigate, entryPath]);
  if (!loaded) return <p role="status" className="text-sm text-muted-foreground">{t("agentChats.loadingChat")}</p>;
  if (!enabled) return <p className="text-sm text-muted-foreground">{t("agentChats.disabled")}</p>;
  if (!companyId) return <p className="text-sm text-muted-foreground">{t("agentChats.selectCompany")}</p>;
  if (resolvingRecent || entryPath || primary?.loading) return <p role="status" className="text-sm text-muted-foreground">{t("agentChats.openingChat")}</p>;
  const error = blockingError ?? (recentIds.length > 0 ? chats.error : null);
  if (error && ((error instanceof ApiError) && error.status === 403)) return <ChatNoAccess />;
  if (error) {
    return <ChatLoadError retrying={agents.isFetching || chats.isFetching || session.isFetching} onRetry={() => { void agents.refetch(); void chats.refetch(); void session.refetch(); }} />;
  }
  if (!agents.isPending && !session.isPending && agents.data?.length === 0) return <ChatNoAgents onAddAgent={openNewAgent} />;
  return <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-6 px-4 py-12">
    <ChatNoSelection>
      {agents.isPending || session.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("agentChats.loadingAgents")}</p>
        : <div className="grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2">
          {(agents.data ?? []).slice(0, 6).map(agent => <button key={agent.id} type="button" disabled={openingId !== null}
            onClick={async () => {
              setOpeningId(agent.id); setOpenError(null);
              try { await openChat(agent); } catch (error) { setOpenError(error instanceof Error ? error.message : t("agentChats.openErrorFallback")); } finally { setOpeningId(null); }
            }} className="flex items-center gap-3 rounded-xl border border-border p-4 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            <AgentAvatar agent={agent} size={32} />
            <span className="flex min-w-0 flex-col gap-1"><span className="truncate text-sm font-medium">{agent.name}</span><span className="text-xs text-muted-foreground">{openingId === agent.id ? t("agentChats.openingChat") : agent.title ?? agent.role}</span></span>
          </button>)}
        </div>}
      {openError && <p role="alert" className="text-sm text-destructive">{openError}</p>}
      <Button variant="ghost" asChild><Link to="/agents/all">{t("agentChats.browseAll")}</Link></Button>
    </ChatNoSelection>
  </div>;
}
