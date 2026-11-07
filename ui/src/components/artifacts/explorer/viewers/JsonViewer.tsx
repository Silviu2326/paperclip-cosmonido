import { useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import type { PreviewTarget } from "../preview-target";
import { TextContentStatus } from "./ViewerMessage";
import { useTextContent } from "./useTextContent";

type ParseResult = { ok: true; value: unknown } | { ok: false };

function JsonNode({ name, value, depth }: { name: string | null; value: unknown; depth: number }) {
  if (value !== null && typeof value === "object") {
    return <JsonBranch name={name} value={value} depth={depth} />;
  }
  const label = name === null ? null : <span className="text-muted-foreground">{name}: </span>;
  const display = typeof value === "string" ? JSON.stringify(value) : String(value);
  return (
    <div className="whitespace-pre-wrap break-all">
      {label}
      <span className={typeof value === "string" ? "text-foreground" : "text-muted-foreground"}>{display}</span>
    </div>
  );
}

/** Collapsible object or array. Children mount only while the branch is open. */
function JsonBranch({ name, value, depth }: { name: string | null; value: object; depth: number }) {
  const isArray = Array.isArray(value);
  const entries: Array<[string, unknown]> = isArray
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value as Record<string, unknown>);
  const [open, setOpen] = useState(depth < 2);
  const opening = isArray ? "[" : "{";
  const closing = isArray ? "]" : "}";
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer select-none">
        {name === null ? null : <span className="text-muted-foreground">{name}: </span>}
        <span>{opening}</span>
        {open ? null : <span className="text-muted-foreground"> {entries.length} </span>}
        {open ? null : <span>{closing}</span>}
      </summary>
      {open ? (
        <div className="pl-4">
          {entries.map(([key, item]) => <JsonNode key={key} name={key} value={item} depth={depth + 1} />)}
          <div>{closing}</div>
        </div>
      ) : null}
    </details>
  );
}

export function JsonViewer({ target }: { target: PreviewTarget }) {
  const { t } = useTranslation();
  const content = useTextContent(target);
  const parsed = useMemo<ParseResult | null>(() => {
    if (content.status !== "ready") return null;
    try {
      return { ok: true, value: JSON.parse(content.text) as unknown };
    } catch {
      return { ok: false };
    }
  }, [content]);

  if (content.status !== "ready" || !parsed) {
    return <TextContentStatus state={content} downloadPath={target.downloadPath} />;
  }
  if (!parsed.ok) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{t("artifacts.explorer.viewer.jsonInvalid")}</p>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs">{content.text}</pre>
      </div>
    );
  }
  return (
    <div className="h-full min-h-0 w-full overflow-auto p-3 font-mono text-xs">
      <JsonNode name={null} value={parsed.value} depth={0} />
    </div>
  );
}
