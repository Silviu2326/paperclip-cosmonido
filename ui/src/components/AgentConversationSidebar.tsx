import { useId, useRef, useState } from "react";
import { Plus, Search, Users, X } from "lucide-react";
import { accentInk, accentReadable, accentTint, brandAccent } from "@/lib/accent";
import { relativeShort } from "@/lib/relative-short";
import type { Agent } from "@paperclipai/shared";
import { AgentChatPicker } from "@/components/AgentChatPicker";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "@/lib/router";
import { agentRouteRef, cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

export interface AgentConversationSidebarProps {
  agents: Agent[];
  /** Agents with a saved conversation; defaults to every listed agent. */
  existingChatAgentIds?: readonly string[];
  availableAgents?: Agent[];
  activeId?: string;
  previews?: Record<string, string>;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  initialSearch?: string;
  onSelect?: (agent: Agent, signal?: AbortSignal) => void | Promise<void>;
  onBrowse?: () => void;
  onAddChat?: (agent: Agent, signal?: AbortSignal) => void | Promise<void>;
  historyLoading?: boolean;
  historyError?: Error | null;
  onRetryHistory?: () => void;
  /** Agents the user starred: listed first, under their own heading. */
  starredIds?: readonly string[];
  /** Agents with an answer in progress right now. */
  workingIds?: ReadonlySet<string>;
  /** Last activity of each conversation, shown beside the name. */
  activity?: Record<string, string | Date>;
}

type Filter = "all" | "working";

const SKY = brandAccent(7);
const MINT = brandAccent(8);

export function AgentConversationSidebar({ agents, existingChatAgentIds, availableAgents = agents, activeId, previews = {}, loading = false, error, onRetry, initialSearch = "", onSelect, onBrowse, onAddChat, historyLoading, historyError, onRetryHistory, starredIds = [], workingIds, activity = {} }: AgentConversationSidebarProps) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState(initialSearch);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const query = search.trim().toLocaleLowerCase();
  const isWorking = (agent: Agent) => agent.status !== "terminated" && agent.status !== "paused" && (workingIds?.has(agent.id) === true || agent.status === "running");
  const matching = agents.filter(agent => `${agent.name} ${agent.title ?? ""} ${agent.role}`.toLocaleLowerCase().includes(query));
  const workingCount = matching.filter(isWorking).length;
  const visible = filter === "working" ? matching.filter(isWorking) : matching;
  const starred = visible.filter(agent => starredIds.includes(agent.id));
  const team = visible.filter(agent => !starredIds.includes(agent.id));
  const statusColor = (agent: Agent): string | null => {
    if (agent.status === "terminated" || agent.status === "paused") return null;
    return isWorking(agent) ? SKY : MINT;
  };
  const row = (agent: Agent) => {
    const color = statusColor(agent);
    const working = isWorking(agent);
    const when = activity[agent.id] ? relativeShort(activity[agent.id]!, i18n.language) : null;
    return <Link key={agent.id} to={`/chats/${encodeURIComponent(agent.status === "terminated" ? agent.id : agentRouteRef(agent))}`}
      aria-current={activeId === agent.id ? "page" : undefined}
      title={`${agent.name}${agent.title ? ` · ${agent.title}` : ""}`}
      onClick={event => { if (onSelect) { event.preventDefault(); onSelect(agent); } }}
      className={cn("flex min-w-0 items-center gap-3 rounded-xl p-2.5 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", activeId === agent.id && "bg-accent text-accent-foreground")}>
      <span className="relative shrink-0">
        <AgentAvatar agent={agent} size={40} />
        <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background" style={{ background: color ?? "var(--muted-foreground)" }}>
          {working ? <span className="absolute inset-0 animate-ping rounded-full motion-reduce:animate-none" style={{ background: SKY, opacity: 0.6 }} /> : null}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{agent.name}</span>
          {when ? <span className="shrink-0 text-xs text-muted-foreground">{when}</span> : null}
        </span>
        <span className="truncate text-xs text-muted-foreground" style={working ? { color: accentReadable(SKY) } : undefined}>{agent.status === "terminated" ? t("agentConversationSidebar.terminated") : agent.status === "paused" ? t("agentConversationSidebar.paused") : previews[agent.id] ?? agent.title ?? t("agentConversationSidebar.startConversation")}</span>
      </span>
    </Link>;
  };
  function focusSearch() {
    setSearch("");
    searchRef.current?.focus();
  }
  return <aside aria-labelledby={headingId} className="flex h-full min-h-0 flex-col border-r border-border bg-background">
    <div className="flex shrink-0 flex-col gap-4 px-3 pb-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{t("agentConversationSidebar.heading")}</h2>
        <div className="flex items-center gap-2">
          {!loading && !error ? <span className="text-xs text-muted-foreground">{t("agentConversationSidebar.agentCount", { count: agents.length })}</span> : null}
          <Button variant="outline" size="icon-sm" aria-label={t("agentConversationSidebar.addChat")} title={t("agentConversationSidebar.addChat")} onClick={() => setPickerOpen(true)}>
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input ref={searchRef} aria-label={t("agentConversationSidebar.searchAgents")} placeholder={t("agentConversationSidebar.searchPlaceholder")} value={search} onChange={event => setSearch(event.target.value)}
          onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setSearch(""); } }}
          className="h-9 rounded-xl pl-8 pr-8 text-sm md:text-sm" />
        {search && <Button variant="ghost" size="icon-xs" aria-label={t("agentConversationSidebar.clearSearch")} className="absolute right-1 top-1/2 -translate-y-1/2" onClick={focusSearch}><X className="size-3" /></Button>}
      </div>
      {!loading && !error && agents.length > 0 ? <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("agentConversationSidebar.filters")}>
        {([["all", t("agentConversationSidebar.filterAll"), null, matching.length], ["working", t("agentConversationSidebar.filterWorking"), SKY, workingCount]] as const).map(([id, label, color, count]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
            className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", filter === id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
            style={filter === id ? { background: color ? accentTint(color, 30) : "var(--accent)", color: color ? accentInk(color) : undefined } : undefined}>
            {label} · {count}
          </button>
        ))}
      </div> : null}
    </div>
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 scrollbar-auto-hide">
      {!(starred.length > 0 && !query) && <p className="px-2 text-(length:--text-micro) font-medium uppercase tracking-widest text-muted-foreground">
        {query ? t("agentConversationSidebar.searchResults") : t("agentConversationSidebar.teammates")}
      </p>}
      <span role="status" className="sr-only">{loading ? t("agentConversationSidebar.loadingAgents") : t("agentConversationSidebar.agentCount", { count: visible.length })}</span>
      {historyLoading && <p role="status" className="px-2 text-xs text-muted-foreground">{t("agentConversationSidebar.loadingHistory")}</p>}
      {historyError && <div role="alert" className="flex flex-col items-start gap-2 px-2 py-3">
        <p className="text-xs text-muted-foreground">{t("agentConversationSidebar.historyError")}</p>
        <Button variant="outline" size="sm" onClick={onRetryHistory}>{t("agentConversationSidebar.retryHistory")}</Button>
      </div>}
      {error ? <div role="alert" className="flex flex-col items-start gap-2 px-2 py-6"><p className="text-sm">{t("agentConversationSidebar.loadFailed")}</p><Button variant="outline" size="sm" onClick={onRetry}>{t("agentConversationSidebar.tryAgain")}</Button></div> : loading ? <div aria-hidden="true" className="flex flex-col gap-1">
        {[0, 1, 2, 3].map(index => <div key={index} className="flex items-center gap-3 rounded-md px-2 py-3 motion-safe:animate-pulse">
          <div className="size-8 shrink-0 rounded-lg bg-muted" />
          <div className="flex flex-1 flex-col gap-2"><div className="h-3 w-2/3 rounded-sm bg-muted" /><div className="h-2 w-full rounded-sm bg-muted" /></div>
        </div>)}
      </div> : visible.length ? <nav aria-label={t("agentConversationSidebar.conversationsNav")} className="flex flex-col gap-1">
        {starred.length > 0 && !query ? <p className="px-2 pt-1 text-(length:--text-micro) font-medium uppercase tracking-widest text-muted-foreground">{t("agentConversationSidebar.favorites")}</p> : null}
        {starred.map(row)}
        {starred.length > 0 && team.length > 0 && !query ? <p className="px-2 pt-3 text-(length:--text-micro) font-medium uppercase tracking-widest text-muted-foreground">{t("agentConversationSidebar.teammates")}</p> : null}
        {team.map(row)}
      </nav> : !agents.length && (historyLoading || historyError) ? null : <div className="flex flex-col items-start gap-2 px-2 py-6">
        <p className="text-sm font-medium">{agents.length ? t("agentConversationSidebar.noAgentsFound") : t("agentConversationSidebar.noChats")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{agents.length ? t("agentConversationSidebar.tryAnother") : t("agentConversationSidebar.chooseAgentHint")}</p>
        {!agents.length && <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>{t("agentConversationSidebar.chooseAgent")}</Button>}
        {agents.length > 0 && <Button variant="outline" size="sm" onClick={focusSearch}>{t("agentConversationSidebar.clearSearch")}</Button>}
      </div>}
    </div>
    <div className="shrink-0 px-3 py-4">
      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2 text-muted-foreground" asChild={!onBrowse} onClick={onBrowse}>
        {onBrowse ? <><Users className="size-4" />{t("agentConversationSidebar.browseAll")}</> : <Link to="/agents/all"><Users className="size-4" />{t("agentConversationSidebar.browseAll")}</Link>}
      </Button>
    </div>
    <AgentChatPicker agents={availableAgents} open={pickerOpen} onOpenChange={setPickerOpen}
      existingChatAgentIds={existingChatAgentIds ?? agents.map(agent => agent.id)} loading={loading} error={error} onRetry={onRetry}
      renderAgentIcon={agent => <AgentAvatar agent={agent} size={32} />}
      onSelect={async (agent, signal) => {
        if (onAddChat) await onAddChat(agent, signal);
        else if (onSelect) await onSelect(agent, signal);
        else navigate(`/chats/${encodeURIComponent(agentRouteRef(agent))}`);
        if (!signal?.aborted) setSearch("");
      }} />
  </aside>;
}
