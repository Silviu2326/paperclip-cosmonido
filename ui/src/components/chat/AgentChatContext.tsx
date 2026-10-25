import type { Agent, Issue } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/badge";

/** Saved conversation scope, not an estimate of the model's context window. */
export function AgentChatContext({ agent, issue }: { agent: Agent; issue: Issue }) {
  const { t } = useTranslation();
  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("chatWorkspace.context")}</summary>
      <div className="flex flex-col gap-3 pt-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{agent.title || agent.role}</Badge>
          <Badge variant="secondary">{t(`chatWorkspace.mode.${issue.workMode ?? "standard"}`)}</Badge>
        </div>
        {agent.capabilities && <p className="text-sm text-muted-foreground">{agent.capabilities}</p>}
        <p className="text-sm text-muted-foreground">{t("chatWorkspace.sessionScope")}</p>
        {issue.conversationBoundaryCommentId && <p className="text-sm text-muted-foreground">{t("chatWorkspace.newSession")}</p>}
      </div>
    </details>
  );
}
