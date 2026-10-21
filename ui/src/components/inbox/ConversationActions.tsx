import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conversation } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { agentsApi } from "../../api/agents";
import { conversationsApi } from "../../api/conversations";

const STATUSES = ["open", "waiting_us", "waiting_them", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const selectClass = "rounded-md border border-border bg-background px-2 py-1 text-sm";

// Status, priority and assignment. Each change is one API call; the page reloads on success.
export function ConversationActions({
  conversation,
  companyId,
  onChanged,
  onError,
}: {
  conversation: Conversation;
  companyId: string;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(conversation.status);
  const [priority, setPriority] = useState(conversation.priority);
  const [agentId, setAgentId] = useState(conversation.assignedAgentId ?? "");
  const [busy, setBusy] = useState(false);

  const { data: agents } = useQuery({
    queryKey: ["agents", companyId],
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  async function apply(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("conversations.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t("conversations.actions.status")}</span>
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`conversations.status.${s}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t("conversations.actions.priority")}</span>
          <select className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{t(`conversations.priority.${p}`)}</option>)}
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => apply(() => conversationsApi.setState(conversation.id, { status, priority }))}
        >
          {t("conversations.actions.apply")}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t("conversations.actions.assignedAgent")}</span>
          <select className={selectClass} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">{t("conversations.actions.none")}</option>
            {(agents ?? []).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => apply(() => conversationsApi.assign(conversation.id, { assignedAgentId: agentId || null }))}
        >
          {t("conversations.actions.apply")}
        </Button>
      </div>
    </div>
  );
}
