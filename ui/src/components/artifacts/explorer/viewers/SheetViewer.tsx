import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import type { PreviewTarget } from "../preview-target";
import { TextContentStatus, ViewerMessage } from "./ViewerMessage";

const MAX_ROWS = 500;
const MAX_COLUMNS = 100;

interface ReadySheets {
  names: string[];
  readSheet: (name: string) => unknown[][];
}

type SheetState =
  | { status: "loading" }
  | { status: "ready"; sheets: ReadySheets }
  | { status: "error"; message: string };

/**
 * Renders the first sheet of an .xlsx/.xls workbook as a table. SheetJS is
 * loaded on demand so the spreadsheet code stays out of the main bundle.
 */
export function SheetViewer({ target }: { target: PreviewTarget }) {
  const { t } = useTranslation();
  const [state, setState] = useState<SheetState>({ status: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
  const contentPath = target.contentPath;

  useEffect(() => {
    if (!contentPath) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    (async () => {
      const response = await fetch(contentPath, { signal: controller.signal, credentials: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheets: ReadySheets = {
        names: workbook.SheetNames,
        readSheet: (name) => {
          const sheet = workbook.Sheets[name];
          return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) : [];
        },
      };
      return sheets;
    })()
      .then((sheets) => {
        if (!controller.signal.aborted) setState({ status: "ready", sheets });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
  }, [contentPath]);

  const ready = state.status === "ready" ? state.sheets : null;
  const activeName = ready && ready.names.length > 0
    ? (chosen && ready.names.includes(chosen) ? chosen : ready.names[0]!)
    : null;
  const allRows = useMemo(
    () => (ready && activeName ? ready.readSheet(activeName) : []),
    [ready, activeName],
  );

  if (!contentPath) return <ViewerMessage>{t("artifacts.explorer.viewer.unavailable")}</ViewerMessage>;
  if (state.status === "loading") return <ViewerMessage>{t("artifacts.explorer.viewer.loading")}</ViewerMessage>;
  if (state.status === "error") {
    return (
      <TextContentStatus
        state={{ status: "error", reason: "failed", message: state.message }}
        downloadPath={target.downloadPath}
      />
    );
  }
  if (!ready || !activeName) return <ViewerMessage>{t("artifacts.explorer.viewer.sheetEmpty")}</ViewerMessage>;

  const rows = allRows.slice(0, MAX_ROWS);
  const columnCount = allRows.reduce((count, row) => Math.max(count, row.length), 0);
  const columns = Array.from({ length: Math.min(columnCount, MAX_COLUMNS) }, (_, index) => index);
  const capped = allRows.length > MAX_ROWS || columnCount > MAX_COLUMNS;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        {ready.names.length > 1 ? (
          <label className="flex items-center gap-1.5">
            <span>{t("artifacts.explorer.viewer.sheet")}</span>
            <select
              value={activeName}
              onChange={(event) => setChosen(event.target.value)}
              className="h-6 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
            >
              {ready.names.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        ) : <span className="font-medium text-foreground">{activeName}</span>}
        {capped ? (
          <span>{t("artifacts.explorer.viewer.sheetCapped", { rows: rows.length, columns: columns.length })}</span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <ViewerMessage>{t("artifacts.explorer.viewer.sheetEmpty")}</ViewerMessage>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="even:bg-muted/30 hover:bg-accent/50">
                  <th scope="row" className="border-b border-border/50 px-2 py-1 text-right font-mono font-normal text-muted-foreground">{rowIndex + 1}</th>
                  {columns.map((column) => (
                    <td key={column} className="whitespace-nowrap border-b border-border/50 px-3 py-1 align-top">
                      {row[column] === undefined || row[column] === null ? "" : String(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
