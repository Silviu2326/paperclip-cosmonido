import { useQueries, useQuery } from "@tanstack/react-query";
import type { Conversation } from "@paperclipai/shared";
import { Bot, UserRound } from "lucide-react";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { crmApi } from "@/api/crm";
import { agentsApi } from "@/api/agents";
import { Badge } from "@/components/ui/badge";
import { ChannelLabel } from "./ChannelLabel";

export function relativeActivity(value: string, locale: string, now = Date.now()) {
  const minutes = Math.round((new Date(value).getTime() - now) / 60000);
  if (!Number.isFinite(minutes)) return "";
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  if (Math.abs(minutes) < 1440) return format.format(Math.round(minutes / 60), "hour");
  return format.format(Math.round(minutes / 1440), "day");
}

export function ConversationList({ items, search, companyId }: { items: Conversation[]; search: string; companyId: string }) {
  const { t, i18n } = useTranslation();
  const contactIds = [...new Set(items.flatMap((item) => item.contactId ? [item.contactId] : []))];
  const contacts = useQueries({ queries: contactIds.map((id) => ({
    queryKey: ["crm", companyId, "contact", id], queryFn: () => crmApi.contacts.get(id), staleTime: 60000,
  })) });
  const { data: agents } = useQuery({
    queryKey: ["agents", companyId], queryFn: () => agentsApi.list(companyId),
    enabled: items.some((item) => !!item.assignedAgentId), staleTime: 60000,
  });
  const names = new Map(contactIds.map((id, index) => [id, contacts[index].data?.displayName]));
  const filtered = items.filter((item) => !search.trim() || [item.subject, names.get(item.contactId ?? ""), item.externalThreadId]
    .some((value) => value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  return <div className="flex flex-col gap-2">
    {contacts.some((contact) => contact.error) && <div className="flex items-center gap-2"><p role="alert" className="text-sm text-destructive">{t("conversationsUx.contactsError")}</p><button type="button" className="text-sm underline" onClick={() => { for (const contact of contacts) if (contact.error) void contact.refetch(); }}>{t("conversations.setup.retry")}</button></div>}
    {!filtered.length && <p role="status" className="text-sm text-muted-foreground">{t("conversationsUx.noSearchResults")}</p>}
    <ul className="divide-y divide-border rounded-md border border-border">
    {filtered.map((item) => <li key={item.id}>
      <Link to={`/conversations/${item.id}`} className="flex flex-col gap-2 p-3 hover:bg-accent focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="truncate text-sm font-medium">{names.get(item.contactId ?? "") || item.subject || item.externalThreadId || t("conversations.list.noSubject")}</div>
          {names.get(item.contactId ?? "") && item.subject && <p className="truncate text-sm text-muted-foreground">{item.subject}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ChannelLabel channel={item.channel} />
            {item.lastMessageAt && <time dateTime={item.lastMessageAt} title={new Date(item.lastMessageAt).toLocaleString(i18n?.language)}>{relativeActivity(item.lastMessageAt, i18n?.language ?? "es")}</time>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {item.assignedUserId ? <><UserRound className="size-4" aria-hidden="true" />{t("conversationsUx.human")}</> : item.assignedAgentId ? <><Bot className="size-4" aria-hidden="true" />{agents?.find((agent) => agent.id === item.assignedAgentId)?.name || t("conversationsUx.agent")}</> : t("conversations.list.unassigned")}
          </span>
          <Badge variant="outline">{t(`conversations.status.${item.status}`)}</Badge>
          {item.status === "waiting_us" && item.slaDueAt && new Date(item.slaDueAt).getTime() < Date.now() && <Badge variant="destructive">{t("conversations.sla.overdue")}</Badge>}
        </div>
      </Link>
    </li>)}
    </ul>
  </div>;
}
