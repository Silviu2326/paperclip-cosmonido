import { useTranslation } from "@/i18n";
import type { ExplorerBox, ExplorerItem } from "./explorer-model";
import { formatBytes } from "./format";

interface ExplorerStatusBarProps {
  box: ExplorerBox;
  count: number;
  selected: ExplorerItem | null;
  /** Short transient message, e.g. "Enlace copiado". */
  notice?: string | null;
}

/** Bottom line of the explorer: counts, selection, and who may write in this box. */
export function ExplorerStatusBar({ box, count, selected, notice }: ExplorerStatusBarProps) {
  const { t } = useTranslation();
  const itemsText = count === 1 ? t("artifacts.explorer.status.itemsOne") : t("artifacts.explorer.status.items", { count });
  const selectedSize = selected?.kind === "file" ? formatBytes(selected.byteSize) : null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-1.5 text-xs text-muted-foreground"
    >
      <span>{itemsText}</span>
      {selected ? (
        <span>
          {t("artifacts.explorer.status.selected")}
          {selectedSize ? ` · ${selectedSize}` : ""}
        </span>
      ) : null}
      {notice ? <span className="text-foreground">{notice}</span> : null}
      <span className="ml-auto">
        {box === "in" ? t("artifacts.explorer.status.ruleIn") : t("artifacts.explorer.status.ruleOut")}
      </span>
    </div>
  );
}
