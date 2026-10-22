import { Fragment, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { cn, formatDate } from "@/lib/utils";
import { formatBytes, kindLabel } from "./format";
import { ArtifactViewer } from "./ArtifactViewer";
import { previewKindFor, type PreviewTarget } from "./preview-target";

export interface ArtifactPreviewAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/** Entrada file usage: the tasks that read it. */
export interface PreviewUsage {
  status: "loading" | "ready" | "error";
  tasks: Array<{ id: string; label: string; href: string }>;
}

/** Entrada folder selected in the tree or list: its visibility for agents. */
export interface PreviewFolder {
  name: string;
  agentVisible: boolean;
  pending: boolean;
  onToggleAgentVisible: () => void;
}

/** Tasks shown inline before the "+N" overflow. */
const USAGE_INLINE_LIMIT = 3;

interface ArtifactPreviewPaneProps {
  supplement?: ReactNode;
  target: PreviewTarget | null;
  onClose: () => void;
  onOpenFullscreen: (target: PreviewTarget) => void;
  actions: ArtifactPreviewAction[];
  /** Overrides the first line of the empty state. */
  emptyHint?: string;
  /** Entrada files only: where the file is used. */
  usage?: PreviewUsage | null;
  /** Entrada folders only: the agent-visibility switch. */
  folder?: PreviewFolder | null;
}

/**
 * Side panel that previews the selected file: frame with the matching viewer,
 * title, metadata, key-value details, actions and version list.
 */
export function ArtifactPreviewPane({
  target,
  onClose,
  onOpenFullscreen,
  actions,
  emptyHint,
  usage,
  folder,
  supplement,
}: ArtifactPreviewPaneProps) {
  const { t } = useTranslation();

  return (
    <aside
      aria-label={t("artifacts.explorer.preview.title")}
      className="flex h-full min-h-0 w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-background"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium">{t("artifacts.explorer.preview.title")}</span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("artifacts.explorer.preview.fullscreen")}
            title={t("artifacts.explorer.preview.fullscreen")}
            disabled={!target}
            onClick={() => target && onOpenFullscreen(target)}
          >
            <Maximize2 aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("artifacts.explorer.preview.close")}
            title={t("artifacts.explorer.preview.close")}
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </span>
      </div>

      {target ? (
        <PreviewBody target={target} actions={actions} usage={usage ?? null} supplement={supplement} />
      ) : folder ? (
        <FolderBody folder={folder} emptyHint={emptyHint} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <p>{emptyHint ?? t("artifacts.explorer.preview.empty")}</p>
          <p className="text-xs">{t("artifacts.explorer.preview.emptyDetail")}</p>
        </div>
      )}
    </aside>
  );
}

/** Folder selected: name, the agent-visibility switch and a short explanation. */
function FolderBody({ folder, emptyHint }: { folder: PreviewFolder; emptyHint?: string }) {
  const { t } = useTranslation();
  const Icon = folder.agentVisible ? Eye : EyeOff;
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3.5 text-sm">
      <h3 className="break-all font-semibold">{folder.name}</h3>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="switch"
          aria-checked={folder.agentVisible}
          disabled={folder.pending}
          onClick={folder.onToggleAgentVisible}
        >
          <Icon aria-hidden />
          {t("artifacts.explorer.visibility.toggle")}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          {folder.agentVisible ? t("artifacts.explorer.visibility.visible") : t("artifacts.explorer.visibility.hidden")}
        </p>
      </div>
      {emptyHint ? <p className="text-xs text-muted-foreground">{emptyHint}</p> : null}
    </div>
  );
}

function UsageValue({ usage }: { usage: PreviewUsage }) {
  const { t } = useTranslation();
  if (usage.status === "loading") return <span>—</span>;
  if (usage.status === "error") return <span>{t("artifacts.explorer.errors.usage")}</span>;
  if (usage.tasks.length === 0) return <span>{t("artifacts.explorer.meta.usedNone")}</span>;
  const shown = usage.tasks.slice(0, USAGE_INLINE_LIMIT);
  const overflow = usage.tasks.length - shown.length;
  return (
    <span>
      {shown.map((task, index) => (
        <Fragment key={task.id}>
          {index > 0 ? ", " : null}
          <Link to={task.href} className="hover:underline">
            {task.label}
          </Link>
        </Fragment>
      ))}
      {overflow > 0 ? ` +${overflow}` : null}
    </span>
  );
}

function PreviewBody({
  target,
  actions,
  usage,
  supplement,
}: {
  supplement?: ReactNode;
  target: PreviewTarget;
  actions: ArtifactPreviewAction[];
  usage: PreviewUsage | null;
}) {
  const { t } = useTranslation();
  const kind = previewKindFor(target.contentType, target.title);
  const boxLabel = target.box === "in" ? t("artifacts.explorer.preview.box.in") : t("artifacts.explorer.preview.box.out");
  const versions = target.versions ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-3 mt-3 h-48 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
        <ArtifactViewer key={target.id} target={target} kind={kind} />
      </div>

      <div className="px-3.5 pt-3 pb-3.5">
        <h3 className="break-all text-sm font-semibold">{target.title}</h3>
        <p className="mt-1 mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <span>{kindLabel(kind)}</span>
          <span aria-hidden>·</span>
          <span>{formatBytes(target.byteSize)}</span>
          <span aria-hidden>·</span>
          <span>{formatDate(target.updatedAt)}</span>
          <span className="rounded-full border border-border px-2 py-px text-foreground">{boxLabel}</span>
        </p>

        {target.meta.length > 0 || usage ? (
          <dl className="mb-3 space-y-1 text-xs">
            {target.meta.map((item) => (
              <div key={item.label} className="flex gap-3">
                <dt className="w-24 shrink-0 text-muted-foreground">{item.label}</dt>
                <dd className="min-w-0 break-words">{item.value}</dd>
              </div>
            ))}
            {usage ? (
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-muted-foreground">{t("artifacts.explorer.meta.usedIn")}</dt>
                <dd className="min-w-0 break-words">
                  <UsageValue usage={usage} />
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {actions.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={action.disabled}
                  onClick={action.onSelect}
                  className={cn(action.destructive && "text-destructive")}
                >
                  {Icon ? <Icon aria-hidden /> : null}
                  {action.label}
                </Button>
              );
            })}
          </div>
        ) : null}

        {supplement ? <div className="flex flex-col gap-4">{supplement}</div> : null}

        {versions.length > 0 ? (
          <section className="text-xs">
            <h4 className="mb-1.5 font-medium uppercase tracking-wide text-muted-foreground">{t("artifacts.explorer.preview.versions")}</h4>
            <ul className="space-y-1">
              {versions.map((version) => (
                <li key={version.id} className={cn(version.current && "font-semibold")}>
                  {version.onSelect ? (
                    <button type="button" onClick={version.onSelect} className="text-left hover:underline">
                      {version.label} · {version.date}
                      {version.by !== undefined ? ` · ${version.by ?? "—"}` : ""}
                    </button>
                  ) : (
                    <span>
                      {version.label} · {version.date}
                      {version.by !== undefined ? ` · ${version.by ?? "—"}` : ""}
                    </span>
                  )}
                  {version.current ? <span className="font-normal text-muted-foreground"> · {t("artifacts.explorer.preview.currentVersion")}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
