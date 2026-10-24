import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, File, FileText, Image, Search, Video } from "lucide-react";
import type { CompanyArtifact, Issue } from "@paperclipai/shared";
import { artifactsApi } from "@/api/artifacts";
import { issuesApi } from "@/api/issues";
import { projectsApi } from "@/api/projects";
import { IssueFiltersPopover } from "@/components/IssueFiltersPopover";
import { StatusIcon, statusLabel } from "@/components/StatusIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  applyIssueFilters,
  countActiveIssueFilters,
  defaultIssueFilterState,
  issueStatusOrder,
  type IssueFilterState,
} from "@/lib/issue-filters";
import { accentReadable, accentTint, brandAccent } from "@/lib/accent";
import { relativeShort } from "@/lib/relative-short";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { Link } from "@/lib/router";
import { cn, formatDate, relativeTime } from "@/lib/utils";

/**
 * The agent-scoped side panels shown beside an agent chat: every task the
 * agent has worked on, and every artifact it produced. Both are card stacks
 * so the chat's right column reads as "what this agent has been doing"
 * rather than the properties of the conversation issue itself.
 */

const AGENT_TASK_LIMIT = 200;
const ARTIFACT_PAGE_SIZE = 100;
const ARTIFACT_MAX_PAGES = 5;

export type AgentTaskSortField = "updated" | "created" | "status" | "title";

const SORT_OPTIONS: ReadonlyArray<[AgentTaskSortField, string]> = [
  ["updated", "Last updated"],
  ["created", "Created"],
  ["status", "Status"],
  ["title", "Title"],
];

export function sortAgentTasks(
  tasks: Issue[],
  field: AgentTaskSortField,
  dir: "asc" | "desc",
): Issue[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...tasks].sort((a, b) => {
    switch (field) {
      case "status":
        return sign * (issueStatusOrder.indexOf(a.status) - issueStatusOrder.indexOf(b.status));
      case "title":
        return sign * a.title.localeCompare(b.title);
      case "created":
        return sign * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      default:
        return sign * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    }
  });
}

function PanelMessage({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <p className={cn("px-1 py-6 text-center text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {children}
    </p>
  );
}

const cardClassName =
  "flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 transition-[border-color,transform] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_ACCENT: Record<string, string> = {
  in_progress: brandAccent(7),
  in_review: brandAccent(10),
  blocked: brandAccent(10),
  done: brandAccent(8),
};

/** Status as a tinted pill, so the state of each task reads before its title does. */
function TaskStatusPill({ task }: { task: Issue }) {
  const accent = STATUS_ACCENT[task.status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      style={accent ? { background: accentTint(accent, 18), color: accentReadable(accent) } : { background: "var(--muted)" }}
    >
      <StatusIcon status={task.status} blockerAttention={task.blockerAttention} />
      {statusLabel(task.status)}
    </span>
  );
}

export function AgentTaskCard({ task }: { task: Issue }) {
  const { i18n } = useTranslation();
  return (
    <Link
      // design-allow(card-pattern): navigation <Link> card; Card renders a div and would break anchor semantics
      to={`/issues/${task.identifier ?? task.id}`}
      disableIssueQuicklook
      target="_blank"
      rel="noreferrer"
      data-testid="agent-task-card"
      className={cardClassName}
    >
      <span className="line-clamp-2 text-sm font-medium text-foreground">{task.title}</span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{task.identifier ?? task.id.slice(0, 8)}</span>
        <TaskStatusPill task={task} />
        <time className="ml-auto" dateTime={new Date(task.updatedAt).toISOString()} title={new Date(task.updatedAt).toLocaleString()}>
          {relativeShort(task.updatedAt, i18n.language) ?? relativeTime(task.updatedAt)}
        </time>
      </span>
    </Link>
  );
}

export function AgentTasksPanel({
  companyId,
  agentId,
  excludeIssueId,
}: {
  companyId: string;
  agentId: string;
  /** The conversation issue itself, which is not one of the agent's tasks. */
  excludeIssueId?: string;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<IssueFilterState>(defaultIssueFilterState);
  const [sortField, setSortField] = useState<AgentTaskSortField>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const tasksQuery = useQuery({
    queryKey: queryKeys.issues.listParticipatedByAgent(companyId, agentId),
    queryFn: () => issuesApi.list(companyId, {
      participantAgentId: agentId,
      sortField: "updated",
      sortDir: "desc",
      limit: AGENT_TASK_LIMIT,
    }),
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
  });

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped = (tasksQuery.data ?? []).filter((task) => {
      if (task.id === excludeIssueId) return false;
      if (!needle) return true;
      return task.title.toLowerCase().includes(needle)
        || (task.identifier ?? "").toLowerCase().includes(needle);
    });
    return sortAgentTasks(applyIssueFilters(scoped, filters), sortField, sortDir);
  }, [tasksQuery.data, excludeIssueId, query, filters, sortField, sortDir]);

  const activeFilterCount = countActiveIssueFilters(filters);
  const total = (tasksQuery.data ?? []).filter((task) => task.id !== excludeIssueId).length;
  // Search and filters run on the most recently updated tasks only.
  const capped = (tasksQuery.data?.length ?? 0) >= AGENT_TASK_LIMIT;

  return (
    <section className="flex flex-col gap-3" aria-label="Agent tasks">
      <div className="flex items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
            className="h-8 pl-7 text-sm"
          />
        </div>
        <IssueFiltersPopover
          state={filters}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          activeFilterCount={activeFilterCount}
          projects={projectsQuery.data?.map((project) => ({ id: project.id, name: project.name }))}
          enableExternalObjectFilters={false}
          buttonVariant="outline"
          iconOnly
          presentation="streamlined"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Sort" aria-label="Sort tasks">
              <ArrowUpDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-0">
            <div className="space-y-0.5 p-2">
              {SORT_OPTIONS.map(([field, label]) => (
                <button
                  key={field}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm",
                    sortField === field ? "bg-accent/50 text-foreground" : "text-muted-foreground hover:bg-accent/50",
                  )}
                  onClick={() => {
                    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
                    else {
                      setSortField(field);
                      setSortDir(field === "updated" || field === "created" ? "desc" : "asc");
                    }
                  }}
                >
                  <span>{label}</span>
                  {sortField === field ? (
                    <span className="text-xs text-muted-foreground">{sortDir === "asc" ? "↑" : "↓"}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {tasksQuery.isPending ? (
        <PanelMessage>Loading tasks…</PanelMessage>
      ) : tasksQuery.isError ? (
        <PanelMessage tone="error">Could not load this agent's tasks.</PanelMessage>
      ) : total === 0 ? (
        <PanelMessage>This agent hasn't worked on any tasks yet.</PanelMessage>
      ) : visible.length === 0 ? (
        <PanelMessage>
          {capped
            ? `No tasks match these filters among the ${AGENT_TASK_LIMIT} most recently updated.`
            : "No tasks match these filters."}
        </PanelMessage>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((task) => <AgentTaskCard key={task.id} task={task} />)}
          {capped ? (
            <p className="px-1 text-xs text-muted-foreground">
              Showing the {AGENT_TASK_LIMIT} most recently updated tasks.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

const ARTIFACT_KINDS = {
  image: { icon: Image, accent: brandAccent(2) },
  video: { icon: Video, accent: brandAccent(8) },
  text: { icon: FileText, accent: brandAccent(7) },
  document: { icon: FileText, accent: brandAccent(7) },
} as const;

function ArtifactKindTile({ artifact }: { artifact: CompanyArtifact }) {
  const kind = ARTIFACT_KINDS[artifact.mediaKind as keyof typeof ARTIFACT_KINDS];
  const Icon = kind?.icon ?? File;
  const accent = kind?.accent ?? brandAccent(10);
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
      style={{ background: accentTint(accent, 28), color: accentReadable(accent) }}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function AgentArtifactCard({ artifact }: { artifact: CompanyArtifact }) {
  return (
    <Link
      // design-allow(card-pattern): navigation <Link> card; Card renders a div and would break anchor semantics
      to={artifact.href}
      disableIssueQuicklook
      target="_blank"
      rel="noreferrer"
      data-testid="agent-artifact-card"
      className={cn(cardClassName, "flex-row items-center gap-3")}
    >
      <ArtifactKindTile artifact={artifact} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground" title={artifact.title}>
          {artifact.title}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Updated {formatDate(artifact.updatedAt)}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{artifact.issue.identifier}</span>
        </span>
      </span>
    </Link>
  );
}

/**
 * This agent's artifacts, newest first, filtered on the server. Pages are
 * capped so an unusually prolific agent can't stall the panel; the cap only
 * ever drops its oldest artifacts.
 */
async function listAgentArtifacts(companyId: string, agentId: string) {
  const artifacts: CompanyArtifact[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < ARTIFACT_MAX_PAGES; page += 1) {
    const response = await artifactsApi.list(companyId, { agentId, limit: ARTIFACT_PAGE_SIZE, cursor });
    artifacts.push(...response.artifacts);
    if (!response.nextCursor) return { artifacts, truncated: false };
    cursor = response.nextCursor;
  }
  return { artifacts, truncated: true };
}

export function AgentArtifactsPanel({ companyId, agentId }: { companyId: string; agentId: string }) {
  const artifactsQuery = useQuery({
    queryKey: queryKeys.artifacts.byAgent(companyId, agentId),
    queryFn: () => listAgentArtifacts(companyId, agentId),
  });

  if (artifactsQuery.isPending) return <PanelMessage>Loading artifacts…</PanelMessage>;
  if (artifactsQuery.isError) return <PanelMessage tone="error">Could not load this agent's artifacts.</PanelMessage>;
  const { artifacts, truncated } = artifactsQuery.data;
  if (artifacts.length === 0) return <PanelMessage>This agent hasn't produced any artifacts yet.</PanelMessage>;
  return (
    <section className="flex flex-col gap-2" aria-label="Agent artifacts">
      {artifacts.map((artifact) => <AgentArtifactCard key={artifact.id} artifact={artifact} />)}
      {truncated ? (
        <p className="px-1 text-xs text-muted-foreground">Showing this agent's {artifacts.length} most recent artifacts.</p>
      ) : null}
    </section>
  );
}
