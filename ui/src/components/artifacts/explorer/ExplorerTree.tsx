import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Clock, EyeOff, Folder, ListTodo, Shapes, Star, Bot, UserRound } from "lucide-react";
import type { CompanyFileFolderNode } from "@/api/company-files";
import { t, useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ExplorerBox } from "./explorer-model";
import {
  quickViewTarget,
  useEntryTree,
  useOutTreeNode,
  type ExplorerQuick,
  type ExplorerTarget,
} from "./useExplorerNavigation";

interface ExplorerTreeProps {
  companyId: string;
  box: ExplorerBox;
  folderId: string | null;
  node: string;
  groupBy: string | null;
  /** Active quick-access view, in either box. */
  quick: ExplorerQuick | null;
  /** Crumb ids of the current location; their ancestors are expanded. */
  trailIds: string[];
  onGo: (target: ExplorerTarget) => void;
}

const GROUP_OPTIONS: { groupBy: string; labelKey: string; icon: typeof Bot }[] = [
  { groupBy: "agent", labelKey: "artifacts.explorer.tree.byAgent", icon: Bot },
  { groupBy: "media_kind", labelKey: "artifacts.explorer.tree.byType", icon: Shapes },
  { groupBy: "day", labelKey: "artifacts.explorer.tree.byDate", icon: CalendarDays },
];

function SectionHeader({ children, onClick, active }: { children: ReactNode; onClick?: () => void; active?: boolean }) {
  const className = cn(
    "px-2 pt-3 pb-1 text-left text-xs font-semibold tracking-wide uppercase text-muted-foreground",
    onClick && "hover:text-foreground",
    active && "text-foreground",
  );
  if (!onClick) return <div className={className}>{children}</div>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

interface TreeRowProps {
  depth: number;
  label: string;
  icon: ReactNode;
  count?: number | null;
  active?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  /** Folder hidden from agents: shows an eye-off marker after the label. */
  hiddenForAgents?: boolean;
  onToggle?: () => void;
  onActivate: () => void;
}

/** One tree line: chevron (toggles) plus the label (navigates). */
function TreeRow({
  depth,
  label,
  icon,
  count,
  active,
  expandable,
  expanded,
  hiddenForAgents,
  onToggle,
  onActivate,
}: TreeRowProps) {
  return (
    <div
      className={cn(
        "flex items-center rounded-md hover:bg-muted",
        active && "bg-accent font-semibold text-accent-foreground",
      )}
      style={{ paddingInlineStart: `${depth * 0.75}rem` }}
    >
      {expandable ? (
        <button
          type="button"
          aria-label={label}
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
        >
          {expanded ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronRight aria-hidden="true" className="size-3.5" />}
        </button>
      ) : (
        <span aria-hidden="true" className="size-6 shrink-0" />
      )}
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onActivate}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-sm"
      >
        {icon}
        <span className="truncate">{label}</span>
        {hiddenForAgents ? (
          <EyeOff role="img" aria-label={t("artifacts.explorer.visibility.hidden")} className="size-3.5 shrink-0 text-muted-foreground">
            <title>{t("artifacts.explorer.visibility.hidden")}</title>
          </EyeOff>
        ) : null}
        {count ? <span className="ml-auto pl-2 text-xs text-muted-foreground">{count}</span> : null}
      </button>
    </div>
  );
}

/** Expansion follows the current location: ancestors of the active node open automatically. */
function useExpansion(forced: boolean) {
  const [open, setOpen] = useState(forced);
  useEffect(() => {
    if (forced) setOpen(true);
  }, [forced]);
  return [open, () => setOpen((value) => !value)] as const;
}

function EntryFolderRow({
  node,
  depth,
  folderId,
  trailIds,
  box,
  onGo,
}: {
  node: CompanyFileFolderNode;
  depth: number;
  folderId: string | null;
  trailIds: string[];
  box: ExplorerBox;
  onGo: (target: ExplorerTarget) => void;
}) {
  const hasChildren = node.children.length > 0;
  const [open, toggle] = useExpansion(trailIds.includes(node.id));
  return (
    <>
      <TreeRow
        depth={depth}
        label={node.name}
        icon={<Folder aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
        count={node.fileCount}
        hiddenForAgents={node.agentVisible === false}
        active={box === "in" && folderId === node.id}
        expandable={hasChildren}
        expanded={open}
        onToggle={toggle}
        onActivate={() => onGo({ box: "in", folderId: node.id })}
      />
      {open
        ? node.children.map((child) => (
            <EntryFolderRow key={child.id} node={child} depth={depth + 1} folderId={folderId} trailIds={trailIds} box={box} onGo={onGo} />
          ))
        : null}
    </>
  );
}

function OutNodeRow({
  companyId,
  id,
  label,
  count,
  hasChildren,
  depth,
  isTask,
  node,
  box,
  trailIds,
  onGo,
}: {
  companyId: string;
  id: string;
  label: string;
  count: number;
  hasChildren: boolean;
  depth: number;
  isTask: boolean;
  node: string;
  box: ExplorerBox;
  trailIds: string[];
  onGo: (target: ExplorerTarget) => void;
}) {
  const [open, toggle] = useExpansion(trailIds.includes(id));
  const children = useOutTreeNode(companyId, id, open && hasChildren);
  return (
    <>
      <TreeRow
        depth={depth}
        label={label}
        icon={
          isTask ? (
            <ListTodo aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Folder aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )
        }
        count={count}
        active={box === "out" && node === id}
        expandable={hasChildren}
        expanded={open}
        onToggle={toggle}
        onActivate={() => onGo({ box: "out", node: id })}
      />
      {open
        ? (children.data?.children ?? []).map((child) => (
            <OutNodeRow
              key={child.id}
              companyId={companyId}
              id={child.id}
              label={child.label}
              count={child.count}
              hasChildren={child.hasChildren}
              depth={depth + 1}
              isTask={child.kind === "issue"}
              node={node}
              box={box}
              trailIds={trailIds}
              onGo={onGo}
            />
          ))
        : null}
    </>
  );
}

/** Left tree: Entrada folders, Salida nodes (lazy), grouped views and quick access. */
export function ExplorerTree(props: ExplorerTreeProps) {
  const { t } = useTranslation();
  const { companyId, box, folderId, node, groupBy, quick, trailIds, onGo } = props;
  const entryTree = useEntryTree(companyId);
  const outRoot = useOutTreeNode(companyId, "root");

  return (
    <nav
      aria-label={t("artifacts.explorer.tree.label")}
      className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-2 text-sm"
    >
      <SectionHeader active={box === "in"} onClick={() => onGo({ box: "in" })}>
        {t("artifacts.explorer.tree.entry")}
      </SectionHeader>
      {entryTree.isError ? <p className="px-2 text-xs text-destructive">{t("artifacts.explorer.errors.tree")}</p> : null}
      {(entryTree.data ?? []).map((root) => (
        <EntryFolderRow
          key={root.id}
          node={root}
          depth={0}
          folderId={folderId}
          trailIds={trailIds}
          box={box}
          onGo={onGo}
        />
      ))}

      <SectionHeader active={box === "out" && node === "root" && !groupBy} onClick={() => onGo({ box: "out", node: "root" })}>
        {t("artifacts.explorer.tree.out")}
      </SectionHeader>
      {outRoot.isError ? <p className="px-2 text-xs text-destructive">{t("artifacts.explorer.errors.tree")}</p> : null}
      {(outRoot.data?.children ?? []).map((child) => (
        <OutNodeRow
          key={child.id}
          companyId={companyId}
          id={child.id}
          label={child.label}
          count={child.count}
          hasChildren={child.hasChildren}
          depth={0}
          isTask={child.kind === "issue"}
          node={node}
          box={box}
          trailIds={trailIds}
          onGo={onGo}
        />
      ))}

      <SectionHeader>{t("artifacts.explorer.tree.outBy")}</SectionHeader>
      {GROUP_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <TreeRow
            key={option.groupBy}
            depth={0}
            label={t(option.labelKey)}
            icon={<Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
            active={box === "out" && node === "root" && groupBy === option.groupBy}
            onActivate={() => onGo({ box: "out", node: "root", groupBy: option.groupBy })}
          />
        );
      })}

      <SectionHeader>{t("artifacts.explorer.tree.quick")}</SectionHeader>
      {/* Favoritos follows the box it is clicked in; Recientes and Subidos por mí are Entrada views. */}
      <TreeRow
        depth={0}
        label={t("artifacts.explorer.tree.favorites")}
        icon={<Star aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
        active={quick === "favorites"}
        onActivate={() => onGo(box === "out" ? { box: "out", node: "favorites" } : { box: "in", quick: "favorites" })}
      />
      <TreeRow
        depth={0}
        label={t("artifacts.explorer.tree.recent")}
        icon={<Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
        active={box === "in" && quick === "recent"}
        onActivate={() => onGo(quickViewTarget("recent"))}
      />
      <TreeRow
        depth={0}
        label={t("artifacts.explorer.tree.mine")}
        icon={<UserRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
        active={box === "in" && quick === "mine"}
        onActivate={() => onGo(quickViewTarget("mine"))}
      />
    </nav>
  );
}
