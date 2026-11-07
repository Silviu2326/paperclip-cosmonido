import { EyeOff } from "lucide-react";
import { t, useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatBytes } from "./format";
import {
  explorerColumns,
  formatExplorerDate,
  isHiddenFromAgents,
  type ExplorerBox,
  type ExplorerItem,
  type ExplorerSortDir,
  type ExplorerSortKey,
} from "./explorer-model";
import { ExplorerItemIcon, elementsLabel, type ExplorerRowHandlers } from "./ExplorerIcons";

interface ExplorerListProps extends ExplorerRowHandlers {
  box: ExplorerBox;
  items: ExplorerItem[];
  sort: ExplorerSortKey;
  dir: ExplorerSortDir;
  onSort: (key: ExplorerSortKey) => void;
  /** Entrada quick views: show the folder column instead of usage. */
  folderColumn?: boolean;
}

function usedLabel(count: number): string {
  return count === 1 ? t("artifacts.explorer.list.usedOne") : t("artifacts.explorer.list.usedTasks", { count });
}

/** Table view: sticky header, sortable columns, folders first. */
export function ExplorerList({
  box,
  items,
  sort,
  dir,
  onSort,
  folderColumn,
  selectedId,
  onSelect,
  onOpen,
  onContextMenu,
}: ExplorerListProps) {
  const { t } = useTranslation();
  const columns = explorerColumns(box, { folderColumn });

  return (
    <table aria-label={t("artifacts.explorer.list.label")} className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {columns.map((column) => {
            const active = column.key === sort;
            return (
              <th
                key={column.key}
                scope="col"
                aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                className="sticky top-0 z-10 border-b border-border bg-background px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground"
              >
                <button
                  type="button"
                  onClick={() => onSort(column.key)}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  {column.label}
                  {active ? <span aria-hidden="true" className="text-xs">{dir === "asc" ? "▲" : "▼"}</span> : null}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <tr
              key={item.id}
              data-explorer-item={item.id}
              aria-selected={selected}
              onClick={() => onSelect(item)}
              onDoubleClick={() => onOpen(item)}
              onContextMenu={(event) => {
                event.preventDefault();
                onSelect(item);
                onContextMenu(item, event.clientX, event.clientY);
              }}
              className={cn("cursor-default hover:bg-muted/60", selected && "bg-accent")}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "max-w-72 truncate border-b border-border px-3 py-1.5 whitespace-nowrap",
                    column.key !== "name" && "text-muted-foreground",
                  )}
                >
                  {column.key === "name" ? (
                    <span className="inline-flex max-w-full items-center gap-2">
                      <ExplorerItemIcon item={item} />
                      <span className={cn("truncate", item.kind === "folder" && "font-semibold")}>{item.name}</span>
                      {isHiddenFromAgents(item) ? (
                        <EyeOff
                          role="img"
                          aria-label={t("artifacts.explorer.visibility.hidden")}
                          className="size-3.5 shrink-0 text-muted-foreground"
                        >
                          <title>{t("artifacts.explorer.visibility.hidden")}</title>
                        </EyeOff>
                      ) : null}
                      {item.starred ? (
                        <span role="img" aria-label={t("artifacts.explorer.list.starred")} title={t("artifacts.explorer.list.starred")} className="shrink-0 text-amber-600 dark:text-amber-400">
                          ★
                        </span>
                      ) : null}
                      {item.version > 1 ? (
                        <span className="rounded-full bg-muted px-2 py-px text-xs text-muted-foreground">v{item.version}</span>
                      ) : null}
                    </span>
                  ) : (
                    cellValue(item, column.key)
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function cellValue(item: ExplorerItem, key: ExplorerSortKey): string {
  switch (key) {
    case "type":
      return item.typeLabel;
    case "size":
      if (item.kind === "folder") return item.childCount != null ? elementsLabel(item.childCount) : "—";
      return formatBytes(item.byteSize);
    case "date":
      return item.kind === "folder" && item.date === null ? "—" : formatExplorerDate(item.date);
    case "by":
      return item.by ?? "—";
    case "folder":
      return item.folderPath ?? "—";
    case "used":
      if (item.kind === "folder" || item.usedBy === null) return "—";
      return item.usedBy > 0 ? usedLabel(item.usedBy) : "—";
    case "task":
      return item.task ?? "—";
    default:
      return "";
  }
}
