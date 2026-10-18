import type { ProviderTraceMetadata } from "@paperclipai/shared";
import { Bug, CircleOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export function runRequestedProviderTrace(
  contextSnapshot: Record<string, unknown> | null | undefined,
) {
  if (!contextSnapshot) return false;
  const debug = contextSnapshot.debug;
  return (
    typeof debug === "object" &&
    debug !== null &&
    !Array.isArray(debug) &&
    (debug as Record<string, unknown>).providerTrace === "raw"
  );
}

export function ProviderTraceStatusBadge({
  trace,
  requested = false,
  showOff = false,
  className,
}: {
  trace?: ProviderTraceMetadata | null;
  requested?: boolean;
  showOff?: boolean;
  className?: string;
}) {
  const status = trace?.status;
  const expired = trace
    ? new Date(trace.expiresAt).getTime() <= Date.now()
    : false;
  const labelKey = expired
    ? "expired"
    : status === "capturing"
      ? "enabled"
      : status === "complete"
        ? "captured"
        : status === "incomplete"
          ? "incomplete"
          : status === "truncated"
            ? "truncated"
            : status === "expired"
              ? "expired"
              : status === "deleted"
                ? "deleted"
                : requested
                  ? "requested"
                  : showOff
                    ? "off"
                    : null;
  if (!labelKey) return null;
  const label = t(`providerTraceStatusBadge.${labelKey}`);
  const warning =
    status === "incomplete" ||
    status === "truncated" ||
    status === "expired" ||
    status === "deleted" ||
    expired;
  const Icon = labelKey === "off" ? CircleOff : Bug;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
        labelKey === "off" || labelKey === "deleted" || labelKey === "expired"
          ? "border-border bg-background text-muted-foreground"
          : warning
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-amber-500/30 bg-muted/10 text-amber-800 dark:text-amber-200",
        className,
      )}
      title={
        trace
          ? t("providerTraceStatusBadge.frameSummary", {
              frames: trace.frameCount,
              bytes: trace.byteCount,
              expires: new Date(trace.expiresAt).toLocaleString(),
            })
          : requested
            ? t("providerTraceStatusBadge.requestedTitle")
            : t("providerTraceStatusBadge.offTitle")
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
