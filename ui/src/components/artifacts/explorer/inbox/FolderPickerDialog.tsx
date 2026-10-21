import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { type CompanyFileFolderNode, companyFilesApi } from "@/api/company-files";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

export interface FolderPickerDialogProps {
  open: boolean;
  companyId: string;
  title: string;
  confirmLabel: string;
  /** `null` means the Entrada root. */
  initialFolderId: string | null;
  /** This folder and its subtree are hidden from the list. */
  excludeFolderId?: string | null;
  pending?: boolean;
  /** Message from a failed request, shown inside the dialog. */
  error?: string | null;
  /** Optional content rendered above the folder list (e.g. a name field). */
  beforeTree?: ReactNode;
  onConfirm: (folderId: string | null) => void;
  onClose: () => void;
}

interface VisibleRow {
  node: CompanyFileFolderNode;
  depth: number;
}

// Indentation uses spacing-scale classes only (no arbitrary values) to satisfy the token gate.
const INDENT_CLASSES = ["pl-1", "pl-5", "pl-9", "pl-13", "pl-17", "pl-21", "pl-25", "pl-29"];

function flattenVisible(
  nodes: CompanyFileFolderNode[],
  expanded: Set<string>,
  excludeId: string | null,
  depth = 0,
  out: VisibleRow[] = [],
): VisibleRow[] {
  for (const node of nodes) {
    if (node.id === excludeId) continue;
    out.push({ node, depth });
    if (expanded.has(node.id)) flattenVisible(node.children, expanded, excludeId, depth + 1, out);
  }
  return out;
}

/** Ids of the folders that lead to `targetId` (excluding the target itself), or null when not found. */
function ancestorIds(nodes: CompanyFileFolderNode[], targetId: string): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return [];
    const inner = ancestorIds(node.children, targetId);
    if (inner) return [node.id, ...inner];
  }
  return null;
}

/** Pick one Entrada folder (or the root) from the company's folder tree. */
export function FolderPickerDialog({
  open,
  companyId,
  title,
  confirmLabel,
  initialFolderId,
  excludeFolderId = null,
  pending = false,
  error = null,
  beforeTree,
  onConfirm,
  onClose,
}: FolderPickerDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(initialFolderId);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const treeQuery = useQuery({
    queryKey: queryKeys.companyFiles.tree(companyId),
    queryFn: () => companyFilesApi.tree(companyId),
    enabled: open,
  });
  const tree = treeQuery.data ?? [];

  // Open the folders that contain the initial selection so it is visible.
  useEffect(() => {
    if (!treeQuery.data || !initialFolderId) return;
    const path = ancestorIds(treeQuery.data, initialFolderId);
    if (path && path.length > 0) setExpanded((prev) => new Set([...prev, ...path]));
  }, [treeQuery.data, initialFolderId]);

  const rows = useMemo(
    () => flattenVisible(tree, expanded, excludeFolderId),
    [tree, expanded, excludeFolderId],
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pending) onConfirm(selected);
  }

  const loadError = treeQuery.error instanceof Error ? treeQuery.error.message : null;

  const rowClass = (checked: boolean) =>
    cn(
      "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent/50",
      checked && "bg-accent text-accent-foreground",
    );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex max-h-(--sz-85vh) flex-col gap-4 sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{t("artifacts.explorer.inbox.picker.location")}</DialogDescription>
          </DialogHeader>

          {beforeTree}

          <div
            role="radiogroup"
            aria-label={t("artifacts.explorer.inbox.picker.location")}
            className="flex min-h-0 flex-col gap-1 overflow-y-auto"
          >
            <div className="flex items-center gap-1">
              <span className="size-6 shrink-0" aria-hidden />
              <button
                type="button"
                role="radio"
                aria-checked={selected === null}
                onClick={() => setSelected(null)}
                className={rowClass(selected === null)}
              >
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{t("artifacts.explorer.inbox.picker.root")}</span>
              </button>
            </div>

            {treeQuery.isPending ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("artifacts.explorer.inbox.loading")}</p>
            ) : null}

            {!treeQuery.isPending && !loadError && tree.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("artifacts.explorer.inbox.picker.empty")}</p>
            ) : null}

            {rows.map(({ node, depth }) => {
              const hasChildren = node.children.length > 0;
              const isOpen = expanded.has(node.id);
              return (
                <div
                  key={node.id}
                  className={cn("flex items-center gap-1", INDENT_CLASSES[Math.min(depth, INDENT_CLASSES.length - 1)])}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggle(node.id)}
                      aria-expanded={isOpen}
                      aria-label={t(
                        isOpen ? "artifacts.explorer.inbox.picker.collapse" : "artifacts.explorer.inbox.picker.expand",
                        { name: node.name },
                      )}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50"
                    >
                      {isOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                    </button>
                  ) : (
                    <span className="size-6 shrink-0" aria-hidden />
                  )}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected === node.id}
                    onClick={() => setSelected(node.id)}
                    className={rowClass(selected === node.id)}
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{node.name}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {error || loadError ? (
            <p role="alert" className="text-sm text-destructive">
              {error ?? loadError}
            </p>
          ) : null}

          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("artifacts.explorer.inbox.cancel")}
            </Button>
            <Button type="submit" disabled={pending || treeQuery.isPending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
