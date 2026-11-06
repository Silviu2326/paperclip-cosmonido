import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conversation } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { conversationsApi } from "@/api/conversations";
import { agentsApi } from "@/api/agents";
import { authApi } from "@/api/auth";
import { healthApi } from "@/api/health";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";

export function ConversationControls({ conversation, companyId, onChanged, onError }: {
  conversation: Conversation; companyId: string; onChanged: () => Promise<void>; onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [agentId, setAgentId] = useState(conversation.assignedAgentId ?? "");
  useEffect(() => { setAgentId(conversation.assignedAgentId ?? ""); }, [conversation.id, conversation.assignedAgentId]);
  const agents = useQuery({ queryKey: ["agents", companyId], queryFn: () => agentsApi.list(companyId) });
  const session = useQuery({ queryKey: queryKeys.auth.session, queryFn: () => authApi.getSession(), retry: false });
  const health = useQuery({ queryKey: queryKeys.health, queryFn: healthApi.get });
  const userId = session.data?.user?.id ?? session.data?.session?.userId ?? (health.data?.deploymentMode === "local_trusted" ? "local-board" : null);

  async function apply(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onError(null);
    try { await action(); await onChanged(); }
    catch (err) { onError(err instanceof Error ? err.message : t("conversations.errors.generic")); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        {t("conversations.actions.status")}
        <select className="rounded-md border border-border bg-background p-2" value={conversation.status} disabled={busy}
          onChange={(event) => void apply(() => conversationsApi.setState(conversation.id, { status: event.target.value as Conversation["status"] }))}>
          {(["open", "waiting_us", "waiting_them", "closed"] as const).map((status) => <option key={status} value={status}>{t(`conversations.status.${status}`)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("conversations.actions.priority")}
        <select className="rounded-md border border-border bg-background p-2" value={conversation.priority} disabled={busy}
          onChange={(event) => void apply(() => conversationsApi.setState(conversation.id, { status: conversation.status, priority: event.target.value as Conversation["priority"] }))}>
          {(["low", "normal", "high", "urgent"] as const).map((priority) => <option key={priority} value={priority}>{t(`conversations.priority.${priority}`)}</option>)}
        </select>
      </label>
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <Button variant="outline" disabled={busy || !userId} onClick={() => void apply(() => conversationsApi.assign(conversation.id, { assignedUserId: userId, assignedAgentId: null }))}>{t("conversationsUx.takeOver")}</Button>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        {t("conversations.actions.assignedAgent")}
        <select className="rounded-md border border-border bg-background p-2" value={agentId} disabled={busy || agents.isLoading} onChange={(event) => setAgentId(event.target.value)}>
          <option value="">{t("conversations.actions.none")}</option>
          {(agents.data ?? []).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
      </label>
      <Button variant="outline" disabled={busy || agents.isLoading || !agentId && !conversation.assignedAgentId && !conversation.assignedUserId} onClick={() => void apply(() => conversationsApi.assign(conversation.id, { assignedAgentId: agentId || null, assignedUserId: null }))}>{t(agentId ? "conversationsUx.handToAgent" : "conversationsUx.unassign")}</Button>
    </div>
    {agents.error && <div className="flex items-center gap-2"><p role="alert" className="text-sm text-destructive">{t("conversationsUx.agentsError")}</p><Button variant="outline" size="sm" onClick={() => void agents.refetch()}>{t("conversations.setup.retry")}</Button></div>}
    {(session.error || health.error) && !userId && <p role="alert" className="text-sm text-destructive">{t("conversationsUx.identityError")}</p>}
    <p className="text-xs text-muted-foreground">{t(conversation.assignedUserId ? "conversationsUx.humanInCharge" : conversation.assignedAgentId ? "conversationsUx.agentInCharge" : "conversations.list.unassigned")}</p>
  </div>;
}
