import { AlertTriangle } from "lucide-react";
import { ApiError } from "@/api/client";

/** Reads the candidates of a 409 duplicate response; empty when the error is anything else. */
export function duplicateCandidatesFromError(err: unknown): Array<{ record: unknown; reasons: string[] }> {
  if (!(err instanceof ApiError) || err.status !== 409) return [];
  const body = err.body as { details?: { candidates?: unknown } } | undefined;
  const candidates = body?.details?.candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates as Array<{ record: unknown; reasons: string[] }>;
}

export interface CustomerDuplicateNoticeItem {
  id: string;
  label: string;
  reasons: string[];
}

/**
 * Lists possible duplicates returned by a 409 on create. Nothing is merged here:
 * the user either reviews the records or confirms the create anyway.
 */
export function CustomerDuplicateNotice({
  title,
  hint,
  items,
  reasonLabel,
}: {
  title: string;
  hint: string;
  items: CustomerDuplicateNoticeItem[];
  reasonLabel: (reason: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className="font-medium">{item.label}</span>
            {item.reasons.map((reason) => (
              <span key={reason} className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {reasonLabel(reason)}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
