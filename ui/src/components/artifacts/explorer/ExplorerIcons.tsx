import type { LucideIcon } from "lucide-react";
import { File, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Globe, ListTodo } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatBytes } from "./format";
import { formatExplorerDate, itemThumbnailPath, type ExplorerItem } from "./explorer-model";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "ogv"];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isImageItem(item: ExplorerItem): boolean {
  if (item.kind !== "file") return false;
  const mime = item.contentType ?? "";
  return mime.startsWith("image/") || IMAGE_EXTENSIONS.includes(extensionOf(item.name));
}

function iconFor(item: ExplorerItem): LucideIcon {
  if (item.kind === "folder") {
    const isTask = "kind" in item.raw && item.raw.kind === "issue";
    return isTask ? ListTodo : Folder;
  }
  const mime = item.contentType ?? "";
  const ext = extensionOf(item.name);
  if (isImageItem(item)) return FileImage;
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.includes(ext)) return FileVideo;
  if (mime.includes("spreadsheet") || mime === "text/csv" || mime === "application/vnd.ms-excel" || ["xlsx", "xls", "csv"].includes(ext)) {
    return FileSpreadsheet;
  }
  if (mime === "text/html" || ["html", "htm"].includes(ext)) return Globe;
  if (mime === "application/json" || ext === "json") return FileCode;
  if (mime === "application/pdf" || mime.startsWith("text/") || ["pdf", "md", "doc", "docx", "txt"].includes(ext)) {
    return FileText;
  }
  return File;
}

/**
 * Small type icon used by the list rows and the icon tiles. A file with a server thumbnail
 * shows that image instead; the full-size content stays in the preview pane.
 */
export function ExplorerItemIcon({ item, className }: { item: ExplorerItem; className?: string }) {
  const thumbnail = itemThumbnailPath(item);
  if (thumbnail && item.kind === "file") {
    return <img src={thumbnail} alt="" loading="lazy" className={cn("size-6 shrink-0 rounded-sm bg-muted object-cover", className)} />;
  }
  const Icon = iconFor(item);
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
}

export interface ExplorerRowHandlers {
  selectedId: string | null;
  onSelect: (item: ExplorerItem) => void;
  onOpen: (item: ExplorerItem) => void;
  onContextMenu: (item: ExplorerItem, x: number, y: number) => void;
}

interface ExplorerIconsProps extends ExplorerRowHandlers {
  items: ExplorerItem[];
}

/** Icon grid: server thumbnails (object-cover, lazy) when present, type icons otherwise. */
export function ExplorerIcons({ items, selectedId, onSelect, onOpen, onContextMenu }: ExplorerIconsProps) {
  return (
    <div
      role="listbox"
      aria-label={t("artifacts.explorer.list.label")}
      className="grid gap-2.5 p-3.5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(9.5rem, 1fr))" }}
    >
      {items.map((item) => {
        const selected = item.id === selectedId;
        const meta =
          item.kind === "folder"
            ? item.childCount != null
              ? elementsLabel(item.childCount)
              : ""
            : `${formatBytes(item.byteSize)} · ${formatExplorerDate(item.date)}`;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={selected}
            data-explorer-item={item.id}
            onClick={() => onSelect(item)}
            onDoubleClick={() => onOpen(item)}
            onContextMenu={(event) => {
              event.preventDefault();
              onSelect(item);
              onContextMenu(item, event.clientX, event.clientY);
            }}
            className={cn(
              "cursor-default select-none rounded-md border border-transparent p-2 text-center hover:bg-muted/60",
              selected && "border-border bg-accent",
            )}
          >
            <div className="mb-1.5 flex h-24 items-center justify-center overflow-hidden rounded-md bg-muted">
              {itemThumbnailPath(item) && item.kind === "file" ? (
                <img src={itemThumbnailPath(item) ?? undefined} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <ExplorerItemIcon item={item} className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className={cn("truncate text-xs", item.kind === "folder" && "font-semibold")} title={item.name}>
              {item.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">{meta}</div>
          </div>
        );
      })}
    </div>
  );
}

export function elementsLabel(count: number): string {
  return count === 1 ? t("artifacts.explorer.list.elementsOne") : t("artifacts.explorer.list.elements", { count });
}
