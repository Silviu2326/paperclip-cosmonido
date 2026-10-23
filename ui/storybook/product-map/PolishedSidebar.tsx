import { useState } from "react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { NavLink } from "@/lib/router";
import { SidebarAgents } from "@/components/SidebarAgents";
import { SidebarCompanyMenu } from "@/components/SidebarCompanyMenu";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "./motion";
import { pageById } from "./pages";
import { AGENT_LIST_ITEM, type SidebarProposalSection } from "./sidebar-proposal";

/**
 * Design proposal for a more polished sidebar: a highlight that slides to the
 * active page, animated section folding, a short staggered entrance and hover
 * feedback. Timings and curves come from the motion tokens in ui/src
 * (motion-tokens.css / index.css), so "reduce motion" collapses them to zero.
 */

function iconFor(name: string): LucideIcon {
  return (Icons as unknown as Record<string, LucideIcon | undefined>)[name] ?? Icons.Circle;
}

/** Mock counts so the proposal shows how badges sit; the real app reads them from the API. */
const DEMO_BADGES: Record<string, { count: number; attention?: boolean }> = {
  decisions: { count: 3, attention: true },
  tasks: { count: 12 },
  conversations: { count: 2 },
};
const ATTENTION = "var(--agent-10a)";
const NEUTRAL_ACCENT = "var(--muted-foreground)";

function NavItem({ id, index, accent }: { id: string; index: number; accent: string }) {
  const tokens = useMotionTokens();
  const page = pageById(id);
  const Icon = iconFor(page.icon);
  const badge = DEMO_BADGES[id];
  const badgeColor = badge?.attention ? ATTENTION : accent;
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
    >
      <NavLink
        to={page.route}
        className={({ isActive }) => cn(
          "group relative flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm outline-none",
          "transition-colors duration-(--motion-duration-fast) ease-(--motion-ease-standard)",
          "focus-visible:ring-2 focus-visible:ring-ring",
          isActive ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        {({ isActive }) => (
          <>
            {isActive ? (
              <motion.span
                layoutId="polished-sidebar-active"
                aria-hidden="true"
                className="absolute inset-0 rounded-lg shadow-sm"
                style={{ background: `linear-gradient(90deg, ${tint(accent, 22)}, ${tint(accent, 6)})` }}
                transition={{ duration: tokens.base, ease: tokens.easeOut }}
              >
                <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full" style={{ background: accent }} />
              </motion.span>
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                "transition-[transform,background-color] duration-(--motion-duration-fast) ease-(--motion-ease-out-expo)",
                "group-hover:scale-110 group-hover:-rotate-3",
              )}
              style={isActive
                ? { background: `linear-gradient(135deg, ${accent}, ${tint(accent, 70)})`, color: ink(accent) }
                : { background: tint(accent, 16), color: readable(accent) }}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className={cn("relative min-w-0 flex-1 truncate", isActive && "font-medium")}>{page.name}</span>
            {badge ? (
              <motion.span
                key={badge.count}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.15 + index * tokens.stagger }}
                className="relative rounded-full px-1.5 text-xs font-semibold tabular-nums"
                style={{ background: tint(badgeColor, badge.attention ? 85 : 22), color: badge.attention ? ink(badgeColor) : undefined }}
              >
                {badge.count}
              </motion.span>
            ) : null}
          </>
        )}
      </NavLink>
    </motion.div>
  );
}

function Section({ section, offset }: { section: SidebarProposalSection; offset: number }) {
  const tokens = useMotionTokens();
  const [open, setOpen] = useState(!section.collapsed);
  const accent = section.accent ? `var(${section.accent})` : NEUTRAL_ACCENT;
  const body = section.items.map((id, index) => id === AGENT_LIST_ITEM
    ? <SidebarAgents key={id} streamlined />
    : <NavItem key={id} id={id} index={offset + index} accent={accent} />);
  if (!section.label) return <div className="flex flex-col gap-0.5">{body}</div>;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group flex items-center gap-2 rounded-md px-2.5 py-1 text-left text-xs font-medium uppercase tracking-wide",
          "text-muted-foreground/80 transition-colors duration-(--motion-duration-fast) hover:text-foreground",
        )}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        <span className="flex-1">{section.label}</span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: tokens.fast, ease: tokens.standard }}
          className="flex opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100"
        >
          <Icons.ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="flex flex-col gap-0.5 overflow-hidden"
          >
            {body}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function PolishedSidebar({ sections }: { sections: SidebarProposalSection[] }) {
  const offsets = sections.reduce<number[]>((acc, section, index) => {
    acc.push(index === 0 ? 0 : acc[index - 1]! + sections[index - 1]!.items.length);
    return acc;
  }, []);
  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-background">
      <div className="shrink-0 border-b border-border/60 px-3 pb-2 pt-2">
        <SidebarCompanyMenu />
      </div>
      <div className="shrink-0 px-3 pb-1 pt-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:border-foreground/30 hover:text-foreground">
          <Icons.Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">Buscar</span>
          <kbd className="rounded border border-border px-1 text-xs">⌘K</kbd>
        </div>
      </div>
      <LayoutGroup id="polished-sidebar">
        <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-2">
          {sections.map((section, index) => (
            <Section key={`${section.label}-${index}`} section={section} offset={offsets[index] ?? 0} />
          ))}
        </nav>
      </LayoutGroup>
    </aside>
  );
}
