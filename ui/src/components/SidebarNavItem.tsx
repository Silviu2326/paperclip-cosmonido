import { createContext, useContext, type ReactNode } from "react";
import { motion } from "motion/react";
import { NavLink } from "@/lib/router";
import { SIDEBAR_SCROLL_RESET_STATE } from "../lib/navigation-scroll";
import { cn, SIDEBAR_RAIL_HIDDEN_LABEL } from "../lib/utils";
import { useSidebar } from "../context/SidebarContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";
import { accentInk, accentReadable, accentTint } from "../lib/accent";
import { useMotionTokens } from "../hooks/useMotionTokens";

/**
 * Forces the full-label (non-rail) presentation for any `SidebarNavItem`
 * rendered beneath it, regardless of the global `useSidebar().collapsed` state.
 *
 * Contextual takeover routes replace the global navigation inside the same
 * sidebar shell. The user's saved global collapse preference can still be
 * `collapsed=true`, so this provider keeps contextual navigation readable
 * without mutating that preference.
 */
const SidebarNavExpandedContext = createContext(false);

export function SidebarNavExpandedProvider({ children }: { children: ReactNode }) {
  return (
    <SidebarNavExpandedContext.Provider value={true}>
      {children}
    </SidebarNavExpandedContext.Provider>
  );
}

export function useSidebarNavExpanded() {
  return useContext(SidebarNavExpandedContext);
}

/**
 * Marks the streamlined primary navigation (Sidebar.tsx). Rows beneath it use
 * the inequivocal active treatment: cream surface, ink bold text and a 3px
 * orange accent bar. Contextual sidebars never mount this provider, so their
 * rows keep the shared highlight.
 */
const SidebarPrimaryNavContext = createContext(false);

export function SidebarPrimaryNavProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  return (
    <SidebarPrimaryNavContext.Provider value={enabled}>
      {children}
    </SidebarPrimaryNavContext.Provider>
  );
}

/**
 * Accent colour of the nav group a row sits in (a CSS colour, usually a brand
 * agent token). Inside the streamlined primary nav it gives rows a coloured
 * icon tile and a highlight that slides to the active page.
 */
const SidebarAccentContext = createContext<string | null>(null);

export function SidebarAccentProvider({ accent, children }: { accent: string | null; children: ReactNode }) {
  return <SidebarAccentContext.Provider value={accent}>{children}</SidebarAccentContext.Provider>;
}

export function useSidebarAccent() {
  return useContext(SidebarAccentContext);
}

interface SidebarNavItemProps {
  to: string;
  label: string;
  icon?: LucideIcon;
  /**
   * Pre-rendered icon element for rows whose icon isn't a plain Lucide
   * component (e.g. the agent rows' `AgentIcon`). Takes precedence over `icon`;
   * the caller owns its sizing/color classes.
   */
  iconNode?: ReactNode;
  end?: boolean;
  className?: string;
  labelClassName?: string;
  badge?: number;
  badgeTone?: "default" | "danger" | "warning";
  /**
   * Accessible noun for the numeric badge when collapsed to the rail, where the
   * count is rendered as a dot (e.g. `badgeLabel="unread"` → "Inbox, 28 unread").
   */
  badgeLabel?: string;
  textBadge?: string;
  textBadgeTone?: "default" | "amber";
  alert?: boolean;
  liveCount?: number;
  /**
   * Overrides NavLink's own route matching for rows whose active state is
   * computed externally (agent rows match `/agents/:ref` across tab suffixes).
   */
  active?: boolean;
  /** Rendered after the label, before the right-aligned status cluster. */
  trailing?: ReactNode;
  /** Accessible text for `trailing` status content, surfaced in the collapsed rail (where `trailing` is hidden). */
  trailingLabel?: string;
  /** Rendered inside the right-aligned status cluster, before the live dot. */
  liveAccessory?: ReactNode;
}

export function SidebarNavItem({
  to,
  label,
  icon: Icon,
  iconNode,
  end,
  className,
  labelClassName,
  badge,
  badgeTone = "default",
  badgeLabel,
  textBadge,
  textBadgeTone = "default",
  alert = false,
  liveCount,
  active,
  trailing,
  trailingLabel,
  liveAccessory,
}: SidebarNavItemProps) {
  const { isMobile, setSidebarOpen, collapsed, peeking } = useSidebar();
  // A contextual takeover forces full labels even when the saved global app
  // sidebar preference is collapsed.
  const forceExpanded = useSidebarNavExpanded();
  const primaryNav = useContext(SidebarPrimaryNavContext);
  const accent = useSidebarAccent();
  const tokens = useMotionTokens();
  // Coloured treatment: only the streamlined primary nav, and only for rows in an accent group.
  const accented = primaryNav && accent != null;
  // The icon-only rail presentation only applies when pinned collapsed and not
  // peeking; a peek/expanded panel — or a contextual takeover — restores
  // the full label + badge.
  const rail = collapsed && !peeking && !forceExpanded;

  const hasBadge = badge != null && badge > 0;
  const hasLive = liveCount != null && liveCount > 0;
  const showIconSlot = Boolean(iconNode || Icon || alert || (rail && (hasLive || hasBadge)));

  // Accessible text equivalent for the collapsed dot indicator. The visible
  // label is `sr-only` in the rail, so the count must be surfaced here.
  const railStatusText = hasLive
    ? t("sidebarNavItem.liveCount", { count: liveCount })
    : hasBadge
      ? `${badge}${badgeLabel ? ` ${badgeLabel}` : ""}`
      : alert
        ? t("sidebarNavItem.attentionNeeded")
        : undefined;
  const railAriaLabel = !rail || (!railStatusText && !trailingLabel)
    ? undefined
    : `${label}${railStatusText ? `, ${railStatusText}` : ""}${trailingLabel ? `, ${trailingLabel}` : ""}`;

  const renderRow = (isCurrent: boolean) => (
    <>
      {accented && isCurrent ? (
        <motion.span
          layoutId="sidebar-active-row"
          aria-hidden="true"
          data-slot="sidebar-active-row"
          className="absolute inset-0 rounded-lg shadow-sm"
          style={{ background: `linear-gradient(90deg, ${accentTint(accent, 22)}, ${accentTint(accent, 6)})` }}
          transition={{ duration: tokens.base, ease: tokens.easeOut }}
        >
          <span className="absolute inset-y-1.5 left-0 w-(--sidebar-active-marker-width) rounded-full" style={{ background: accent }} />
        </motion.span>
      ) : null}
      {showIconSlot ? (
        <span
          data-slot="sidebar-nav-icon"
          className={cn(
            "relative shrink-0",
            accented && !rail && "flex h-6 w-6 items-center justify-center rounded-md transition-transform duration-(--motion-duration-fast) ease-(--motion-ease-out-expo) group-hover:-rotate-3 group-hover:scale-110",
          )}
          style={accented
            ? rail
              ? { color: accentReadable(accent) }
              : isCurrent
                ? { background: `linear-gradient(135deg, ${accent}, ${accentTint(accent, 70)})`, color: accentInk(accent) }
                : { background: accentTint(accent, 16), color: accentReadable(accent) }
            : undefined}
        >
          {iconNode ?? (Icon ? <Icon className={accented && !rail ? "h-3.5 w-3.5" : "h-4 w-4"} /> : null)}
          {alert && (
            <span
              data-slot="sidebar-icon-alert-badge"
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive shadow-(--shadow-sidebar-icon-badge)"
              aria-hidden="true"
            />
          )}
          {/* Collapsed rail: numeric badge / live count collapse to a dot on the
              icon. The icon markup is untouched so it stays pixel-aligned. */}
          {rail && !alert && hasLive && (
            <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2" aria-hidden="true">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary shadow-(--shadow-sidebar-icon-badge)" />
            </span>
          )}
          {rail && !alert && !hasLive && hasBadge && (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full shadow-(--shadow-sidebar-icon-badge)",
                badgeTone === "danger"
                  ? "bg-destructive"
                  : badgeTone === "warning"
                    ? "bg-amber-500"
                    : "bg-primary",
              )}
              aria-hidden="true"
            />
          )}
        </span>
      ) : null}
      <span className={rail ? SIDEBAR_RAIL_HIDDEN_LABEL : cn("min-w-0 flex-1 truncate", accented && "relative", labelClassName)}>{label}</span>
      {!rail && trailing}
      {!rail && textBadge && (
        <Badge variant="ghost"
          className={cn(
            "ml-auto px-1.5 text-(length:--text-nano) leading-none",
            accented && "relative",
            textBadgeTone === "amber"
              ? "bg-muted text-amber-800 dark:bg-muted/30 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {textBadge}
        </Badge>
      )}
      {!rail && (hasLive || liveAccessory) && (
        <span className={cn("ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap", accented && "relative")}>
          {liveAccessory}
          {hasLive && (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-(length:--text-micro) font-medium text-primary">{t("sidebarNavItem.liveCount", { count: liveCount })}</span>
            </>
          )}
        </span>
      )}
      {!rail && hasBadge && (
        <Badge variant="ghost"
          style={accented && badgeTone === "default" ? { background: accentTint(accent, 28), color: accentReadable(accent) } : undefined}
          className={cn(
            "ml-auto px-1.5 leading-none",
            accented && "relative",
            badgeTone === "danger"
              ? "bg-destructive/90 text-destructive"
              : badgeTone === "warning"
                ? "bg-muted/90 text-amber-50"
                : accented
                  ? ""
                  : "bg-primary text-primary-foreground",
          )}
        >
          {badge}
        </Badge>
      )}
    </>
  );

  const link = (
    <NavLink
      to={to}
      state={SIDEBAR_SCROLL_RESET_STATE}
      end={end}
      aria-label={railAriaLabel}
      onClick={() => { if (isMobile) setSidebarOpen(false); }}
      className={({ isActive }) =>
        cn(
          // One rhythm and one inset pill highlight: mx-2 floats the row off
          // the sidebar edges, rounded-lg matches the card anchor, px-2 gives
          // the icon breathing room inside the pill. Rows with hover menus
          // (agents/projects) reserve extra right padding via className.
          "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 text-(length:--text-compact) font-medium transition-colors",
          accented
            ? cn(
                "group relative py-1 pointer-coarse:py-0.5",
                (active ?? isActive) ? "font-semibold text-foreground" : "text-foreground/80 hover:bg-secondary hover:text-foreground",
              )
            : primaryNav
            ? (active ?? isActive)
              ? "relative bg-background font-semibold text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-(--sidebar-active-marker-width) before:rounded-full before:bg-(--sidebar-active-marker-color) dark:bg-secondary"
              : "text-foreground/80 hover:bg-secondary hover:text-foreground"
            : (active ?? isActive)
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          className,
        )
      }
    >
      {accented ? ((state: { isActive: boolean }) => renderRow(active ?? state.isActive)) : renderRow(false)}
    </NavLink>
  );

  if (!rail) return link;

  // The tooltip wraps a plain block element rather than the NavLink directly:
  // Radix `asChild` (Slot) drops React Router's *function* className, which would
  // strip `flex` off the <a> and render it as a block — the in-flow label would
  // then stack under the icon and the row would grow. Anchoring the tooltip to a
  // wrapper keeps the <a> rendering normally (flex), so the row stays 1:1 with
  // the expanded state and the icon never moves (PAP-10676).
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{link}</div>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
