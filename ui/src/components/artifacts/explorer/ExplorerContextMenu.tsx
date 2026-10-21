import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ExplorerBox, ExplorerItem } from "./explorer-model";

export type ContextMenuEntry =
  | {
      type: "item";
      id: string;
      label: string;
      /** Keyboard hint shown on the right, as in the mockup. */
      shortcut?: string;
      disabled?: boolean;
      /** Shown as the tooltip of a disabled item. */
      hint?: string;
      /** Makes the item a checkbox item (menuitemcheckbox) with this state. */
      checked?: boolean;
      onSelect?: () => void;
    }
  | { type: "separator"; id: string };

export interface ExplorerMenuActions {
  open: (item: ExplorerItem) => void;
  preview: (item: ExplorerItem) => void;
  download: (item: ExplorerItem) => void;
  copyLink: (item: ExplorerItem) => void;
  toggleFavorite: (item: ExplorerItem) => void;
  goTask: (item: ExplorerItem) => void;
  moveToInbox: (item: ExplorerItem) => void;
  replaceVersion: (item: ExplorerItem) => void;
  move: (item: ExplorerItem) => void;
  rename: (item: ExplorerItem) => void;
  remove: (item: ExplorerItem) => void;
  properties: (item: ExplorerItem) => void;
  /** Folders: download the folder as a ZIP. */
  downloadZip: (item: ExplorerItem) => void;
  /** Entrada folders: toggle visibility for agents. */
  toggleAgentVisible: (item: ExplorerItem) => void;
}

export interface ContextMenuOptions {
  /** Whether a folder can be downloaded as a ZIP (see `folderArchivePath`). */
  archivable: boolean;
  /** Current agent visibility of an Entrada folder (true when not hidden). */
  agentVisible: boolean;
}

/** Entries per mockup `showCtx`: folder vs file, Entrada vs Salida. */
export function buildContextMenuEntries(
  box: ExplorerBox,
  item: ExplorerItem,
  actions: ExplorerMenuActions,
  t: (key: string) => string,
  options: ContextMenuOptions = { archivable: false, agentVisible: true },
): ContextMenuEntry[] {
  const favorite: ContextMenuEntry = {
    type: "item",
    id: "favorite",
    label: item.starred ? `★ ${t("artifacts.explorer.ctx.unfavorite")}` : `☆ ${t("artifacts.explorer.ctx.favorite")}`,
    onSelect: () => actions.toggleFavorite(item),
  };
  const open: ContextMenuEntry = { type: "item", id: "open", label: t("artifacts.explorer.ctx.open"), shortcut: "Enter", onSelect: () => actions.open(item) };
  const properties: ContextMenuEntry = { type: "item", id: "properties", label: t("artifacts.explorer.ctx.properties"), shortcut: "Alt+Enter", onSelect: () => actions.properties(item) };
  const separator = (id: string): ContextMenuEntry => ({ type: "separator", id });

  const zip: ContextMenuEntry = {
    type: "item",
    id: "zip",
    label: t("artifacts.explorer.zip.folderCtx"),
    onSelect: () => actions.downloadZip(item),
  };

  if (item.kind === "folder") {
    if (box === "in") {
      return [
        open,
        { type: "item", id: "rename", label: t("artifacts.explorer.ctx.rename"), shortcut: "F2", onSelect: () => actions.rename(item) },
        separator("sep-1"),
        ...(options.archivable ? [zip] : []),
        {
          type: "item",
          id: "visibility",
          label: t("artifacts.explorer.visibility.toggle"),
          checked: options.agentVisible,
          onSelect: () => actions.toggleAgentVisible(item),
        },
        separator("sep-2"),
        { type: "item", id: "remove", label: t("artifacts.explorer.ctx.remove"), shortcut: "Supr", onSelect: () => actions.remove(item) },
        separator("sep-3"),
        properties,
      ];
    }
    if (options.archivable) return [open, separator("sep-1"), zip, separator("sep-2"), properties];
    return [open, separator("sep-1"), properties];
  }

  const common: ContextMenuEntry[] = [
    open,
    { type: "item", id: "preview", label: t("artifacts.explorer.ctx.preview"), shortcut: "Espacio", onSelect: () => actions.preview(item) },
    { type: "item", id: "download", label: t("artifacts.explorer.ctx.download"), shortcut: "Ctrl+S", onSelect: () => actions.download(item) },
    { type: "item", id: "copy", label: t("artifacts.explorer.ctx.copyLink"), onSelect: () => actions.copyLink(item) },
    favorite,
    separator("sep-1"),
  ];

  if (box === "in") {
    return [
      ...common,
      { type: "item", id: "replace", label: t("artifacts.explorer.ctx.replace"), onSelect: () => actions.replaceVersion(item) },
      { type: "item", id: "move", label: t("artifacts.explorer.ctx.move"), onSelect: () => actions.move(item) },
      { type: "item", id: "rename", label: t("artifacts.explorer.ctx.rename"), shortcut: "F2", onSelect: () => actions.rename(item) },
      { type: "item", id: "remove", label: t("artifacts.explorer.ctx.remove"), shortcut: "Supr", onSelect: () => actions.remove(item) },
      separator("sep-2"),
      properties,
    ];
  }
  return [
    ...common,
    { type: "item", id: "task", label: t("artifacts.explorer.ctx.goTask"), onSelect: () => actions.goTask(item) },
    { type: "item", id: "to-inbox", label: t("artifacts.explorer.ctx.moveToInbox"), onSelect: () => actions.moveToInbox(item) },
    separator("sep-2"),
    properties,
  ];
}

interface ExplorerContextMenuProps {
  x: number;
  y: number;
  entries: ContextMenuEntry[];
  onClose: () => void;
}

/** Menu anchored at the cursor. Closes on outside click, Escape, scroll or resize. */
export function ExplorerContextMenu({ x, y, entries, onClose }: ExplorerContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [x, y, entries.length]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t("artifacts.explorer.ctx.menu")}
      onContextMenu={(event) => event.preventDefault()}
      style={{ position: "fixed", left: position.left, top: position.top }}
      className="z-50 min-w-52 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-sm"
    >
      {entries.map((entry) => {
        if (entry.type === "separator") return <div key={entry.id} role="separator" className="my-1 h-px bg-border" />;
        return (
          <button
            key={entry.id}
            type="button"
            role={entry.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
            aria-checked={entry.checked}
            disabled={entry.disabled}
            title={entry.disabled ? entry.hint : undefined}
            onClick={() => {
              if (entry.disabled) return;
              onClose();
              entry.onSelect?.();
            }}
            className={cn(
              "flex w-full items-center justify-between gap-6 rounded-sm px-2.5 py-1.5 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {entry.checked !== undefined ? (
              <span aria-hidden="true" className="w-4 shrink-0">
                {entry.checked ? "✓" : ""}
              </span>
            ) : null}
            <span>{entry.label}</span>
            {entry.disabled && entry.hint ? (
              <span className="text-xs text-muted-foreground">{entry.hint}</span>
            ) : entry.shortcut ? (
              <span className="text-xs text-muted-foreground">{entry.shortcut}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
