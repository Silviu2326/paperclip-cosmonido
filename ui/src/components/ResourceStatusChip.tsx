import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { brandChipBadge, type BrandChipColor } from "@/lib/status-colors";
import { t } from "@/i18n";

/**
 * The load-bearing visual grammar for the built-in bundle status panel
 * (Reflection Coach — [PAP-13099], ux-spec §4). Each variant double-encodes
 * state as glyph + word + color so it never relies on color alone
 * (WCAG 1.4.1). Colors route through the shared `brandChipBadge` families — no
 * bespoke tints are minted here (ux-spec §10).
 *
 * A single resource shows at most one readiness chip and at most one drift
 * chip; when both a readiness problem and a drift state coexist, the caller
 * suppresses the drift chip until readiness is `ready` (ux-spec §4).
 */
export type ResourceStatusVariant =
  | "ready"
  | "needs_setup"
  | "missing"
  | "error"
  | "update_available"
  | "drifted"
  | "schedule_off"
  | "schedule_on"
  | "pending_approval"
  | "proposal_pending";

interface VariantSpec {
  color: BrandChipColor;
  glyph: string;
  label: string;
  title: string;
}

const VARIANTS: Record<ResourceStatusVariant, VariantSpec> = {
  ready: { color: "green", glyph: "●", label: t("resourceStatusChip.ready.label"), title: t("resourceStatusChip.ready.title") },
  needs_setup: { color: "amber", glyph: "⚠", label: t("resourceStatusChip.needsSetup.label"), title: t("resourceStatusChip.needsSetup.title") },
  missing: { color: "amber", glyph: "⚠", label: t("resourceStatusChip.missing.label"), title: t("resourceStatusChip.missing.title") },
  error: { color: "red", glyph: "✕", label: t("resourceStatusChip.error.label"), title: t("resourceStatusChip.error.title") },
  update_available: {
    color: "blue",
    glyph: "↑",
    label: t("resourceStatusChip.updateAvailable.label"),
    title: t("resourceStatusChip.updateAvailable.title"),
  },
  drifted: {
    color: "gray",
    glyph: "✎",
    label: t("resourceStatusChip.drifted.label"),
    title: t("resourceStatusChip.drifted.title"),
  },
  schedule_off: {
    color: "gray",
    glyph: "◌",
    label: t("resourceStatusChip.scheduleOff.label"),
    title: t("resourceStatusChip.scheduleOff.title"),
  },
  schedule_on: { color: "green", glyph: "●", label: t("resourceStatusChip.scheduleOn.label"), title: t("resourceStatusChip.scheduleOn.title") },
  pending_approval: {
    color: "amber",
    glyph: "⚠",
    label: t("resourceStatusChip.pendingApproval.label"),
    title: t("resourceStatusChip.pendingApproval.title"),
  },
  proposal_pending: {
    color: "blue",
    glyph: "↑",
    label: t("resourceStatusChip.proposalPending.label"),
    title: t("resourceStatusChip.proposalPending.title"),
  },
};

export function ResourceStatusChip({
  variant,
  label,
  compact = false,
  className,
}: {
  variant: ResourceStatusVariant;
  /** Override the default label (e.g. "Weekly · Mon 09:00 UTC"). */
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const spec = VARIANTS[variant];
  return (
    <Badge
      variant="outline"
      className={cn(
        brandChipBadge[spec.color],
        "font-medium",
        compact && "px-1.5 py-0 text-(length:--text-nano)",
        className,
      )}
      title={spec.title}
    >
      <span aria-hidden="true">{spec.glyph}</span>
      {label ?? spec.label}
    </Badge>
  );
}
