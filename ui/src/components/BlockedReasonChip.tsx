import { AlertTriangle, Clock, Pause, User, Wrench } from "lucide-react";
import type { ComponentType } from "react";
import type { IssueBlockedInboxSeverity } from "@paperclipai/shared";
import { cn } from "../lib/utils";
import { useTranslation } from "@/i18n";
import {
  blockedReasonVariant,
  blockedVariantLabel,
  type BlockedReasonVariant,
} from "../lib/blockedInbox";
import type { IssueBlockedInboxReason } from "@paperclipai/shared";

interface BlockedReasonChipProps {
  reason: IssueBlockedInboxReason;
  severity: IssueBlockedInboxSeverity;
  compact?: boolean;
  className?: string;
}

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const VARIANT_STYLES: Record<BlockedReasonVariant, string> = {
  needs_decision:
    "border-violet-300/70 bg-secondary text-violet-800 dark:border-violet-500/30 dark:bg-secondary/10 dark:text-violet-300",
  recovery_required:
    "border-cyan-300/70 bg-secondary text-cyan-800 dark:border-cyan-500/30 dark:bg-secondary/10 dark:text-cyan-300",
  stalled:
    "border-amber-400/70 bg-muted text-amber-900 dark:border-amber-500/40 dark:bg-muted/15 dark:text-amber-200",
  needs_attention:
    "border-amber-300/70 bg-muted text-amber-800 dark:border-amber-500/40 dark:bg-muted/10 dark:text-amber-300",
  external_wait:
    "border-border bg-muted text-foreground dark:border-border/30 dark:bg-muted/15",
  owner_paused:
    "border-destructive/70 bg-destructive/10 text-destructive dark:border-destructive/30",
};

const VARIANT_ICONS: Record<BlockedReasonVariant, IconComponent> = {
  needs_decision: Clock,
  recovery_required: Wrench,
  stalled: AlertTriangle,
  needs_attention: AlertTriangle,
  external_wait: User,
  owner_paused: Pause,
};

const SEVERITY_DOT: Partial<Record<IssueBlockedInboxSeverity, string>> = {
  critical: "bg-destructive",
  high: "bg-orange-500",
};

export function BlockedReasonChip({
  reason,
  severity,
  compact = false,
  className,
}: BlockedReasonChipProps) {
  const { t } = useTranslation();
  const variant = blockedReasonVariant(reason);
  const label = blockedVariantLabel(variant);
  const Icon = VARIANT_ICONS[variant];
  const dotClass = SEVERITY_DOT[severity];
  return (
    <span
      data-testid="blocked-reason-chip"
      data-variant={variant}
      data-severity={severity}
      aria-label={t("blockedReasonChip.ariaLabel", { label, severity })}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-(length:--text-nano) font-medium leading-tight sm:text-(length:--text-micro)",
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {dotClass ? (
        <span
          aria-hidden="true"
          className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", dotClass)}
        />
      ) : null}
      {compact ? null : <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="truncate">{label}</span>
    </span>
  );
}
