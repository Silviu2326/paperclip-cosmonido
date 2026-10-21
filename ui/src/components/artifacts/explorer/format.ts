import { t } from "@/i18n";
import type { PreviewKind } from "./preview-target";

const UNITS = ["KB", "MB", "GB", "TB"] as const;

/** Formats a byte count in Spanish style ("1,2 MB", "96 KB"). Null renders as an em dash. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const formatter = new Intl.NumberFormat("es", {
    maximumFractionDigits: value < 10 ? 1 : 0,
    minimumFractionDigits: 0,
  });
  return `${formatter.format(value)} ${UNITS[unit]}`;
}

export function kindLabel(kind: PreviewKind): string {
  return t(`artifacts.explorer.preview.kind.${kind}`);
}
