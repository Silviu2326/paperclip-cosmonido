import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookMarked, ChevronLeft, ChevronRight, Download, FolderPlus, LayoutGrid, List, PanelRight, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ExplorerBox, ExplorerView } from "./explorer-model";
import type { ExplorerCrumb, ExplorerTarget } from "./useExplorerNavigation";

const SEARCH_DEBOUNCE_MS = 250;

interface ExplorerToolbarProps {
  box: ExplorerBox;
  onBox: (box: ExplorerBox) => void;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  crumbs: ExplorerCrumb[];
  onCrumb: (target: ExplorerTarget) => void;
  query: string;
  onQuery: (text: string) => void;
  /** Current folder name for the placeholder ("Buscar en Marca…"). */
  scopeName: string;
  view: ExplorerView;
  onView: (view: ExplorerView) => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
  /** Entrada only. */
  onUpload: (files: File[]) => void;
  onNewFolder: () => void;
  /** Entrada only: the context (reference files) view is on / toggles it. */
  contextActive: boolean;
  onToggleContext: () => void;
  /** Salida only. */
  downloadEnabled: boolean;
  onDownload: () => void;
}

/** Segmented control with the mockup's black "on" state, built from existing tokens. */
function Segmented({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex divide-x divide-border overflow-hidden rounded-md border border-border">
      {children}
    </div>
  );
}

function SegmentButton({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 px-3 text-sm font-semibold text-muted-foreground hover:text-foreground",
        active && "bg-primary text-primary-foreground hover:text-primary-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Top bar: buzón switch, history, breadcrumbs, search, view and preview toggles, box-specific actions. */
export function ExplorerToolbar(props: ExplorerToolbarProps) {
  const { t } = useTranslation();
  const { box, crumbs, query, onQuery, onUpload, onNewFolder, onBox, view, onView, previewOpen, onTogglePreview } = props;
  const [text, setText] = useState(query);
  const onQueryRef = useRef(onQuery);
  onQueryRef.current = onQuery;
  const fileInput = useRef<HTMLInputElement>(null);

  // Mirror URL changes (navigation clears the query) into the input.
  useEffect(() => {
    setText(query);
  }, [query]);

  // Debounced write into the URL.
  useEffect(() => {
    if (text === query) return;
    const timer = window.setTimeout(() => onQueryRef.current(text), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text, query]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <Segmented label={t("artifacts.explorer.toolbar.segBox")}>
        <SegmentButton active={box === "in"} onClick={() => onBox("in")} label={t("artifacts.explorer.box.in")}>
          <span aria-hidden="true">⇩</span>
          {t("artifacts.explorer.box.in")}
        </SegmentButton>
        <SegmentButton active={box === "out"} onClick={() => onBox("out")} label={t("artifacts.explorer.box.out")}>
          <span aria-hidden="true">⇧</span>
          {t("artifacts.explorer.box.out")}
        </SegmentButton>
      </Segmented>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t("artifacts.explorer.toolbar.back")}
          title={t("artifacts.explorer.toolbar.back")}
          disabled={!props.canBack}
          onClick={props.onBack}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={t("artifacts.explorer.toolbar.forward")}
          title={t("artifacts.explorer.toolbar.forward")}
          disabled={!props.canForward}
          onClick={props.onForward}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      <nav aria-label={t("artifacts.explorer.toolbar.crumbs")} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm whitespace-nowrap">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <span key={crumb.id} className="flex min-w-0 items-center gap-1">
              {index > 0 ? <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" /> : null}
              <button
                type="button"
                aria-current={last ? "page" : undefined}
                onClick={() => props.onCrumb(crumb.target)}
                className={cn(
                  "truncate rounded-md px-1.5 py-1 hover:bg-muted hover:text-foreground",
                  last ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {crumb.label}
              </button>
            </span>
          );
        })}
      </nav>

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={t("artifacts.explorer.toolbar.search")}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("artifacts.explorer.toolbar.searchScope", { name: props.scopeName })}
          className="h-8 w-48 pl-8"
        />
      </div>

      <Segmented label={t("artifacts.explorer.toolbar.segView")}>
        <SegmentButton active={view === "list"} onClick={() => onView("list")} label={t("artifacts.explorer.toolbar.viewList")}>
          <List aria-hidden="true" className="size-4" />
        </SegmentButton>
        <SegmentButton active={view === "icons"} onClick={() => onView("icons")} label={t("artifacts.explorer.toolbar.viewIcons")}>
          <LayoutGrid aria-hidden="true" className="size-4" />
        </SegmentButton>
      </Segmented>

      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={previewOpen}
        title={t("artifacts.explorer.toolbar.previewToggle")}
        onClick={onTogglePreview}
      >
        <PanelRight aria-hidden="true" />
        {t("artifacts.explorer.toolbar.preview")}
      </Button>

      {box === "in" ? (
        <>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            aria-label={t("artifacts.explorer.toolbar.chooseFiles")}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) onUpload(files);
            }}
          />
          <Button type="button" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden="true" />
            {t("artifacts.explorer.toolbar.upload")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={props.contextActive}
            title={t("context.description", { defaultValue: "Archivos de referencia que los agentes pueden consultar durante su trabajo." })}
            onClick={props.onToggleContext}
          >
            <BookMarked aria-hidden="true" />
            {t("uxFiles.context", { defaultValue: "Context" })}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onNewFolder}>
            <FolderPlus aria-hidden="true" />
            {t("artifacts.explorer.toolbar.newFolder")}
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={!props.downloadEnabled} onClick={props.onDownload}>
          <Download aria-hidden="true" />
          {t("artifacts.explorer.toolbar.download")}
        </Button>
      )}
    </div>
  );
}
