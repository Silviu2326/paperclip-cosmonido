import { SpekoPhoneLineForm } from "@/components/voice/SpekoPhoneLine";
import { SpekoIncomingCallCard } from "@/components/voice/SpekoIncomingCalls";
import { SpekoCallHistoryView, SpekoCallActivityItem, SpekoUnapprovedCallActivityItem } from "@/components/voice/SpekoCallHistory";
import { SpekoPhoneCallbackForm } from "@/components/voice/SpekoPhoneCallback";
import { SpekoProviderSetup } from "@/components/voice/SpekoProviderSetup";
import { VoiceControls } from "@/components/voice/VoiceControls";
import { VoiceTranscript } from "@/components/voice/VoiceTranscript";
import { AnimatedDialogContent } from "@/components/AnimatedDialogContent";
import { ExternalAgentPresetPicker, DotConnectionChecks } from "@/components/new-agent/ExternalAgentInviteContent";
import { AgentMailApiKeyField } from "@/features/connections/AgentMailApiKeyField";
import { TaskBrowserFooter } from "@/components/task-side-panel/TaskBrowserFooter";
import { TaskBrowserActivity } from "@/components/task-side-panel/TaskBrowserActivity";
import type { TaskBrowser } from "@paperclipai/shared";
import { DispositionRecoveryNotice } from "../components/DispositionRecoveryNotice";
import { CloudSignIn } from "../components/CloudSignIn";
import { CloudAccessError } from "../components/CloudAccessGate";
import { SetupPrompt } from "./apps/chat/SetupPrompt";
import { MediaArtifactCard } from "@/components/artifacts/MediaArtifactCard";

import { SkillSourceTree } from "./skills/SkillSourceTree";
import { SkillBinaryFile } from "../components/SkillBinaryFile";
import { WebhookUrlWarning } from "@/components/routine-triggers/WebhookUrlWarning";
import { SetupWizardNavigation, SetupWizardFooter } from "../components/SetupWizard";
import { RemoteMcpDesignExample } from "@/features/connections/remote-mcp/RemoteMcpDesignExample";
import { AgentConversationSidebar } from "@/components/AgentConversationSidebar";
import { AgentChatPicker } from "@/components/AgentChatPicker";
import { TaskChatProjectCreatedCard } from "@/components/task-chat/TaskChatProjectCreatedCard";
import { TextAttachmentPreview } from "@/components/task-side-panel/TaskAttachmentPanel";
import { AnnouncementCard } from "@/components/AnnouncementCard";
import { announcementPreview, announcementAnimationPreview, announcementAnimationPreviewSrc } from "@/lib/announcement-preview";
import { TaskDetailTasksPanel } from "@/components/task-detail/TaskDetailTasksPanel";
import { AiConnectionDesignExamples } from "@/components/ai-connections/AiConnectionDesignExamples";
import { SavedProviderKeySelect } from "../components/onboarding/SavedProviderKeySelect";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AgentCharacter } from "@/components/AgentCharacter";
import { AGENT_PALETTE_IDS, appearanceForPalette } from "@paperclipai/shared";
import { RepositoryEditor } from "@/components/RepositoryEditor";
import { TaskChatRunnerActivityGroup } from "@/components/task-chat/TaskChatRunnerActivityGroup";
import { TaskChatMarker } from "@/components/task-chat/TaskChatMarker";
import { TaskChatComposer } from "@/components/task-chat/TaskChatComposer";
import { ComposerAddMenu, ComposerModeChip } from "@/components/task-chat/ComposerAddMenu";
import type { IssueWorkMode } from "@paperclipai/shared";
import { TaskTreeControlDialog, TaskTreeControlMenuItems } from "@/components/TaskTreeControls";
import { useState } from "react";
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  CircleDot,
  Command as CommandIcon,
  DollarSign,
  Hexagon,
  History,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Mail,
  Plus,
  Search,
  Settings,
  Target,
  Trash2,
  Upload,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { InlineBanner } from "@/components/InlineBanner";
import { BuiltInLifecycleChip } from "@/components/BuiltInAgentBadges";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { AgentCapsule, AGENT_GRADIENT_COUNT } from "@/components/AgentCapsule";
import { AgentRunCard } from "@/components/ActiveAgentsPanel";
import { StatusBadge, IssueStatusBadge } from "@/components/StatusBadge";
import { StatusIcon } from "@/components/StatusIcon";
import { EnforcementBanner } from "@/components/EnforcementBanner";
import { ActionCard, ActionCardMobile, BindingsTable } from "@/components/actions/ActionCard";
import { PriorityIcon } from "@/components/PriorityIcon";
import { SHOW_TASK_PRIORITY_UI } from "@/lib/ui-flags";
import { agentStatusDot, agentStatusDotDefault } from "@/lib/status-colors";
import { EntityRow } from "@/components/EntityRow";
import { EmptyState } from "@/components/EmptyState";
import { MetricCard } from "@/components/MetricCard";
import { FilterBar, type FilterValue } from "@/components/FilterBar";
import { InlineEditor } from "@/components/InlineEditor";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Identity } from "@/components/Identity";
import { AppLogo } from "@/pages/apps/AppLogo";
import { IssueReferencePill } from "@/components/IssueReferencePill";
import { LockedIssueChip } from "@/components/LockedIssueChip";
import { MembershipAction } from "@/components/MembershipAction";
import { IssueOutputSection } from "@/components/issue-output/IssueOutputSection";
import { EnvironmentVariablesEditor } from "@/components/environment-variables-editor";
import { IssueThreadInteractionCard } from "@/components/IssueThreadInteractionCard";
import {
  connectedConnectionIntentInteraction,
  issueThreadInteractionFixtureMeta,
  pendingConnectionIntentInteraction,
  retryConnectionIntentInteraction,
} from "@/fixtures/issueThreadInteractionFixtures";
import type { CompanySecret, EnvBinding, Issue } from "@paperclipai/shared";
import { CollectionToolbar } from "@/components/CollectionToolbar";
import { IssueRow } from "@/components/IssueRow";
import {
  EnvInputsList,
  ExternalSourcesList,
  RequiredSkillsList,
  StepSkillPlan,
  StepSourcePolicy,
  TeamCard,
  TeamHierarchyPreview,
  TeamRow,
} from "@/pages/TeamCatalog";
import {
  currentInstalledState,
  onboardingTeams,
  optionalTeam,
  outOfDateInstalledState,
  sampleSkillPreparations,
  sampleTeam,
  warnTeam,
} from "@/pages/TeamCatalog.fixtures";
import type { IssueWorkProduct } from "@paperclipai/shared";
import { t, useTranslation } from "@/i18n";

/* ------------------------------------------------------------------ */
/*  Sample data for the Issue Output surface showcase                  */
/* ------------------------------------------------------------------ */

function sampleOutput(
  id: string,
  attachmentId: string,
  contentType: string,
  filename: string,
  opts: { byteSize: number; isPrimary?: boolean; createdAt: string },
): IssueWorkProduct {
  const contentPath = `/api/attachments/${attachmentId}/content`;
  return {
    id,
    companyId: "demo-company",
    projectId: null,
    issueId: "demo-issue",
    executionWorkspaceId: null,
    runtimeServiceId: null,
    type: "artifact",
    provider: "paperclip",
    externalId: null,
    title: filename,
    url: null,
    status: "active",
    reviewState: "none",
    isPrimary: Boolean(opts.isPrimary),
    healthStatus: "unknown",
    summary: null,
    createdByRunId: null,
    createdAt: new Date(opts.createdAt),
    updatedAt: new Date(opts.createdAt),
    metadata: {
      attachmentId,
      contentType,
      byteSize: opts.byteSize,
      contentPath,
      openPath: contentPath,
      downloadPath: `${contentPath}?download=1`,
      originalFilename: filename,
    },
  } as IssueWorkProduct;
}

const DESIGN_GUIDE_OUTPUTS: IssueWorkProduct[] = [
  sampleOutput("wp-vid", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "video/mp4", "q3-summary.mp4", {
    byteSize: 19_293_798,
    isPrimary: true,
    createdAt: "2026-05-30T12:00:00Z",
  }),
  sampleOutput("wp-pdf", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "application/pdf", "talking-points.pdf", {
    byteSize: 421_888,
    createdAt: "2026-05-30T11:52:00Z",
  }),
];

const DESIGN_GUIDE_DEGRADED_OUTPUTS: IssueWorkProduct[] = [
  {
    ...sampleOutput("wp-broken", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "video/mp4", "corrupt-output.mp4", {
      byteSize: 0,
      isPrimary: true,
      createdAt: "2026-05-30T12:01:00Z",
    }),
    // Strip the path metadata so it fails the shared artifact schema.
    metadata: { attachmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", contentType: "video/mp4" },
  } as IssueWorkProduct,
];

const DESIGN_GUIDE_TASK = {
  id: "design-guide-task",
  identifier: "PAP-427",
  title: t("designGuide.sampleTaskTitle"),
  status: "in_progress",
  priority: "medium",
  blockerAttention: false,
} as unknown as Issue;

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <Separator />
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
    </div>
  );
}

// Onboarding seam (design §6 + §12.5): the TeamCard tile in its "Pick a starter
// team" 3-col grid, with the first defaultInstall tile selected.
function TeamCardShowcase() {
  const [selectedId, setSelectedId] = useState(onboardingTeams[0]?.id ?? null);
  return (
    <div className="grid max-w-2xl gap-4 md:grid-cols-2 lg:grid-cols-3">
      {onboardingTeams.map((team) => (
        <TeamCard
          key={team.id}
          team={team}
          selected={team.id === selectedId}
          onSelect={() => setSelectedId(team.id)}
        />
      ))}
    </div>
  );
}

// Reusable environment-variables editor: one shared grid, in-field source
// switch, fuzzy secret picker, sensitive-value detection, inline health.
const DESIGN_GUIDE_SECRETS: CompanySecret[] = [
  {
    id: "dg-github",
    companyId: "dg",
    scope: "company",
    ownerUserId: null,
    userSecretDefinitionId: null,
    key: "github_token",
    name: "GITHUB_TOKEN",
    provider: "local_encrypted",
    status: "active",
    managedMode: "paperclip_managed",
    externalRef: null,
    providerConfigId: null,
    providerMetadata: null,
    latestVersion: 3,
    description: null,
    lastResolvedAt: null,
    lastRotatedAt: null,
    deletedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    updatedAt: new Date("2026-03-01T10:00:00.000Z"),
  },
  {
    id: "dg-db",
    companyId: "dg",
    scope: "company",
    ownerUserId: null,
    userSecretDefinitionId: null,
    key: "db_connection",
    name: "DB_CONNECTION",
    provider: "local_encrypted",
    status: "active",
    managedMode: "paperclip_managed",
    externalRef: null,
    providerConfigId: null,
    providerMetadata: null,
    latestVersion: 3,
    description: null,
    lastResolvedAt: null,
    lastRotatedAt: null,
    deletedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    updatedAt: new Date("2026-03-01T10:00:00.000Z"),
  },
];

function EnvironmentVariablesEditorShowcase() {
  const [env, setEnv] = useState<Record<string, EnvBinding>>({
    NODE_ENV: { type: "plain", value: "production" },
    GH_TOKEN: { type: "secret_ref", secretId: "dg-github", version: "latest" },
    DB_URL: { type: "secret_ref", secretId: "dg-db", version: 3 },
    STRIPE_API_KEY: { type: "plain", value: "demo-value-not-a-credential" },
  });
  return (
    <div className="max-w-(--sz-640px) rounded-md border border-border p-4">
      <EnvironmentVariablesEditor
        value={env}
        secrets={DESIGN_GUIDE_SECRETS}
        onChange={(next) => setEnv(next ?? {})}
        onCreateSecret={async (name) => ({
          ...DESIGN_GUIDE_SECRETS[0]!,
          id: `dg-${name}`,
          key: name,
          name: name.toUpperCase(),
          latestVersion: 1,
        })}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Color swatch                                                       */
/* ------------------------------------------------------------------ */

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-8 w-8 rounded-md border border-border shrink-0"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <div>
        <p className="text-xs font-mono">{cssVar}</p>
        <p className="text-xs text-muted-foreground">{name}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function TaskExecutionControlsExample() {
  const { t } = useTranslation();
  const [running, setRunning] = useState(true);
  const [dialogMode, setDialogMode] = useState<"resume" | "cancel" | "restore" | null>(null);
  const [wake, setWake] = useState(true);
  return <div className="max-w-xl space-y-4">
    <div className="w-52 rounded-md border border-border p-1">
      <TaskTreeControlMenuItems scope="subtree" canPause={running} canResume={!running} canCancel canRestore={!running}
        onPause={() => setRunning(false)} onResume={() => setDialogMode("resume")}
        onCancel={() => setDialogMode("cancel")} onRestore={() => setDialogMode("restore")} />
    </div>
    <p className="text-sm text-muted-foreground">{running ? t("designGuide.execRunning") : t("designGuide.execPaused")}</p>
    <TaskChatProjectCreatedCard item={{ id: "design-project", kind: "project_created", projectId: "example-project", name: t("designGuide.sampleProjectName"), description: t("designGuide.sampleProjectDescription"), timestamp: "2026-09-11T00:00:00Z", repositories: [{ id: "1", name: "paperclipai/paperclip", url: "https://github.com/paperclipai/paperclip" }] }} />
    {!running ? <TaskChatMarker item={{ id: "design-cancelled", kind: "marker", variant: "interrupted", tone: "neutral", label: t("designGuide.runCancelled"), detail: t("designGuide.runCancelledDetail"), collapsible: true }} /> : null}
    <TaskChatComposer pause={!running ? { scope: "subtree", onResume: () => setDialogMode("resume") } : null} onAdd={async () => {}} workMode="standard" stopScope="subtree" onStop={running ? async () => setRunning(false) : undefined} />
    <TaskTreeControlDialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) setDialogMode(null); }}
      mode={dialogMode ?? "cancel"} scope="subtree" affectedCount={3} affectedAgentCount={2} loading={false} pending={false} valid
      wakeAgents={wake} onWakeAgentsChange={setWake} onRetry={() => {}}
      onApply={() => { setRunning(dialogMode !== "cancel" && wake); setDialogMode(null); }} />
  </div>;
}

function TaskPendingInputExample() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(true);
  return <div className="max-w-xl">
    <TaskChatComposer
      onAdd={async () => {}}
      workMode="standard"
      takeover={pending && open ? {
        id: "design-question",
        label: t("designGuide.questionLabel"),
        pendingCount: 1,
        content: <div className="space-y-3 text-sm">
          <p>{t("designGuide.questionDraft")}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setPending(false)}>{t("designGuide.useDraft")}</Button>
            <Button size="sm" variant="outline" onClick={() => setPending(false)}>{t("designGuide.startFresh")}</Button>
          </div>
        </div>,
        onDismiss: () => setOpen(false),
        onSkip: () => setPending(false),
      } : null}
      pendingTakeover={pending ? { count: 1, label: t("designGuide.questionLabel"), onOpen: () => setOpen(true) } : null}
    />
  </div>;
}

function AgentChatPickerExample() {
  const { t } = useTranslation();
  const [state, setState] = useState<"closed" | "empty" | "loading" | "error">("closed");
  return <div className="flex flex-wrap gap-2">
    <Button variant="outline" onClick={() => setState("empty")}>{t("designGuide.emptyPicker")}</Button>
    <Button variant="outline" onClick={() => setState("loading")}>{t("designGuide.loadingPicker")}</Button>
    <Button variant="outline" onClick={() => setState("error")}>{t("designGuide.failedPicker")}</Button>
    <AgentChatPicker agents={[]} open={state !== "closed"} onOpenChange={(open) => { if (!open) setState("closed"); }} onSelect={() => {}}
      loading={state === "loading"} error={state === "error" ? new Error(t("designGuide.unavailable")) : null} onRetry={() => setState("empty")} />
  </div>;
}

function ComposerActionsExample() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<IssueWorkMode>("standard");
  return <div className="flex max-w-xl items-center gap-2 rounded-xl border border-border bg-card p-3">
    <ComposerAddMenu mode={mode} onModeChange={setMode} onAttachFile={() => {}} onGoal={() => {}} />
    <ComposerModeChip mode={mode} onRemove={() => setMode("standard")} />
    <span className="ml-auto text-xs text-muted-foreground">{t("designGuide.composerActionsHint")}</span>
  </div>;
}

export function DesignGuide() {
  const { t } = useTranslation();
  const [agentmailDemoKey, setAgentmailDemoKey] = useState("");
  const [wizardStep, setWizardStep] = useState(0);
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [selectValue, setSelectValue] = useState("in_progress");
  const [menuChecked, setMenuChecked] = useState(true);
  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  const [inlineText, setInlineText] = useState(() => t("designGuide.inlineTextDefault"));
  const [inlineTitle, setInlineTitle] = useState(() => t("designGuide.editableTitle"));
  const [inlineDesc, setInlineDesc] = useState(
    () => t("designGuide.inlineDescDefault")
  );
  const [filters, setFilters] = useState<FilterValue[]>([
    { key: "status", label: t("designGuide.statusLabel"), value: t("designGuide.statusActive") },
    // PAP-411: priority filter demo row suppressed while SHOW_TASK_PRIORITY_UI is off.
    ...(SHOW_TASK_PRIORITY_UI
      ? [{ key: "priority", label: t("designGuide.priorityLabel"), value: t("designGuide.priorityHigh") } as FilterValue]
      : []),
  ]);
  const [allowExternal, setAllowExternal] = useState(false);
  const [allowUnpinned, setAllowUnpinned] = useState(false);
  const [allowLocalPath, setAllowLocalPath] = useState(false);

  return (
    <div className="space-y-10 max-w-4xl">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold">{t("designGuide.pageTitle")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("designGuide.pageIntro")}
        </p>
      </div>

      {/* ============================================================ */}
      {/*  COVERAGE                                                     */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionCoverage")}>
        <p className="text-sm text-muted-foreground">
          {t("designGuide.coverageNote")}
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <SubSection title={t("designGuide.uiPrimitives")}>
            <div className="flex flex-wrap gap-2">
              {[
                "avatar", "badge", "breadcrumb", "button", "card", "checkbox", "collapsible",
                "command", "dialog", "dropdown-menu", "input", "label", "popover", "resizable-panels",
                "scroll-area", "select", "separator", "sheet", "skeleton", "tabs", "textarea", "tooltip",
              ].map((name) => (
                <Badge key={name} variant="outline" className="font-mono text-(length:--text-nano)">
                  {name}
                </Badge>
              ))}
            </div>
          </SubSection>
          <SubSection title={t("designGuide.appComponents")}>
            <div className="flex flex-wrap gap-2">
              {[
                "StatusBadge", "StatusIcon", "PriorityIcon", "EntityRow", "EmptyState", "MetricCard",
                "FilterBar", "InlineEditor", "PageSkeleton", "Identity", "CommentThread", "MarkdownEditor",
                "PropertiesPanel", "Sidebar", "CommandPalette", "EnvironmentVariablesEditor",
                "InlineBanner", "BuiltInAgentGate", "BuiltInLifecycleChip", "CollectionToolbar",
                "IssueRow", "ContextualSidebarFrame",
              ].map((name) => (
                <Badge key={name} variant="ghost" className="font-mono text-(length:--text-nano)">
                  {name}
                </Badge>
              ))}
            </div>
          </SubSection>
        </div>
      </Section>

      <Section title={t("designGuide.sectionAnnouncements")}>
        <div className="grid gap-4 md:grid-cols-2">
          <AnnouncementCard announcement={announcementAnimationPreview} imageSrc="/announcement-preview.svg" animationSrc={announcementAnimationPreviewSrc} onDismiss={() => {}} />
          <AnnouncementCard announcement={announcementPreview} imageSrc="/announcement-preview.svg" onDismiss={() => {}} />
          <AnnouncementCard announcement={{ ...announcementPreview, image: undefined, secondaryLink: undefined }} onDismiss={() => {}} />
        </div>
      </Section>

      <Section title={t("designGuide.sectionTaskExecution")}>
        <TaskExecutionControlsExample />
      </Section>

      <Section title={t("designGuide.sectionComposerActions")}>
        <ComposerActionsExample />
      </Section>

      <Section title={t("designGuide.sectionTaskCollection")}>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("designGuide.collectionIntro")}
        </p>
        <CollectionToolbar
          context={<span className="text-sm font-medium">{t("designGuide.recentTasks")}</span>}
          search={<Input aria-label={t("designGuide.searchCollectionAria")} placeholder={t("designGuide.searchTasksPlaceholder")} />}
          controls={<Button variant="outline" size="sm">{t("designGuide.filter")}</Button>}
          actions={<Button size="sm">{t("designGuide.newTask")}</Button>}
          feedback={<span className="text-xs text-muted-foreground">{t("designGuide.collectionFeedback")}</span>}
        />
        <div className="overflow-hidden rounded-lg border border-border">
          <IssueRow
            issue={DESIGN_GUIDE_TASK}
            presentation="task"
            unreadState="visible"
            metadata={<span className="text-xs text-muted-foreground">{t("designGuide.updatedAgo")}</span>}
            actions={<Button variant="ghost" size="xs">{t("designGuide.more")}</Button>}
          />
        </div>
      </Section>

      <Section title={t("designGuide.sectionThemeToggle")}>
        <SubSection title={t("designGuide.variants")}>
          <div className="flex max-w-sm flex-col items-start gap-3">
            <ThemeToggle />
            <ThemeToggle variant="menu-action" />
            <ThemeToggle variant="compact-menu-action" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  COLORS                                                       */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionColors")}>
        <SubSection title={t("designGuide.colorsCore")}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Swatch name={t("designGuide.colorBackground")} cssVar="--background" />
            <Swatch name={t("designGuide.colorForeground")} cssVar="--foreground" />
            <Swatch name={t("designGuide.colorCard")} cssVar="--card" />
            <Swatch name={t("designGuide.colorPrimary")} cssVar="--primary" />
            <Swatch name={t("designGuide.colorPrimaryForeground")} cssVar="--primary-foreground" />
            <Swatch name={t("designGuide.colorSecondary")} cssVar="--secondary" />
            <Swatch name={t("designGuide.colorMuted")} cssVar="--muted" />
            <Swatch name={t("designGuide.colorMutedForeground")} cssVar="--muted-foreground" />
            <Swatch name={t("designGuide.colorAccent")} cssVar="--accent" />
            <Swatch name={t("designGuide.colorDestructive")} cssVar="--destructive" />
            <Swatch name={t("designGuide.colorBorder")} cssVar="--border" />
            <Swatch name={t("designGuide.colorRing")} cssVar="--ring" />
          </div>
        </SubSection>

        <SubSection title={t("designGuide.colorsSidebar")}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Swatch name={t("designGuide.colorSidebarName")} cssVar="--sidebar" />
            <Swatch name={t("designGuide.colorSidebarBorder")} cssVar="--sidebar-border" />
          </div>
        </SubSection>

        <SubSection title={t("designGuide.colorsChart")}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Swatch name={t("designGuide.chartNumber", { n: 1 })} cssVar="--chart-1" />
            <Swatch name={t("designGuide.chartNumber", { n: 2 })} cssVar="--chart-2" />
            <Swatch name={t("designGuide.chartNumber", { n: 3 })} cssVar="--chart-3" />
            <Swatch name={t("designGuide.chartNumber", { n: 4 })} cssVar="--chart-4" />
            <Swatch name={t("designGuide.chartNumber", { n: 5 })} cssVar="--chart-5" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TYPOGRAPHY                                                   */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionRunnerActivity")}>
        <TaskChatRunnerActivityGroup item={{ id: "design-runner-activity", kind: "activity_phase", active: true, summary: "", interstitial: { id: "design-runner-commentary", kind: "message", author: "agent", text: t("designGuide.runnerCommentary"), interstitial: true }, items: [
          { id: "design-runner-read", kind: "tool", name: "read", target: "TaskChatRunnerTurn.tsx", status: "completed", detail: t("designGuide.runnerFound") },
          { id: "design-runner-check", kind: "tool", name: "exec_command", target: "pnpm check:token-gates", status: "in_progress" },
        ] }} />
        <TaskChatRunnerActivityGroup item={{ id: "design-runner-completed", kind: "activity_phase", active: false, summary: "", items: [
          { id: "design-completed-read", kind: "tool", name: "read", target: "TaskChatRunnerTurn.tsx", status: "completed", detail: t("designGuide.runnerRead") },
          { id: "design-completed-check", kind: "tool", name: "exec_command", target: "pnpm check:token-gates", status: "failed", detail: t("designGuide.runnerNeedsPass") },
        ] }} />
      </Section>

      <Section title={t("designGuide.sectionTypography")}>
        <div className="space-y-3">
          <h2 className="text-xl font-bold">{t("designGuide.typePageTitle")}</h2>
          <h2 className="text-lg font-semibold">{t("designGuide.typeSectionTitle")}</h2>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("designGuide.typeSectionHeading")}
          </h3>
          <p className="text-sm font-medium">{t("designGuide.typeCardTitle")}</p>
          <p className="text-sm font-semibold">{t("designGuide.typeCardTitleAlt")}</p>
          <p className="text-sm">{t("designGuide.typeBody")}</p>
          <p className="text-sm text-muted-foreground">
            {t("designGuide.typeMutedDescription")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("designGuide.typeTinyLabel")}
          </p>
          <p className="text-sm font-mono text-muted-foreground">
            {t("designGuide.typeMonoIdentifier")}
          </p>
          <p className="text-2xl font-bold">{t("designGuide.typeLargeStat")}</p>
          <p className="font-mono text-xs">{t("designGuide.typeLogText")}</p>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SPACING & RADIUS                                             */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionRadius")}>
        <div className="flex items-end gap-4 flex-wrap">
          {[
            ["sm", "var(--radius-sm)"],
            ["md", "var(--radius-md)"],
            ["lg", "var(--radius-lg)"],
            ["xl", "var(--radius-xl)"],
            ["full", "9999px"],
          ].map(([label, radius]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 bg-primary"
                style={{ borderRadius: radius }}
              />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  BUTTONS                                                      */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionButtons")}>
        <SubSection title={t("designGuide.variants")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="default">{t("designGuide.default")}</Button>
            <Button variant="secondary">{t("designGuide.secondary")}</Button>
            <Button variant="outline">{t("designGuide.outline")}</Button>
            <Button variant="ghost">{t("designGuide.ghost")}</Button>
            <Button variant="destructive">{t("designGuide.destructive")}</Button>
            <Button variant="link">{t("designGuide.link")}</Button>
          </div>
        </SubSection>

        <SubSection title={t("designGuide.sizes")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="xs">{t("designGuide.extraSmall")}</Button>
            <Button size="sm">{t("designGuide.small")}</Button>
            <Button size="default">{t("designGuide.default")}</Button>
            <Button size="lg">{t("designGuide.large")}</Button>
          </div>
        </SubSection>

        <SubSection title={t("designGuide.iconButtons")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="icon-xs"><Search /></Button>
            <Button variant="ghost" size="icon-sm"><Search /></Button>
            <Button variant="outline" size="icon"><Search /></Button>
            <Button variant="outline" size="icon-lg"><Search /></Button>
          </div>
        </SubSection>

        <SubSection title={t("designGuide.withIcons")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button><Plus /> {t("designGuide.newIssue")}</Button>
            <Button variant="outline"><Upload /> {t("designGuide.upload")}</Button>
            <Button variant="destructive"><Trash2 /> {t("designGuide.delete")}</Button>
            <Button size="sm"><Plus /> {t("designGuide.add")}</Button>
          </div>
        </SubSection>

        <SubSection title={t("designGuide.statesLabel")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button disabled>{t("designGuide.disabled")}</Button>
            <Button variant="outline" disabled>{t("designGuide.disabledOutline")}</Button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  BADGES                                                       */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionBadges")}>
        <SubSection title={t("designGuide.variants")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default">{t("designGuide.default")}</Badge>
            <Badge variant="secondary">{t("designGuide.secondary")}</Badge>
            <Badge variant="outline">{t("designGuide.outline")}</Badge>
            <Badge variant="destructive">{t("designGuide.destructive")}</Badge>
            <Badge variant="ghost">{t("designGuide.ghost")}</Badge>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  STATUS BADGES & ICONS                                        */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionStatusSystem")}>
        <SubSection title={t("designGuide.statusBadgeAll")}>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              "active", "running", "paused", "idle", "archived", "planned",
              "achieved", "completed", "failed", "timed_out", "succeeded", "error",
              "pending_approval", "backlog", "todo", "in_progress", "in_review", "blocked",
              "done", "terminated", "cancelled", "pending", "revision_requested",
              "approved", "rejected",
            ].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </SubSection>

        <SubSection title={t("designGuide.issueStatusBadgeTitle")}>
          <div className="flex items-center gap-2 flex-wrap">
            {["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"].map(
              (s) => (
                <IssueStatusBadge key={s} status={s} />
              )
            )}
          </div>
        </SubSection>

        <SubSection title={t("designGuide.idleSlackConversation")}>
          <StatusIcon status="in_review" externalConversationState="waiting" showLabel />
          <IssueStatusBadge status="in_review" externalConversationState="waiting" />
        </SubSection>
        <SubSection title={t("designGuide.statusIconInteractive")}>
          <div className="flex items-center gap-3 flex-wrap">
            {["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"].map(
              (s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <StatusIcon status={s} />
                  <span className="text-xs text-muted-foreground">{s}</span>
                </div>
              )
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <StatusIcon status={status} onChange={setStatus} />
            <span className="text-sm">{t("designGuide.statusIconHint", { status })}</span>
          </div>
        </SubSection>

        {/* PAP-411: PriorityIcon showcase gated behind SHOW_TASK_PRIORITY_UI per board decision. */}
        {SHOW_TASK_PRIORITY_UI && (
        <SubSection title={t("designGuide.priorityIconInteractive")}>
          <div className="flex items-center gap-3 flex-wrap">
            {["critical", "high", "medium", "low"].map((p) => (
              <div key={p} className="flex items-center gap-1.5">
                <PriorityIcon priority={p} />
                <span className="text-xs text-muted-foreground">{p}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <PriorityIcon priority={priority} onChange={setPriority} />
            <span className="text-sm">{t("designGuide.priorityIconHint", { priority })}</span>
          </div>
        </SubSection>
        )}

        <SubSection title={t("designGuide.agentStatusDots")}>
          <div className="flex items-center gap-4 flex-wrap">
            {(["running", "active", "paused", "error", "archived"] as const).map((label) => (
              <div key={label} className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`inline-flex h-full w-full rounded-full ${agentStatusDot[label] ?? agentStatusDotDefault}`} />
                </span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </SubSection>

        <SubSection title={t("designGuide.runInvocationBadges")}>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              ["timer", "bg-primary/10 text-primary dark:bg-primary/50"],
              ["assignment", "bg-secondary text-violet-700 dark:bg-secondary/50 dark:text-violet-300"],
              ["on_demand", "bg-secondary text-cyan-700 dark:bg-secondary/50 dark:text-cyan-300"],
              ["automation", "bg-muted text-muted-foreground"],
            ].map(([label, cls]) => (
              <Badge variant="ghost" key={label} className={`px-1.5 text-(length:--text-nano) ${cls}`}>
                {label}
              </Badge>
            ))}
          </div>
        </SubSection>

        <SubSection title="IssueReferencePill">
          <p className="text-xs text-muted-foreground">
            {t("designGuide.refPillUsage")}
            {" "}{t("designGuide.refPillPass")} <code className="font-mono">status</code> {t("designGuide.refPillStatusHint")}
            {" "}{t("designGuide.refPillUse")} <code className="font-mono">variant="property"</code> {t("designGuide.refPillPropertyHint")}
            {" "}{t("designGuide.refPillPass")} <code className="font-mono">onRemove</code> {t("designGuide.refPillRemoveHint")}
            {" "}{t("designGuide.refPillUse")} <code className="font-mono">strikethrough</code> {t("designGuide.refPillStrikeHint")}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <IssueReferencePill issue={{ id: "demo-1", identifier: "PAP-123", title: t("designGuide.refIdentifierOnly") }} />
            <IssueReferencePill issue={{ id: "demo-2", identifier: "PAP-456", title: t("designGuide.refInProgress"), status: "in_progress" }} />
            <IssueReferencePill issue={{ id: "demo-3", identifier: "PAP-789", title: t("designGuide.refDone"), status: "done" }} />
            <IssueReferencePill issue={{ id: "demo-4", identifier: "PAP-101", title: t("designGuide.refBlocked"), status: "blocked" }} />
            <IssueReferencePill onRemove={() => window.alert(t("designGuide.blockerRemoved"))} issue={{ id: "demo-blocker", identifier: "PAP-303", title: t("designGuide.refHoverRemove"), status: "in_review" }} />
            <IssueReferencePill strikethrough issue={{ id: "demo-5", identifier: "PAP-202", title: t("designGuide.refStrikethrough"), status: "todo" }} />
          </div>
        </SubSection>

        <SubSection title="LockedIssueChip">
          <p className="text-xs text-muted-foreground">
            {t("designGuide.lockedDesc")}{" "}
            <strong>{t("designGuide.lockedDescStrong")}</strong>{t("designGuide.lockedDescEnd")}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <LockedIssueChip identifier="PAP-1234" />
            <LockedIssueChip identifier={null} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  AGENT CAPSULE                                                */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionAgentCapsule")}>
        <p className="text-sm text-muted-foreground max-w-prose">
          {t("designGuide.capsuleIntro")}<code className="font-mono">--agent-Na</code> →{" "}
          <code className="font-mono">--agent-Nb</code>); <code className="font-mono">prefers-reduced-motion</code>{" "}
          {t("designGuide.capsuleReducedMotion")}
        </p>
        <SubSection title={t("designGuide.statesLabel")}>
          <div className="flex items-end gap-10">
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="slot" />
              <span className="text-xs text-muted-foreground">{t("designGuide.capsuleSlot")}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="configured" />
              <span className="text-xs text-muted-foreground">{t("designGuide.capsuleConfigured")}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" gradient={5} />
              <span className="text-xs text-muted-foreground">{t("designGuide.capsuleOnline")}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" gradient={5} glow="blue" />
              <span className="text-xs text-muted-foreground">{t("designGuide.capsuleOnlineBlue")}</span>
            </div>
          </div>
        </SubSection>
        <SubSection title={t("designGuide.sizes")}>
          <div className="flex items-end gap-8">
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" size="sm" gradient={1} />
              <span className="text-xs text-muted-foreground">sm</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" size="md" gradient={4} />
              <span className="text-xs text-muted-foreground">md</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" size="lg" gradient={8} />
              <span className="text-xs text-muted-foreground">lg</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" size={{ width: 28, height: 96 }} gradient={6} />
              <span className="text-xs text-muted-foreground">{t("designGuide.capsuleCustomPx")}</span>
            </div>
          </div>
        </SubSection>
        <SubSection title={t("designGuide.capsuleGradients")}>
          <div className="flex items-end gap-3 flex-wrap">
            {Array.from({ length: AGENT_GRADIENT_COUNT }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <AgentCapsule state="online" size="sm" gradient={i + 1} />
                <span className="text-(length:--text-nano) font-mono text-muted-foreground">{i + 1}</span>
              </div>
            ))}
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  FORM ELEMENTS                                                */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionFormElements")}>
        <div className="grid gap-6 md:grid-cols-2">
          <SubSection title={t("designGuide.inputTitle")}>
            <Input placeholder={t("designGuide.defaultInputPlaceholder")} />
            <Input placeholder={t("designGuide.disabledInputPlaceholder")} disabled className="mt-2" />
          </SubSection>

          <SubSection title={t("designGuide.textareaTitle")}>
            <Textarea placeholder={t("designGuide.writeSomethingPlaceholder")} />
          </SubSection>

          <SubSection title={t("designGuide.checkboxLabelTitle")}>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="check1" defaultChecked />
                <Label htmlFor="check1">{t("designGuide.checkedItem")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="check2" />
                <Label htmlFor="check2">{t("designGuide.uncheckedItem")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="check3" disabled />
                <Label htmlFor="check3">{t("designGuide.disabledItem")}</Label>
              </div>
            </div>
          </SubSection>

          <SubSection title={t("designGuide.inlineEditorTitle")}>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("designGuide.inlineTitleLabel")}</p>
                <InlineEditor
                  value={inlineTitle}
                  onSave={setInlineTitle}
                  as="h2"
                  className="text-xl font-bold"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("designGuide.inlineBodyLabel")}</p>
                <InlineEditor
                  value={inlineText}
                  onSave={setInlineText}
                  as="p"
                  className="text-sm"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("designGuide.inlineDescLabel")}</p>
                <InlineEditor
                  value={inlineDesc}
                  onSave={setInlineDesc}
                  as="p"
                  className="text-sm text-muted-foreground"
                  placeholder={t("designGuide.addDescriptionPlaceholder")}
                  multiline
                />
              </div>
            </div>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SELECT                                                       */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionSelect")}>
        <p className="mb-4 text-sm text-muted-foreground">{t("designGuide.selectIntro")}</p>
        <div className="grid gap-6 md:grid-cols-2">
          <SubSection title={t("designGuide.defaultSize")}>
            <Select value={selectValue} onValueChange={setSelectValue}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("designGuide.selectStatusPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">Backlog</SelectItem>
                <SelectItem value="todo">{t("designGuide.statusTodo")}</SelectItem>
                <SelectItem value="in_progress">{t("designGuide.statusInProgress")}</SelectItem>
                <SelectItem value="in_review">{t("designGuide.statusInReview")}</SelectItem>
                <SelectItem value="done">{t("designGuide.statusDone")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("designGuide.currentValue", { value: selectValue })}</p>
          </SubSection>
          <SubSection title={t("designGuide.smallTrigger")}>
            <Select defaultValue="high">
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">{t("designGuide.priorityCritical")}</SelectItem>
                <SelectItem value="high">{t("designGuide.priorityHigh")}</SelectItem>
                <SelectItem value="medium">{t("designGuide.priorityMedium")}</SelectItem>
                <SelectItem value="low">{t("designGuide.priorityLow")}</SelectItem>
              </SelectContent>
            </Select>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  DROPDOWN MENU                                                */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionDropdownMenu")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {t("designGuide.quickActions")}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem>
              <Check className="h-4 w-4" />
              {t("designGuide.markAsDone")}
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <BookOpen className="h-4 w-4" />
              {t("designGuide.openDocs")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={menuChecked}
              onCheckedChange={(value) => setMenuChecked(value === true)}
            >
              {t("designGuide.watchIssue")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem variant="destructive">
              <Trash2 className="h-4 w-4" />
              {t("designGuide.deleteIssue")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      {/* ============================================================ */}
      {/*  POPOVER                                                      */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionPopover")}>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">{t("designGuide.openPopover")}</Button>
          </PopoverTrigger>
          <PopoverContent className="space-y-2">
            <p className="text-sm font-medium">{t("designGuide.agentHeartbeat")}</p>
            <p className="text-xs text-muted-foreground">
              {t("designGuide.heartbeatLastRun")}
            </p>
            <Button size="xs">{t("designGuide.wakeNow")}</Button>
          </PopoverContent>
        </Popover>
      </Section>

      {/* ============================================================ */}
      {/*  COLLAPSIBLE                                                  */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionCollapsible")}>
        <Collapsible open={collapsibleOpen} onOpenChange={setCollapsibleOpen} className="space-y-2">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              {collapsibleOpen ? t("designGuide.hideAdvancedFilters") : t("designGuide.showAdvancedFilters")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="rounded-md border border-border p-3">
            <div className="space-y-2">
              <Label htmlFor="owner-filter">{t("designGuide.ownerLabel")}</Label>
              <Input id="owner-filter" placeholder={t("designGuide.filterByAgentPlaceholder")} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Section>

      {/* ============================================================ */}
      {/*  SHEET                                                        */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionSheet")}>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">{t("designGuide.openSidePanel")}</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>{t("designGuide.issueProperties")}</SheetTitle>
              <SheetDescription>{t("designGuide.editMetadataHint")}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="space-y-1">
                <Label htmlFor="sheet-title">{t("designGuide.labelTitle")}</Label>
                <Input id="sheet-title" defaultValue={t("designGuide.sheetTitleValue")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sheet-description">{t("designGuide.labelDescription")}</Label>
                <Textarea id="sheet-description" defaultValue={t("designGuide.sheetDescriptionValue")} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline">{t("designGuide.cancel")}</Button>
              <Button>{t("designGuide.save")}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Section>

      {/* ============================================================ */}
      {/*  SCROLL AREA                                                  */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionScrollArea")}>
        <ScrollArea className="h-36 rounded-md border border-border">
          <div className="space-y-2 p-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border p-2 text-sm">
                {t("designGuide.heartbeatRun", { n: i + 1 })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Section>

      {/* ============================================================ */}
      {/*  COMMAND                                                      */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionCommand")}>
        <div className="rounded-md border border-border">
          <Command>
            <CommandInput placeholder={t("designGuide.commandPlaceholder")} />
            <CommandList>
              <CommandEmpty>{t("designGuide.noResults")}</CommandEmpty>
              <CommandGroup heading={t("designGuide.groupPages")}>
                <CommandItem>
                  <LayoutDashboard className="h-4 w-4" />
                  {t("designGuide.navDashboard")}
                </CommandItem>
                <CommandItem>
                  <CircleDot className="h-4 w-4" />
                  {t("designGuide.navIssues")}
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={t("designGuide.groupActions")}>
                <CommandItem>
                  <CommandIcon className="h-4 w-4" />
                  {t("designGuide.openCommandPalette")}
                </CommandItem>
                <CommandItem>
                  <Plus className="h-4 w-4" />
                  {t("designGuide.createNewIssue")}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  BREADCRUMB                                                   */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionBreadcrumb")}>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">{t("designGuide.navProjects")}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">{t("designGuide.breadcrumbPaperclipApp")}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("designGuide.breadcrumbIssueList")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Section>

      {/* ============================================================ */}
      {/*  CARDS                                                        */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionCards")}>
        <SubSection title={t("designGuide.dashboardAgentRuns")}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {["running", "queued", "succeeded", "failed", "timed_out", "cancelled", "interrupted"].map((status) => (
              <AgentRunCard
                key={status}
                companyId="design-guide"
                run={{
                  id: `design-guide-${status}`, agentId: "design-guide-agent", agentName: "CodexCoder",
                  status, adapterType: "codex_local", invocationSource: "on_demand", triggerDetail: "manual",
                  startedAt: null, finishedAt: null, createdAt: "2026-09-11T12:00:00Z", issueId: "design-guide-task",
                }}
                issue={{ identifier: "PAP-559", title: t("designGuide.sampleWireframeTitle"), status: status === "succeeded" ? "done" : "in_progress" }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("designGuide.dashboardRunsNote")}</p>
        </SubSection>
        <SubSection title={t("designGuide.standardCard")}>
          <Card>
            <CardHeader>
              <CardTitle>{t("designGuide.cardTitle")}</CardTitle>
              <CardDescription>{t("designGuide.cardDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{t("designGuide.cardContent")}</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">{t("designGuide.action")}</Button>
              <Button variant="outline" size="sm">{t("designGuide.cancel")}</Button>
            </CardFooter>
          </Card>
        </SubSection>

        <SubSection title={t("designGuide.metricCards")}>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard icon={Bot} value={12} label={t("designGuide.metricActiveAgents")} description={t("designGuide.metricActiveAgentsDelta")} />
            <MetricCard icon={CircleDot} value={48} label={t("designGuide.metricOpenIssues")} />
            <MetricCard icon={DollarSign} value="$1,234" label={t("designGuide.metricMonthlyCost")} description={t("designGuide.metricUnderBudget")} />
            <MetricCard icon={Zap} value="99.9%" label={t("designGuide.metricUptime")} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TABS                                                         */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionTabs")}>
        <SubSection title={t("designGuide.pillVariant")}>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">{t("designGuide.tabOverview")}</TabsTrigger>
              <TabsTrigger value="runs">{t("designGuide.tabRuns")}</TabsTrigger>
              <TabsTrigger value="config">{t("designGuide.tabConfig")}</TabsTrigger>
              <TabsTrigger value="costs">{t("designGuide.tabCosts")}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="text-sm text-muted-foreground py-4">{t("designGuide.tabOverviewContent")}</p>
            </TabsContent>
            <TabsContent value="runs">
              <p className="text-sm text-muted-foreground py-4">{t("designGuide.tabRunsContent")}</p>
            </TabsContent>
            <TabsContent value="config">
              <p className="text-sm text-muted-foreground py-4">{t("designGuide.tabConfigContent")}</p>
            </TabsContent>
            <TabsContent value="costs">
              <p className="text-sm text-muted-foreground py-4">{t("designGuide.tabCostsContent")}</p>
            </TabsContent>
          </Tabs>
        </SubSection>

        <SubSection title={t("designGuide.lineVariant")}>
          <Tabs defaultValue="summary">
            <TabsList variant="line">
              <TabsTrigger value="summary">{t("designGuide.tabSummary")}</TabsTrigger>
              <TabsTrigger value="details">{t("designGuide.tabDetails")}</TabsTrigger>
              <TabsTrigger value="comments">{t("designGuide.tabComments")}</TabsTrigger>
            </TabsList>
            <TabsContent value="summary">
              <p className="text-sm text-muted-foreground py-4">{t("designGuide.tabSummaryContent")}</p>
            </TabsContent>
            <TabsContent value="details">
              <p className="text-sm text-muted-foreground py-4">{t("designGuide.tabDetailsContent")}</p>
            </TabsContent>
            <TabsContent value="comments">
              <p className="text-sm text-muted-foreground py-4">{t("designGuide.tabCommentsContent")}</p>
            </TabsContent>
          </Tabs>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  ENTITY ROWS                                                  */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionEntityRows")}>
        <div className="border border-border rounded-md">
          <EntityRow
            leading={
              <>
                <StatusIcon status="in_progress" />
                {/* PAP-411: PriorityIcon hidden behind SHOW_TASK_PRIORITY_UI. */}
                {SHOW_TASK_PRIORITY_UI && <PriorityIcon priority="high" />}
              </>
            }
            identifier="PAP-001"
            title={t("designGuide.entityAuthFlow")}
            subtitle={t("designGuide.entityResponsible")}
            trailing={<IssueStatusBadge status="in_progress" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="done" />
                {SHOW_TASK_PRIORITY_UI && <PriorityIcon priority="medium" />}
              </>
            }
            identifier="PAP-002"
            title={t("designGuide.entityCiCd")}
            subtitle={t("designGuide.entityCompletedDaysAgo")}
            trailing={<IssueStatusBadge status="done" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="todo" />
                {SHOW_TASK_PRIORITY_UI && <PriorityIcon priority="low" />}
              </>
            }
            identifier="PAP-003"
            title={t("designGuide.entityApiDocs")}
            trailing={<IssueStatusBadge status="todo" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="blocked" />
                {SHOW_TASK_PRIORITY_UI && <PriorityIcon priority="critical" />}
              </>
            }
            identifier="PAP-004"
            title={t("designGuide.entityDeploy")}
            subtitle={t("designGuide.entityBlockedBy")}
            trailing={<IssueStatusBadge status="blocked" />}
            selected
          />
        </div>
        <SubSection title={t("designGuide.membershipAction")}>
          <div className="border border-border rounded-md">
            <EntityRow
              title={t("designGuide.joinedResource")}
              subtitle={t("designGuide.membershipJoinedHint")}
              className="group"
              trailing={
                <MembershipAction
                  state="joined"
                  resourceName={t("designGuide.joinedResource")}
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
            <EntityRow
              title={t("designGuide.leftResource")}
              subtitle={t("designGuide.membershipLeftHint")}
              className="group text-foreground/55"
              trailing={
                <MembershipAction
                  state="left"
                  resourceName={t("designGuide.leftResource")}
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
            <EntityRow
              title={t("designGuide.leavingResource")}
              subtitle={t("designGuide.membershipLeavingHint")}
              className="group text-foreground/55"
              trailing={
                <MembershipAction
                  state="left"
                  pending
                  pendingState="left"
                  resourceName={t("designGuide.leavingResource")}
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
            <EntityRow
              title={t("designGuide.joiningResource")}
              subtitle={t("designGuide.membershipJoiningHint")}
              className="group"
              trailing={
                <MembershipAction
                  state="joined"
                  pending
                  pendingState="joined"
                  resourceName={t("designGuide.joiningResource")}
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  FILTER BAR                                                   */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionFilterBar")}>
        <FilterBar
          filters={filters}
          onRemove={(key) => setFilters((f) => f.filter((x) => x.key !== key))}
          onClear={() => setFilters([])}
        />
        {filters.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setFilters([
                { key: "status", label: t("designGuide.statusLabel"), value: t("designGuide.statusActive") },
                // PAP-411: priority filter demo row suppressed while SHOW_TASK_PRIORITY_UI is off.
                ...(SHOW_TASK_PRIORITY_UI
                  ? [{ key: "priority", label: t("designGuide.priorityLabel"), value: t("designGuide.priorityHigh") } as FilterValue]
                  : []),
              ])
            }
          >
            {t("designGuide.resetFilters")}
          </Button>
        )}
      </Section>

      {/* ============================================================ */}
      {/*  AVATARS                                                      */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionAvatars")}>
        <SubSection title={t("designGuide.sizes")}>
          <div className="flex items-center gap-3">
            <Avatar size="sm"><AvatarFallback>SM</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>DF</AvatarFallback></Avatar>
            <Avatar size="lg"><AvatarFallback>LG</AvatarFallback></Avatar>
          </div>
        </SubSection>

        <SubSection title={t("designGuide.avatarGroup")}>
          <AvatarGroup>
            <Avatar><AvatarFallback>A1</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>A2</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>A3</AvatarFallback></Avatar>
            <AvatarGroupCount>+5</AvatarGroupCount>
          </AvatarGroup>
        </SubSection>
      </Section>

      <Section title={t("designGuide.sectionAppLogos")}>
        <SubSection title={t("designGuide.appLogosSubtitle")}>
          <div className="flex items-center gap-3">
            <AppLogo
              name="Notion"
              logoUrl="/brands/apps/notion.svg"
              darkLogoUrl="/brands/apps/notion-dark.svg"
              size={36}
            />
            <AppLogo name="Jira" logoUrl="/brands/apps/jira.svg" darkLogoUrl="/brands/apps/jira-dark.svg" size={44} />
            <AppLogo name="Fallback" logoUrl="/brands/apps/does-not-exist.svg" size={36} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  IDENTITY                                                     */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionAgentPersonas")}>
        <SubSection title={t("designGuide.stablePaletteIdentities")}>
          <div className="flex flex-wrap gap-3">{AGENT_PALETTE_IDS.map(palette => <AgentAvatar key={palette} appearance={appearanceForPalette(palette)} size={48} label={palette} />)}</div>
        </SubSection>
        <SubSection title={t("designGuide.onboardingLiveCharacter")}>
          <p className="text-sm text-muted-foreground">{t("designGuide.liveCharacterNote")}</p>
          <div className="flex gap-4"><AgentCharacter muted state="sleepy" motion="still" size={128} /><AgentCharacter size={128} /></div>
        </SubSection>
      </Section>
      <Section title={t("designGuide.sectionHumanIdentity")}>
        <SubSection title={t("designGuide.sizes")}>
          <div className="flex items-center gap-6">
            <Identity name="Alex Morgan" size="sm" />
            <Identity name="Alex Morgan" />
            <Identity name="Alex Morgan" size="lg" />
          </div>
        </SubSection>

        <SubSection title={t("designGuide.initialsDerivation")}>
          <div className="flex flex-col gap-2">
            <Identity name="Casey Jordan" size="sm" />
            <Identity name="Alpha" size="sm" />
            <Identity name="Quinn Lee" size="sm" />
          </div>
        </SubSection>

        <SubSection title={t("designGuide.customInitials")}>
          <Identity name={t("designGuide.backendServiceName")} initials="BS" size="sm" />
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TOOLTIPS                                                     */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionTooltips")}>
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">{t("designGuide.hoverMe")}</Button>
            </TooltipTrigger>
            <TooltipContent>{t("designGuide.tooltipText")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm"><Settings /></Button>
            </TooltipTrigger>
            <TooltipContent>{t("designGuide.settings")}</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  DIALOG                                                       */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionDialog")}>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t("designGuide.openDialog")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("designGuide.dialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("designGuide.dialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("designGuide.nameLabel")}</Label>
                <Input placeholder={t("designGuide.enterNamePlaceholder")} className="mt-1.5" />
              </div>
              <div>
                <Label>{t("designGuide.labelDescription")}</Label>
                <Textarea placeholder={t("designGuide.describePlaceholder")} className="mt-1.5" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">{t("designGuide.cancel")}</Button>
              <Button>{t("designGuide.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      {/* ============================================================ */}
      {/*  EMPTY STATE                                                  */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionEmptyState")}>
        <div className="border border-border rounded-md">
          <EmptyState
            icon={Inbox}
            message={t("designGuide.emptyStateMessage")}
            action={t("designGuide.createItem")}
            onAction={() => {}}
          />
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PROGRESS BARS                                                */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionProgressBars")}>
        <div className="space-y-3">
          {[
            { label: t("designGuide.budgetUnder"), pct: 40, color: "bg-green-400" },
            { label: t("designGuide.budgetWarning"), pct: 75, color: "bg-yellow-400" },
            { label: t("designGuide.budgetOver"), pct: 95, color: "bg-destructive/20" },
          ].map(({ label, pct, color }) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-mono">{pct}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-(--tp-width-background-color) duration-150 ${color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  LOG VIEWER                                                   */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionLogViewer")}>
        <div className="bg-card rounded-lg p-3 font-mono text-xs max-h-80 overflow-y-auto">
          <div className="text-foreground">{t("designGuide.logLine1")}</div>
          <div className="text-foreground">{t("designGuide.logLine2")}</div>
          <div className="text-yellow-400">{t("designGuide.logLine3")}</div>
          <div className="text-foreground">{t("designGuide.logLine4")}</div>
          <div className="text-destructive">{t("designGuide.logLine5")}</div>
          <div className="text-primary">{t("designGuide.logLine6")}</div>
          <div className="text-foreground">{t("designGuide.logLine7")}</div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary animate-pulse" />
              <span className="inline-flex h-full w-full rounded-full bg-primary" />
            </span>
            <span className="text-primary">{t("designGuide.liveLabel")}</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PROPERTY ROW PATTERN                                         */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionPropertyRow")}>
        <div className="border border-border rounded-md p-4 space-y-1 max-w-sm">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("designGuide.statusLabel")}</span>
            <StatusBadge status="active" />
          </div>
          {/* PAP-411: priority metadata row hidden behind SHOW_TASK_PRIORITY_UI. */}
          {SHOW_TASK_PRIORITY_UI && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">{t("designGuide.priorityLabel")}</span>
              <PriorityIcon priority="high" />
            </div>
          )}
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("designGuide.propResponsible")}</span>
            <div className="flex items-center gap-1.5">
              <Avatar size="sm"><AvatarFallback>A</AvatarFallback></Avatar>
              <span className="text-xs">{t("designGuide.propAgentAlpha")}</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("designGuide.propCreated")}</span>
            <span className="text-xs">{t("designGuide.sampleDateJan15")}</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  NAVIGATION PATTERNS                                          */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionNavigationPatterns")}>
        <SubSection title={t("designGuide.independentMcp")}>
          <p className="text-sm text-muted-foreground">{t("designGuide.independentMcpNote")}</p>
          <RemoteMcpDesignExample />
        </SubSection>
        <SubSection title={t("designGuide.setupWizard")}>
          <p className="text-sm text-muted-foreground">{t("designGuide.setupWizardNote")}</p>
          <div className="max-w-sm space-y-6">
            <SetupWizardNavigation inline labels={[t("designGuide.wizardChooseTrigger"), t("designGuide.wizardConfigure"), t("designGuide.wizardReview")]} step={wizardStep} availableStep={2} onSelect={setWizardStep} />
            <SetupWizardFooter onSaveExit={() => setWizardStep(0)}><Button onClick={() => setWizardStep((wizardStep + 1) % 3)}>{t("designGuide.continue")}</Button></SetupWizardFooter>
          </div>
        </SubSection>
        <SubSection title={t("designGuide.agentChatPicker")}>
          <AgentChatPickerExample />
          <SubSection title={t("designGuide.agentConversationSidebar")}>
            <div className="flex flex-wrap gap-4">
              <div className="h-96 w-60"><AgentConversationSidebar agents={[]} onSelect={() => {}} onBrowse={() => {}} /></div>
              <div className="h-96 w-60"><AgentConversationSidebar agents={[]} loading /></div>
              <div className="h-96 w-60"><AgentConversationSidebar agents={[]} error={new Error(t("designGuide.unavailable"))} onRetry={() => {}} /></div>
            </div>
          </SubSection>
        </SubSection>
        <SubSection title={t("designGuide.sidebarNavItems")}>
          <p className="text-sm text-muted-foreground">
            {t("designGuide.sidebarNavNote")}
          </p>
          <Card className="block w-60 p-3 space-y-0.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-accent text-accent-foreground">
              <LayoutDashboard className="h-4 w-4" />
              {t("designGuide.navDashboard")}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground cursor-pointer">
              <CircleDot className="h-4 w-4" />
              {t("designGuide.navIssues")}
              <Badge variant="ghost" className="ml-auto bg-primary text-primary-foreground px-1.5">
                12
              </Badge>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground cursor-pointer">
              <Bot className="h-4 w-4" />
              {t("designGuide.navAgents")}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground cursor-pointer">
              <Hexagon className="h-4 w-4" />
              {t("designGuide.navProjects")}
            </div>
          </Card>
        </SubSection>

        <SubSection title={t("designGuide.viewToggle")}>
          <div className="flex items-center border border-border rounded-md w-fit">
            <button className="px-3 py-1.5 text-xs font-medium bg-accent text-foreground rounded-l-md">
              <ListTodo className="h-3.5 w-3.5 inline mr-1" />
              {t("designGuide.viewList")}
            </button>
            <button className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/50 rounded-r-md">
              <Target className="h-3.5 w-3.5 inline mr-1" />
              {t("designGuide.viewOrg")}
            </button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  GROUPED LIST (Issues pattern)                                */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionGroupedList")}>
        <div>
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-t-md">
            <StatusIcon status="in_progress" />
            <span className="text-sm font-medium">{t("designGuide.statusInProgress")}</span>
            <span className="text-xs text-muted-foreground ml-1">2</span>
          </div>
          <div className="border border-border rounded-b-md">
            {/* PAP-411: leading PriorityIcon hidden behind SHOW_TASK_PRIORITY_UI. */}
            <EntityRow
              leading={SHOW_TASK_PRIORITY_UI ? <PriorityIcon priority="high" /> : undefined}
              identifier="PAP-101"
              title={t("designGuide.groupedHeartbeat")}
              onClick={() => {}}
            />
            <EntityRow
              leading={SHOW_TASK_PRIORITY_UI ? <PriorityIcon priority="medium" /> : undefined}
              identifier="PAP-102"
              title={t("designGuide.groupedCostTracking")}
              onClick={() => {}}
            />
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COMMENT THREAD PATTERN                                       */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionCommentThread")}>
        <div className="space-y-3 max-w-2xl">
          <h3 className="text-sm font-semibold">{t("designGuide.commentsHeading")}</h3>
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">{t("designGuide.authorAgent")}</span>
                <span className="text-xs text-muted-foreground">{t("designGuide.sampleDateJan15")}</span>
              </div>
              <p className="text-sm">{t("designGuide.commentAgentText")}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">{t("designGuide.authorHuman")}</span>
                <span className="text-xs text-muted-foreground">{t("designGuide.sampleDateJan16")}</span>
              </div>
              <p className="text-sm">{t("designGuide.commentHumanText")}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Textarea placeholder={t("designGuide.leaveCommentPlaceholder")} rows={3} />
            <Button size="sm">{t("designGuide.commentButton")}</Button>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COST TABLE PATTERN                                           */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionCostTable")}>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-accent/20">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("designGuide.costModel")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("designGuide.costTokens")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("designGuide.costCost")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-3 py-2">claude-sonnet-4-20250514</td>
                <td className="px-3 py-2 font-mono">1.2M</td>
                <td className="px-3 py-2 font-mono">$18.00</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2">claude-haiku-4-20250506</td>
                <td className="px-3 py-2 font-mono">500k</td>
                <td className="px-3 py-2 font-mono">$1.25</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">{t("designGuide.costTotal")}</td>
                <td className="px-3 py-2 font-mono">1.7M</td>
                <td className="px-3 py-2 font-mono font-medium">$19.25</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SKELETONS                                                    */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionSkeletons")}>
        <SubSection title={t("designGuide.skeletonIndividual")}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-full max-w-sm" />
            <Skeleton className="h-20 w-full" />
          </div>
        </SubSection>

        <SubSection title={t("designGuide.pageSkeletonList")}>
          <div className="border border-border rounded-md p-4">
            <PageSkeleton variant="list" />
          </div>
        </SubSection>

        <SubSection title={t("designGuide.pageSkeletonDetail")}>
          <div className="border border-border rounded-md p-4">
            <PageSkeleton variant="detail" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  SEPARATOR                                                    */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionSeparator")}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("designGuide.horizontal")}</p>
          <Separator />
          <div className="flex items-center gap-4 h-8">
            <span className="text-sm">{t("designGuide.left")}</span>
            <Separator orientation="vertical" />
            <span className="text-sm">{t("designGuide.right")}</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  ICON REFERENCE                                               */}
      {/* ============================================================ */}
      {/*  TEAM CATALOG                                                 */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionTeamCatalog")}>
        <p className="text-sm text-muted-foreground">
          {t("designGuide.teamCatalogIntro")}<code className="font-mono text-xs">/teams-catalog</code>).{" "}
          {t("designGuide.teamCatalogFixtures")}
        </p>

        <SubSection title={t("designGuide.teamRowTitle")}>
          <div className="w-(--sz-28rem) rounded-md border border-border">
            <div className="px-3 py-2 text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">
              {t("designGuide.teamBundledCount")}
            </div>
            <TeamRow team={sampleTeam} selected onSelect={() => {}} />
            <div className="px-3 py-2 text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">
              {t("designGuide.teamOptionalCount")}
            </div>
            <TeamRow team={optionalTeam} selected={false} onSelect={() => {}} />
            <div className="px-3 py-2 text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">
              {t("designGuide.teamInstalledCount")}
            </div>
            <TeamRow team={sampleTeam} selected={false} onSelect={() => {}} installed={outOfDateInstalledState} />
            <TeamRow team={warnTeam} selected={false} onSelect={() => {}} installed={currentInstalledState} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("designGuide.teamInstalledCollapse")} <code className="font-mono">INSTALLED · N</code>{t("designGuide.teamOutOfDate1")}{" "}
            <code className="font-mono">originHash</code> {t("designGuide.teamOutOfDate2")}{" "}
            <code className="font-mono">contentHash</code>{t("designGuide.teamOutOfDate3")}{" "}
            <code className="font-mono">↑</code> {t("designGuide.teamOutOfDate4")}
          </p>
        </SubSection>

        <SubSection title={t("designGuide.teamCardTitle")}>
          <p className="text-xs text-muted-foreground">
            {t("designGuide.teamCardIntro")}{" "}
            <code className="font-mono">ring-2 ring-ring</code>. {t("designGuide.teamCardDrives")}{" "}
            <code className="font-mono">useInstallTeamCatalogEntry</code> {t("designGuide.teamCardFlow")}
          </p>
          <TeamCardShowcase />
        </SubSection>

        <SubSection title="TeamHierarchyPreview">
          <div className="max-w-md">
            <TeamHierarchyPreview team={sampleTeam} />
          </div>
        </SubSection>

        <SubSection title="RequiredSkillsList">
          <div className="max-w-xl">
            <RequiredSkillsList skills={sampleTeam.requiredSkills} />
          </div>
        </SubSection>

        <SubSection title="EnvInputsList">
          <div className="max-w-xl">
            <EnvInputsList inputs={sampleTeam.envInputs} />
          </div>
        </SubSection>

        <SubSection title="ExternalSourcesList">
          <div className="max-w-xl">
            <ExternalSourcesList sources={sampleTeam.sourceRefs} />
          </div>
        </SubSection>

        <SubSection title={t("designGuide.stepSourcePolicyTitle")}>
          <div className="max-w-xl rounded-md border border-border p-4">
            <StepSourcePolicy
              team={warnTeam}
              allowExternalSources={allowExternal}
              allowUnpinnedOptionalSources={allowUnpinned}
              allowLocalPathSources={allowLocalPath}
              onChange={(key, value) => {
                if (key === "external") setAllowExternal(value);
                if (key === "unpinned") setAllowUnpinned(value);
                if (key === "localPath") setAllowLocalPath(value);
              }}
            />
          </div>
        </SubSection>

        <SubSection title={t("designGuide.stepSkillPlanTitle")}>
          <div className="max-w-xl rounded-md border border-border p-4">
            <StepSkillPlan team={sampleTeam} preparations={sampleSkillPreparations} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      <Section title={t("designGuide.sectionCommonIcons")}>
        <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
          {[
            ["Inbox", Inbox],
            ["ListTodo", ListTodo],
            ["CircleDot", CircleDot],
            ["Hexagon", Hexagon],
            ["Target", Target],
            ["LayoutDashboard", LayoutDashboard],
            ["Bot", Bot],
            ["DollarSign", DollarSign],
            ["History", History],
            ["Search", Search],
            ["Plus", Plus],
            ["Trash2", Trash2],
            ["Settings", Settings],
            ["User", User],
            ["Mail", Mail],
            ["Upload", Upload],
            ["Zap", Zap],
          ].map(([name, Icon]) => {
            const LucideIcon = Icon as React.FC<{ className?: string }>;
            return (
              <div key={name as string} className="flex flex-col items-center gap-1.5 p-2">
                <LucideIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-(length:--text-nano) text-muted-foreground font-mono">{name as string}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  KEYBOARD SHORTCUTS                                           */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionKeyboardShortcuts")}>
        <div className="border border-border rounded-md divide-y divide-border text-sm">
          {[
            ["Cmd+K / Ctrl+K", t("designGuide.shortcutOpenPalette")],
            ["C", t("designGuide.shortcutNewIssue")],
            ["[", t("designGuide.shortcutToggleSidebar")],
            ["]", t("designGuide.shortcutToggleProperties")],

            ["Cmd+Enter / Ctrl+Enter", t("designGuide.shortcutSubmitComment")],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between px-4 py-2">
              <span className="text-muted-foreground">{desc}</span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-muted rounded border border-border">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("designGuide.sectionIssueOutput")}>
        <SubSection title={t("designGuide.multipleOutputs")}>
          <IssueOutputSection workProducts={DESIGN_GUIDE_OUTPUTS} />
        </SubSection>
        <SubSection title={t("designGuide.degradedOutput")}>
          <IssueOutputSection workProducts={DESIGN_GUIDE_DEGRADED_OUTPUTS} />
        </SubSection>
        <SubSection title={t("designGuide.emptyStateLabel")}>
          <p className="text-xs text-muted-foreground">
            {t("designGuide.issueOutputEmptyNote")}
          </p>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TOOLS & ACCESS (PAP-10389)                                   */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionToolsAccess")}>
        <SubSection title={t("designGuide.enforcementDefaultDenied")}>
          <div className="space-y-3">
            <EnforcementBanner companyId="" forceVariant="default" recentDenialCount={0} />
            <EnforcementBanner companyId="" forceVariant="denied-detected" recentDenialCount={3} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("designGuide.enforcementPersistent")} <code>denied-detected</code> {t("designGuide.enforcementPersistentEnd")}
          </p>
        </SubSection>

        <SubSection title={t("designGuide.enforcementTones")}>
          <div className="space-y-3">
            <EnforcementBanner
              tone="info"
              title={t("designGuide.bannerInfoTitle")}
              body={t("designGuide.bannerInfoBody")}
            />
            <EnforcementBanner
              tone="warning"
              title={t("designGuide.bannerWarningTitle")}
              body={t("designGuide.bannerWarningBody")}
            />
            <EnforcementBanner
              tone="error"
              title={t("designGuide.bannerErrorTitle")}
              body={t("designGuide.bannerErrorBody")}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("designGuide.enforcementStaticCopy")} <code>title</code>/<code>body</code> {t("designGuide.enforcementOptional")}{" "}
            <code>icon</code>.
          </p>
        </SubSection>

        <SubSection title={t("designGuide.approvalCardTitle")}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ActionCard
              toolName="slack.post_message"
              risk="medium"
              isWrite
              binding={{
                application: "Slack",
                manifestVersion: "2.4.1",
                connection: "https://slack.com/api · acme-workspace",
                catalogSha256: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
                payloadSha256: "sha256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
              }}
              input={{ channel: "#launch", text: t("designGuide.sampleDeployMessage"), unfurl_links: false }}
              reason={t("designGuide.approvalReason")}
              policyNumber={7}
              expiresInLabel={t("designGuide.expiresIn23")}
            />
            <ActionCard
              variant="stale"
              toolName="slack.post_message"
              risk="medium"
              isWrite
              binding={{
                application: "Slack",
                manifestVersion: "2.4.1",
                connection: "https://slack.com/api · acme-workspace",
                catalogSha256: "sha256:7d793037a0760186574b0282f2f435e7a4b1b2b0b822cd15d6c15b0f00a0e3f1",
                previousCatalogSha256: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
                payloadSha256: "sha256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
              }}
              input={{ channel: "#launch", text: t("designGuide.sampleDeployMessage"), unfurl_links: false }}
              reason={t("designGuide.approvalReason")}
              policyNumber={7}
              expiresInLabel={t("designGuide.expiresIn18")}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("designGuide.staleNote1")}{" "}
            <code>stale</code> {t("designGuide.staleNote2")}{" "}
            <code>Approve</code> {t("designGuide.staleNote3")}
          </p>
        </SubSection>

        <SubSection title={t("designGuide.approvalMobileTitle")}>
          <div className="w-(--sz-390px) max-w-full rounded-xl border border-border bg-background p-3">
            <ActionCardMobile
              toolName="slack.post_message"
              risk="medium"
              isWrite
              binding={{
                application: "Slack",
                manifestVersion: "2.4.1",
                connection: "https://slack.com/api · acme-workspace",
                catalogSha256: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
                payloadSha256: "sha256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
              }}
              input={{ channel: "#launch", text: t("designGuide.sampleDeployMessage") }}
              reason={t("designGuide.approvalReason")}
              policyNumber={7}
              expiresInLabel={t("designGuide.expiresIn23")}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("designGuide.mobileNote")}
          </p>
        </SubSection>

        <SubSection title={t("designGuide.bindingsTableTitle")}>
          <BindingsTable
            rows={[
              { label: t("designGuide.bindingApplication"), value: "Slack · manifest v2.4.1" },
              { label: t("designGuide.bindingConnection"), value: "https://slack.com/api · acme-workspace", mono: true },
              { label: t("designGuide.bindingCatalog"), value: "sha256:9f86d081…f00a08", mono: true },
              { label: t("designGuide.bindingPayload"), value: "sha256:2c26b46b…66e7ae", mono: true },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("designGuide.bindingsNote1")} <code>ActionCard</code> {t("designGuide.bindingsNote2")}
          </p>
        </SubSection>

        <SubSection title={t("designGuide.toolAccessStatusKeys")}>
          <div className="flex flex-wrap items-center gap-2">
            {[
              "allowed", "denied", "block", "require-approval", "redacted", "rate-limit",
              "deferred", "hidden", "quarantined", "healthy", "degraded", "runtime-error", "unchecked",
            ].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("designGuide.statusKeysNote1")}{" "}
            <code>StatusBadge</code> {t("designGuide.statusKeysNote2")} <code>lib/status-colors</code>.
          </p>
        </SubSection>

        <SubSection title={t("designGuide.emptyStateCanonical")}>
          <EmptyState
            icon={Inbox}
            message={t("designGuide.noConnectionsYet")}
            description={t("designGuide.noConnectionsDescription")}
            action={t("designGuide.newConnection")}
            onAction={() => {}}
          />
        </SubSection>
      </Section>

      <Section title={t("designGuide.sectionGithubSkillSources")}>
        <p className="text-sm text-muted-foreground">{t("designGuide.skillSourcesNote")}</p>
        <SkillSourceTreeShowcase />
        <SkillBinaryFile file={{ skillId: "example", path: "assets/example.bin", kind: "asset", content: "AAECAw==", encoding: "base64", language: null, markdown: false, editable: false }} />
      </Section>

      <Section title={t("designGuide.sectionSourceRepositories")}>
        <SubSection title={t("designGuide.emptyDisconnected")}>
          <RepositoryEditor selected={[]} onChange={() => {}} state="disconnected" onConnect={() => {}} onRetry={() => {}} />
        </SubSection>
        <SubSection title={t("designGuide.selectedSearchable")}>
          <RepositoryEditor selected={[{ id: "1", fullName: "paperclipai/paperclip", url: "https://github.com/paperclipai/paperclip", connections: [t("designGuide.yourGithub")] }]}
            available={[{ id: "2", fullName: "paperclipai/docs", url: "https://github.com/paperclipai/docs", connections: [t("designGuide.companyGithub")] }]}
            onChange={() => {}} onConnect={() => {}} onRetry={() => {}} />
        </SubSection>
        <p className="text-sm text-muted-foreground">{t("designGuide.repositoriesStoriesNote")}</p>
      </Section>

      <Section title={t("designGuide.sectionEnvVarsEditor")}>
        <p className="text-sm text-muted-foreground">
          {t("designGuide.envEditorIntro1")} <span className="font-mono">Product/Environment Variables Editor</span> {t("designGuide.envEditorIntro2")}
        </p>
        <EnvironmentVariablesEditorShowcase />
      </Section>

      <Section title={t("designGuide.sectionTasksFromTask")}>
        <SubSection title={t("designGuide.subtasksIndependent")}>
          <div className="max-w-xl">
            <TaskDetailTasksPanel
              subtasks={[DESIGN_GUIDE_TASK]}
              createdTasks={[
                { ...DESIGN_GUIDE_TASK, projectId: "design-board", project: { id: "design-board", name: t("designGuide.projectBoardUi") } as Issue["project"] },
                { ...DESIGN_GUIDE_TASK, id: "design-followup", identifier: "PAP-428", title: t("designGuide.releaseNotesTask"), status: "todo", projectId: null },
              ]}
              projects={[]}
            />
          </div>
        </SubSection>
        <SubSection title={t("designGuide.emptyLoadingFailed")}>
          <TaskDetailTasksPanel subtasks={[]} createdTasks={[]} projects={[]} />
          <TaskDetailTasksPanel subtasks={[]} createdTasks={[]} projects={[]} isLoading />
          <TaskDetailTasksPanel subtasks={[]} createdTasks={[]} projects={[]} hasError onRetry={() => {}} />
        </SubSection>
      </Section>

      <Section title={t("designGuide.sectionDispositionRecovery")}>
        <SubSection title={t("designGuide.needsAttentionDetails")}>
          <DispositionRecoveryNotice snapshot={{ kind: "disposition_repair_escalated", actionId: "design-recovery", attemptCount: 2, maxAttempts: 2, reason: "unchanged_source_state_exhausted", assigneeAgentId: null }} defaultExpanded />
        </SubSection>
        <p className="text-sm text-muted-foreground">{t("designGuide.recoveryStoriesNote")}</p>
      </Section>

      <Section title={t("designGuide.sectionPendingInput")}>
        <p className="mb-3 text-sm text-muted-foreground">{t("designGuide.pendingInputNote")}</p>
        <TaskPendingInputExample />
      </Section>

      <Section title={t("designGuide.sectionExecutionRecovery")}>
        <p className="text-sm text-muted-foreground">
          {t("designGuide.executionRecoveryNote")}
        </p>
      </Section>

      <Section title={t("designGuide.sectionCloudSignIn")}>
        <CloudSignIn cloud={{ managed: true, managedBy: "paperclip-cloud", cloudBaseUrl: null, stackSlug: null }} returnTo="/" />
      </Section>

      <Section title={t("designGuide.sectionSavedProviderKeys")}>
        <SavedProviderKeySelect options={[{ id: "example", label: t("designGuide.savedClaudeKeyLabel"), binding: { type: "user_secret_ref", key: "ANTHROPIC_API_KEY", version: "latest" } }]} value="example" onChange={() => {}} loading={false} error={false} />
        <SavedProviderKeySelect options={[]} value="" onChange={() => {}} loading error={false} />
        <SavedProviderKeySelect options={[]} value="" onChange={() => {}} loading={false} error />
      </Section>

      <Section title={t("designGuide.sectionVoiceConversations")}>
        <div className="flex flex-col gap-6">
          <VoiceControls state="working" agentName={t("designGuide.companyPhoneAgent")} onStart={() => {}} onMute={() => {}} onEnd={() => {}} onResumeAudio={() => {}} />
          <VoiceControls state="failed" agentName={t("designGuide.companyPhoneAgent")} error={t("designGuide.micDeniedError")} onStart={() => {}} onMute={() => {}} onEnd={() => {}} onResumeAudio={() => {}} />
          <VoiceTranscript agentName={t("designGuide.companyPhoneAgent")} entries={[
            { id: "ack", source: "agent", text: t("designGuide.voiceAck"), final: true },
            { id: "followup", source: "user", text: t("designGuide.voiceFollowup"), final: true },
          ]} />
        </div>
      </Section>

      <Section title={t("designGuide.sectionSpekoProviderSetup")}>
        <SpekoPhoneCallbackForm onSave={() => {}} />
        <SpekoCallHistoryView onRetry={() => {}} />
        <div className="divide-y divide-border border-y border-border">
          <SpekoCallActivityItem presentation="activity" entry={{session: {id: "demo-call", companyId: "demo", endpointId: "demo", issueId: "demo-task", assignedAgentId: "demo-agent", state: "ended", mode: "browser", generation: 1, callerAuthority: "member", replyCursor: 0, createdAt: "2026-10-07T17:00:00Z", expiresAt: "2026-10-07T17:10:00Z", endedAt: "2026-10-07T17:02:00Z", errorCode: null}, report: {status: "pending", costMicroUsd: null, durationSeconds: null, updatedAt: null, transcript: []}}} />
          <SpekoUnapprovedCallActivityItem presentation="activity" call={{id: "demo-missed", state: "expired", createdAt: "2026-10-07T17:00:00Z", updatedAt: "2026-10-07T17:02:00Z"}} />
        </div>
        <SpekoPhoneLineForm onRefresh={() => {}} onSave={() => {}} />
        <SpekoIncomingCallCard call={{id: "demo", state: "awaiting_approval", approvalCode: "123456", createdAt: "2026-10-07T17:00:00Z", expiresAt: "2026-10-07T17:02:00Z", sessionId: null}} onDecide={() => {}} />
        <SpekoProviderSetup agentName={t("designGuide.companyPhoneAgent")} callbackUrl="https://paperclip.example/api/voice-webhooks/example/tools" credentials={{}} onChange={() => {}} onConnect={() => {}} />
      </Section>

      <Section title={t("designGuide.sectionExternalAgentInvitation")}>
        <p className="text-sm text-muted-foreground">{t("designGuide.externalInviteNote")}</p>
        <ExternalAgentPresetPicker onSelect={() => {}} />
        <DotConnectionChecks state={{ phase: "testing" }} />
        <Dialog><DialogTrigger asChild><Button variant="outline">{t("designGuide.previewInvitationModal")}</Button></DialogTrigger>
          <AnimatedDialogContent><div className="space-y-4 p-6"><DialogTitle>{t("designGuide.inviteExternalTitle")}</DialogTitle><DialogDescription>{t("designGuide.inviteExternalDescription")}</DialogDescription><ExternalAgentPresetPicker onSelect={() => {}} /></div></AnimatedDialogContent>
        </Dialog>
      </Section>

      <Section title={t("designGuide.sectionBrowserSetupPrompt")}>
        <p className="text-sm text-muted-foreground">{t("designGuide.setupPromptNote1")}</p>
        <SetupPrompt prompt={t("designGuide.setupPromptExample")} />
        <p className="text-sm text-muted-foreground">{t("designGuide.setupPromptNote2")}</p>
        <SetupPrompt prompt={t("designGuide.setupPromptDotExample")} label={t("designGuide.copySetupPrompt")} title={t("designGuide.connectYourDot")} agent={{ name: "Dot", src: "/brands/adapters/openai-dot.svg" }} />
      </Section>

      <Section title={t("designGuide.sectionConnectionIntent")}>
        <p className="text-sm text-muted-foreground">
          {t("designGuide.connectionIntentNote")}
        </p>
        <div className="grid gap-4 xl:grid-cols-3">
          <IssueThreadInteractionCard
            interaction={pendingConnectionIntentInteraction}
            currentUserId={issueThreadInteractionFixtureMeta.currentUserId}
          />
          <IssueThreadInteractionCard
            interaction={retryConnectionIntentInteraction}
            currentUserId={issueThreadInteractionFixtureMeta.currentUserId}
          />
          <IssueThreadInteractionCard
            interaction={connectedConnectionIntentInteraction}
            currentUserId={issueThreadInteractionFixtureMeta.currentUserId}
          />
        </div>
      </Section>

      <Section title={t("designGuide.sectionAgentMailApiKey")}>
        <p className="text-sm text-muted-foreground">{t("designGuide.agentMailNote1")}</p>
        <p className="text-sm text-muted-foreground">{t("designGuide.agentMailNote2")}</p>
        <div className="max-w-md">
          <AgentMailApiKeyField value={agentmailDemoKey} onChange={setAgentmailDemoKey} />
        </div>
      </Section>

      <Section title={t("designGuide.sectionResizablePanels")}>
        <p className="text-sm text-muted-foreground">
          {t("designGuide.resizableIntro1")}{" "}
          <span className="font-mono">react-resizable-panels</span>{" "}
          {t("designGuide.resizableIntro2")}{" "}
          (<span className="font-mono">minSize="240px"</span>) {t("designGuide.resizableIntro3")}
        </p>
        <div className="h-48 max-w-2xl overflow-hidden rounded-md border border-border">
          <ResizablePanelGroup>
            <ResizablePanel id="a" minSize="120px" className="bg-muted/30">
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {t("designGuide.panelA")}
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="b" minSize="120px" collapsible collapsedSize="40px" className="bg-muted/10">
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {t("designGuide.panelB")}
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="c" minSize="120px" className="bg-muted/30">
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {t("designGuide.panelC")}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  INLINE BANNER + BUILT-IN AGENTS                              */}
      {/* ============================================================ */}
      <Section title={t("designGuide.sectionWebhookWarnings")}>
        <div className="space-y-3">
          {["http://localhost:3100", "https://paperclip.internal", "https://paperclip.example-tailnet.ts.net", "http://paperclip.example.com", "not-a-url"].map((url) => <WebhookUrlWarning key={url} url={url} />)}
        </div>
      </Section>

      <Section title={t("designGuide.sectionInlineBanner")}>
        <p className="text-sm text-muted-foreground">
          {t("designGuide.inlineBannerNote1")}<span className="font-mono">brandBanner</span> {t("designGuide.inlineBannerNote2")}{" "}
          <span className="font-mono">info</span> {t("designGuide.inlineBannerNote3")}{" "}
          <span className="font-mono">warning</span> {t("designGuide.inlineBannerNote4")}{" "}
          <span className="font-mono">bg-yellow-*</span>/<span className="font-mono">bg-blue-*</span>{" "}
          {t("designGuide.inlineBannerNote5")}
        </p>
        <div className="space-y-3">
          <InlineBanner
            tone="info"
            title={t("designGuide.builtInAgentTitle")}
            actions={<Button variant="outline" size="sm">{t("designGuide.resetToDefaults")}</Button>}
          >
            {t("designGuide.builtInAgentBody1")} <strong>Briefs</strong>{t("designGuide.builtInAgentBody2")}
          </InlineBanner>
          <InlineBanner
            tone="warning"
            title={t("designGuide.briefsPausedTitle")}
            actions={
              <>
                <Button variant="ghost" size="sm">{t("designGuide.viewAgent")}</Button>
                <Button size="sm">{t("designGuide.resumeAgent")}</Button>
              </>
            }
          >
            {t("designGuide.briefsPausedBody")}
          </InlineBanner>
          <InlineBanner
            tone="danger"
            title={t("designGuide.summaryFailedTitle")}
            actions={<Button size="sm">{t("designGuide.retry")}</Button>}
          >
            {t("designGuide.summaryFailedBody")}
          </InlineBanner>
          <InlineBanner tone="info" compact>
            {t("designGuide.compactBannerBody")}
          </InlineBanner>
        </div>
      </Section>

      <Section title={t("designGuide.sectionTextAttachmentTabs")}>
        <p className="text-sm text-muted-foreground">{t("designGuide.textAttachmentsNote")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <TextAttachmentPreview title="README.md" text={t("designGuide.sampleMarkdownText")} markdown downloadUrl="data:text/markdown,%23%20Project%20notes" />
          <TextAttachmentPreview title="notes.txt" text={t("designGuide.samplePlainText")} markdown={false} downloadUrl="data:text/plain,Plain%20text" />
        </div>
      </Section>

      <Section title={t("designGuide.sectionConnectionRecovery")}>
        <SubSection title={t("designGuide.waitingForServer")}>
          <CloudAccessError temporary retrying={false} onRetry={() => undefined} />
        </SubSection>
        <SubSection title={t("designGuide.checkingConnection")}>
          <CloudAccessError temporary retrying onRetry={() => undefined} />
        </SubSection>
        <SubSection title={t("designGuide.accessCheckFailed")}>
          <CloudAccessError temporary={false} retrying={false} onRetry={() => undefined} />
        </SubSection>
      </Section>

      <Section title={t("designGuide.sectionBrowserSessionFooter")}>
        <p className="text-sm text-muted-foreground">{t("designGuide.browserFooterNote")}</p>
        {(["running", "idle", "closing-soon", "closed"] as const).map((state) => (
          <SubSection key={state} title={state === "closing-soon" ? t("designGuide.closingSoon") : state}>
            <TaskBrowserFooter
              browser={{
                id: "design-browser", sessionId: "design-session", issueId: "design-task",
                status: state === "closing-soon" ? "idle" : state,
                runStatus: "completed", progress: null, error: null, costCents: 15,
                idleDeadline: new Date(state === "closing-soon" ? 282000 : 600000).toISOString(),
                expiresAt: null, createdAt: new Date(0).toISOString(),
              } satisfies TaskBrowser}
              now={0}
              onControl={() => {}}
              onReconnect={() => {}}
              onResize={() => {}}
            />
          </SubSection>
        ))}
      </Section>

      <Section title={t("designGuide.sectionBrowserActivity")}>
        <p className="text-sm text-muted-foreground">{t("designGuide.browserActivityNote")}</p>
        {(["starting", "running", "idle", "closed", "failed"] as const).map((status) => (
          <SubSection key={status} title={status}>
            <TaskBrowserActivity browser={{
              id: `design-${status}`, sessionId: `design-${status}`, issueId: "design-task", status,
              runStatus: "completed", progress: null, error: null, costCents: 0,
              idleDeadline: null, expiresAt: null, createdAt: new Date(0).toISOString(),
            }} onOpen={() => {}} />
          </SubSection>
        ))}
      </Section>

      <Section title={t("designGuide.sectionMediaArtifacts")}>
        <p className="text-sm text-muted-foreground">{t("designGuide.mediaArtifactsNote")}</p>
        <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
          <MediaArtifactCard id="design-image" title={t("designGuide.launchArtwork")} contentPath="/announcement-preview.svg" contentType="image/svg+xml" originalFilename="launch.svg" detail={t("designGuide.detailImage")} />
          <MediaArtifactCard id="design-video" title={t("designGuide.videoPreviewUnavailable")} contentPath="" contentType="video/mp4" originalFilename="preview.mp4" detail={t("designGuide.detailVideo")} />
        </div>
      </Section>

      <Section title={t("designGuide.sectionAiConnections")}>
        <AiConnectionDesignExamples />
      </Section>

      <Section title={t("designGuide.sectionLifecycleChips")}>
        <p className="text-sm text-muted-foreground">
          {t("designGuide.lifecycleChipsNote1")}{" "}
          <span className="font-mono">needs_setup</span> / <span className="font-mono">pending_approval</span>.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <BuiltInLifecycleChip status="needs_setup" />
          <BuiltInLifecycleChip status="pending_approval" />
          <BuiltInLifecycleChip status="needs_setup" compact />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-mono">&lt;BuiltInAgentGate agentKey&gt;</span> {t("designGuide.gateComposes")}{" "}
          <span className="font-mono">PageSkeleton</span> + <span className="font-mono">EmptyState</span>{" "}
          + <span className="font-mono">InlineBanner</span> {t("designGuide.gateRenders")}
        </p>
      </Section>
    </div>
  );
}

function SkillSourceTreeShowcase() {
  const { t } = useTranslation();
  const candidates = [
    { path: ".agents/review/SKILL.md", name: t("designGuide.skillReviewName"), description: t("designGuide.skillReviewDescription"), error: null, inspection: { requirements: null, references: [], warnings: [], files: [
      { path: "SKILL.md", kind: "skill", sizeBytes: 120, encoding: "utf8" as const, executable: false },
      { path: "scripts/check.sh", kind: "script", sizeBytes: 45, encoding: "utf8" as const, executable: true },
    ] } },
    { path: ".agents/review/nested/SKILL.md", name: t("designGuide.skillNestedName"), description: t("designGuide.skillNestedDescription"), error: null, note: t("designGuide.skillNewNote") },
    { path: "broken/SKILL.md", name: t("designGuide.skillBrokenName"), description: null, error: t("designGuide.skillBrokenError") },
  ];
  const [selected, setSelected] = useState(new Set(candidates.map(skill => skill.path)));
  const [excluded, setExcluded] = useState<string[]>([]);
  return <SkillSourceTree candidates={candidates} selected={selected} excludedFolders={excluded} onChange={(paths, folders) => { setSelected(paths); setExcluded(folders); }} />;
}
