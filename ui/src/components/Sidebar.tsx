import {
  Inbox,
  ListChecks,
  CircleCheck,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Boxes,
  Repeat,
  Layers,
  GitBranch,
  Package,
  Settings,
  FolderOpen,
  Unplug,
  MessagesSquare,
  MessageCircle,
  GanttChartSquare,
  LayoutGrid,
  Plus,
  Users,
  UserRound,
  UserPlus,
  Handshake,
  CalendarDays,
  Briefcase,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem, SidebarPrimaryNavProvider } from "./SidebarNavItem";
import { NavLink, useLocation } from "@/lib/router";
import { SIDEBAR_SCROLL_RESET_STATE } from "../lib/navigation-scroll";
import { SidebarAgents } from "./SidebarAgents";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarStarredProjects } from "./SidebarStarredProjects";
import { useAgentChatEnabled } from "@/hooks/useAgentChatEnabled";
import { SidebarRecentTasks } from "./SidebarRecentTasks";
import { useDialogActions } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { useSidebar } from "../context/SidebarContext";
import { attentionApi } from "../api/attention";
import { heartbeatsApi } from "../api/heartbeats";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { attentionBadgeCount } from "../lib/attention";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { useStreamlinedUiEnabled } from "../hooks/useStreamlinedUiEnabled";
import { usePublishSharedQueryData, useSharedPollingQuery } from "../hooks/useSharedPolling";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, SIDEBAR_RAIL_HIDDEN_LABEL } from "../lib/utils";
import { PluginSlotOutlet } from "@/plugins/slots";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";
import { primarySidebarStyles } from "./primary-sidebar-styles";
import { useTranslation } from "@/i18n";

// Routes that live in the streamlined Administration group.
const ADMIN_ROUTE_PATTERN = /^\/(?:[^/]+\/)?(skills|apps|activity|audit)(?:\/|$)/;

export function Sidebar({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { openNewIssue } = useDialogActions();
  const { enabled: agentChatEnabled } = useAgentChatEnabled();
  // Every labeled section is collapsible (session-scoped, default open) —
  // one policy across static nav groups and the data-driven sections.
  const [workOpen, setWorkOpen] = useState(true);
  const [organizationOpen, setOrganizationOpen] = useState(true);
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { collapsed, peeking, isMobile, setSidebarOpen } = useSidebar();
  const { enabled: streamlinedUiEnabled } = useStreamlinedUiEnabled();
  const rail = collapsed && !peeking;
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const liveRunsQueryKey = queryKeys.liveRuns(selectedCompanyId!);
  const sharedLiveRuns = useSharedPollingQuery({
    companyId: selectedCompanyId,
    resourceKey: "live-runs",
    queryKey: liveRunsQueryKey,
    enabled: !!selectedCompanyId,
    // Event-sourced via LiveUpdatesProvider (GitHub issue 9627) + reconnect reconcile — no
    // interval poll needed. Polling here also re-armed React Query's timer on
    // every live-event cache write, a major source of steady-state churn.
    refetchInterval: false,
    leaderOnly: true,
  });
  const { data: liveRuns, dataUpdatedAt: liveRunsUpdatedAt } = useQuery({
    queryKey: liveRunsQueryKey,
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: sharedLiveRuns.enabled,
    refetchInterval: sharedLiveRuns.refetchInterval,
  });
  usePublishSharedQueryData(sharedLiveRuns, liveRuns, liveRunsUpdatedAt);
  const liveRunCount = liveRuns?.length ?? 0;
  const liveIssueIds = new Set(
    (liveRuns ?? []).flatMap((run) => run.issueId ? [run.issueId] : []),
  );
  // PAP-670 splits the nav reorganization across two experimental flags.
  // Agent Chat: Chat leads Work as one row with its own agent rail (the
  // streamlined shell only — the legacy shell keeps per-agent rows), and
  // Workspaces leaves to make room. Combined Inbox + Task List: Inbox becomes
  // views inside Tasks, so its row goes and its badge rides on Tasks.
  const chatRail = agentChatEnabled && streamlinedUiEnabled;
  // The merged Tasks page only exists in the streamlined shell, so the legacy
  // shell keeps its Inbox row even with the flag on.
  const combinedInboxTasks = streamlinedUiEnabled && experimentalSettings?.enableCombinedInboxTasks === true;
  const showWorkspacesLink = !chatRail && experimentalSettings?.enableIsolatedWorkspaces === true;
  const showPipelines = experimentalSettings?.enablePipelines === true;
  const showStatusCards = experimentalSettings?.enableStatusCards === true;
  const goalsLinkPending = experimentalSettings === undefined;
  const showGoalsLink = experimentalSettings?.enableGoalsSidebarLink === true;
  // Decisions (attention home) is an experimental surface (PAP-13481): the nav
  // item is hidden entirely until the flag is enabled (same no-flash pattern as
  // showWorkspacesLink — it defaults hidden, so no placeholder is needed).
  const showDecisions = experimentalSettings?.enableDecisions === true;
  const { data: attentionFeed } = useQuery({
    queryKey: queryKeys.attention(selectedCompanyId!),
    queryFn: () => attentionApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && showDecisions,
    refetchInterval: 60_000,
  });
  const attentionCount = attentionBadgeCount(attentionFeed);
  const showCases = experimentalSettings?.enableCases === true;
  // Conference Room Chat flag (PAP-136/PAP-137): the Conference Room nav item
  // is a new surface, hidden entirely while the flag is off (same no-flash
  // pattern as showWorkspacesLink above).
  const conferenceRoomChatEnabled = experimentalSettings?.enableConferenceRoomChat === true;

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  // Streamlined layout: the Administration group opens by itself when the
  // current route belongs to it, and stays closed otherwise.
  const adminRouteActive = ADMIN_ROUTE_PATTERN.test(location.pathname);
  const [adminOpen, setAdminOpen] = useState(adminRouteActive);
  useEffect(() => {
    if (adminRouteActive) setAdminOpen(true);
  }, [adminRouteActive]);

  // Quick create: in the streamlined layout it rides the Work header as "+";
  // the rail has no header, so it keeps the standalone row there.
  const headerCreate = streamlinedUiEnabled && !rail;
  const newTaskButton = (
    <button
      onClick={() => openNewIssue()}
      data-slot="icon-button"
      aria-label={rail ? t("nav.newTask") : undefined}
      className="flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 text-(length:--text-compact) font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
    >
      <SquarePen className="h-4 w-4 shrink-0" />
      <span className={rail ? SIDEBAR_RAIL_HIDDEN_LABEL : "truncate"}>{t("nav.newTask")}</span>
    </button>
  );

  return (
    <SidebarPrimaryNavProvider enabled={streamlinedUiEnabled}>
      <aside
        className={cn(
          "w-full h-full min-h-0 flex flex-col",
          streamlinedUiEnabled
            ? primarySidebarStyles.surface
            : "border-r border-border bg-background",
        )}
      >
        {streamlinedUiEnabled ? (
          <>
            {/* Compact brand header: the real Cosmonido mark and the heading face. */}
            <div className="flex h-12 shrink-0 items-center gap-2 px-4">
              <img src="/brand/logo.webp" alt="" width={45} height={28} className="h-7 w-auto shrink-0" />
              {rail ? null : (
                <span
                  className="min-w-0 truncate text-base font-semibold text-foreground"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {t("sidebarNew.brandName")}
                </span>
              )}
            </div>
            {/* Organization selector: its own block, separate from the navigation. */}
            <div className="shrink-0 border-b border-border/60 px-3 pb-2 pt-1">
              <SidebarCompanyMenu />
            </div>
            {/* Search sits under the organization selector and opens the search page. */}
            <div className="shrink-0 px-3 pb-1 pt-2">
              {rail ? (
                <SidebarNavItem to="/search" label={t("nav.search")} icon={Search} />
              ) : (
                <NavLink
                  to="/search"
                  state={SIDEBAR_SCROLL_RESET_STATE}
                  onClick={() => { if (isMobile) setSidebarOpen(false); }}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-(length:--text-compact) text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t("sidebarNew.searchPlaceholder")}</span>
                </NavLink>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-(--sz-60px) shrink-0 items-center gap-1 px-3">
            <SidebarCompanyMenu />
          </div>
        )}

        <nav className={primarySidebarStyles.nav}>
          <div className={primarySidebarStyles.group}>
            {!headerCreate ? newTaskButton : null}
            {!streamlinedUiEnabled ? <SidebarNavItem to="/search" label={t("nav.search")} icon={Search} /> : null}
            {/* Top navigation: Inicio and Bandeja lead; experimental surfaces follow. */}
            <SidebarNavItem to="/dashboard" label={t("nav.dashboard")} icon={LayoutDashboard} liveCount={liveRunCount} />
            {!combinedInboxTasks ? (
              <SidebarNavItem
                to="/inbox"
                label={t("nav.inbox")}
                icon={Inbox}
                badge={inboxBadge.inbox}
                badgeLabel="unread"
                badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
                alert={inboxBadge.failedRuns > 0}
              />
            ) : null}
            {agentChatEnabled && !chatRail ? <SidebarNavItem to="/chats" label={t("nav.chat")} icon={MessageCircle} /> : null}
            {showDecisions ? (
              <SidebarNavItem
                to="/decisions"
                label={t("nav.decisions")}
                icon={ListChecks}
                badge={attentionCount}
                badgeLabel="decisions"
              />
            ) : null}
            {showStatusCards ? (
              <SidebarNavItem to="/status" label={t("nav.status")} icon={LayoutGrid} textBadge="beta" />
            ) : null}
            {conferenceRoomChatEnabled ? (
              <SidebarNavItem to="/board-chat" label={t("nav.conferenceRoom")} icon={MessagesSquare} />
            ) : null}
          </div>

          <SidebarSection
            label={t("nav.work")}
            divider={streamlinedUiEnabled}
            collapsible={{ open: workOpen, onOpenChange: setWorkOpen }}
            headerAction={headerCreate ? { ariaLabel: t("nav.newTask"), icon: Plus, onClick: () => openNewIssue() } : undefined}
          >
            {/* Agent Chat: Chat leads the Work group as a single row. The agents
                you talk to live in the Chat surface's own secondary rail
                (ChatContextualSidebar), not in the primary nav. */}
            {chatRail ? (
              <SidebarNavItem to="/chats" label={t("nav.chat")} icon={MessageCircle} />
            ) : null}
            {/* Combined Inbox + Task List: Inbox is a view inside Tasks, so the
                unread/failed-run badge rides on Tasks. */}
            {combinedInboxTasks ? (
              <SidebarNavItem
                to="/issues"
                label={t("nav.tasks")}
                icon={CircleCheck}
                badge={inboxBadge.inbox}
                badgeLabel="unread"
                badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
                alert={inboxBadge.failedRuns > 0}
              />
            ) : (
              <SidebarNavItem to="/issues" label={t("nav.tasks")} icon={CircleCheck} />
            )}
            {streamlinedUiEnabled ? (
              <>
                <SidebarNavItem to="/projects" label={t("nav.projects")} icon={FolderOpen} />
                <SidebarStarredProjects />
              </>
            ) : null}
            <SidebarNavItem to="/routines" label={t("nav.routines")} icon={Repeat} />
            <SidebarNavItem to="/artifacts" label={t("nav.artifacts")} icon={Package} />
            {showCases ? (
              <SidebarNavItem to="/cases" label={t("nav.cases")} icon={Layers} textBadge="beta" />
            ) : null}
            {showPipelines ? (
              <SidebarNavItem to="/pipelines" label={t("nav.pipelines")} icon={GitBranch} />
            ) : null}
            {showGoalsLink ? (
              <SidebarNavItem to="/goals" label={t("nav.goals")} icon={Target} />
            ) : goalsLinkPending ? (
              <div
                data-testid="sidebar-goals-placeholder"
                className="h-8 pointer-coarse:h-7"
                aria-hidden="true"
              />
            ) : null}
            {showWorkspacesLink ? (
              <SidebarNavItem to="/workspaces" label={t("nav.workspaces")} icon={GitBranch} />
            ) : null}
            <PluginSlotOutlet
              errorBehavior="hidden"
              slotTypes={["sidebar"]}
              context={pluginContext}
              className="flex flex-col gap-0.5"
              itemClassName="text-(length:--text-compact) font-medium"
              missingBehavior="placeholder"
            />
            <PluginLauncherOutlet
              errorBehavior="hidden"
              placementZones={["sidebar"]}
              context={pluginContext}
              className="flex flex-col gap-0.5"
              itemClassName="text-(length:--text-compact) font-medium"
            />
          </SidebarSection>

          <SidebarSection label={t("nav.business")} divider>
            <SidebarNavItem to="/customers" label={t("nav.customers")} icon={Users} />
            <SidebarNavItem to="/contacts" label={t("nav.contacts")} icon={UserRound} />
            <SidebarNavItem to="/leads" label={t("nav.leads")} icon={UserPlus} />
            <SidebarNavItem to="/opportunities" label={t("nav.opportunities")} icon={Handshake} />
            <SidebarNavItem to="/conversations" label={t("nav.inbox")} icon={Inbox} />
            <SidebarNavItem to="/schedule" label={t("nav.schedule")} icon={CalendarDays} />
          </SidebarSection>

          {streamlinedUiEnabled ? (
            <SidebarSection label={t("sidebarNew.groupTeam")} divider>
              {/* Agents: one expandable group; each agent is listed once, inside it. */}
              {children ?? <SidebarAgents streamlined />}
            </SidebarSection>
          ) : (
            children ?? null
          )}

          {streamlinedUiEnabled ? (
            <SidebarRecentTasks companyId={selectedCompanyId} liveIssueIds={liveIssueIds} />
          ) : (
            <>
              <SidebarProjects />
              <SidebarAgents />
              <SidebarSection
                label={t("sidebar.organizationSection")}
                collapsible={{ open: organizationOpen, onOpenChange: setOrganizationOpen }}
              >
                <SidebarNavItem to="/org" label={t("nav.org")} icon={Network} />
                <SidebarNavItem to="/apps" label={t("nav.connectors")} icon={Unplug} />
                <SidebarNavItem to="/timeline" label={t("sidebar.timeline")} icon={GanttChartSquare} />
                <SidebarNavItem to="/costs" label={t("sidebar.costs")} icon={DollarSign} />
                <SidebarNavItem to="/activity" label={t("sidebar.activity")} icon={History} />
                <SidebarNavItem to="/company/settings" label={t("nav.settings")} icon={Settings} />
              </SidebarSection>
            </>
          )}

          {streamlinedUiEnabled ? (
            <SidebarSection
              label={t("sidebarNew.groupAdmin")}
              divider
              collapsible={{ open: adminOpen, onOpenChange: setAdminOpen }}
            >
              <SidebarNavItem to="/skills" label={t("nav.skills")} icon={Boxes} />
              <SidebarNavItem to="/apps" label={t("nav.connectors")} icon={Unplug} />
              <SidebarNavItem to="/activity" label={t("nav.audit")} icon={History} />
            </SidebarSection>
          ) : null}

          <PluginSlotOutlet
            errorBehavior="hidden"
            slotTypes={["sidebarPanel"]}
            context={pluginContext}
            className="flex flex-col gap-3"
            itemClassName="rounded-lg border border-border p-3"
            missingBehavior="placeholder"
          />
        </nav>
      </aside>
    </SidebarPrimaryNavProvider>
  );
}
