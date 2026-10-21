import { Link } from "@/lib/router";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";
import type { Conversation } from "@paperclipai/shared";

export function isOverdue(conversation: Conversation, now = Date.now()) {
  return conversation.status === "waiting_us" && !!conversation.slaDueAt && new Date(conversation.slaDueAt).getTime() < now;
}

export function ConversationList({ items }: { items: Conversation[] }) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((conversation) => {
        const overdue = isOverdue(conversation);
        return (
          <li key={conversation.id}>
            <Link
              to={`/conversations/${conversation.id}`}
              className="flex flex-col gap-1 px-3 py-2 hover:bg-accent sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {conversation.subject || t("conversations.list.noSubject")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(`conversations.channel.${conversation.channel}`)}
                  {conversation.lastMessageAt
                    ? ` · ${t("conversations.list.lastActivity", { when: new Date(conversation.lastMessageAt).toLocaleString() })}`
                    : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t(`conversations.status.${conversation.status}`)}</Badge>
                {overdue && <Badge variant="destructive">{t("conversations.sla.overdue")}</Badge>}
                {!conversation.assignedUserId && !conversation.assignedAgentId && (
                  <span className="text-xs text-muted-foreground">{t("conversations.list.unassigned")}</span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
