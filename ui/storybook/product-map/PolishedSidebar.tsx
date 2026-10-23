import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { NavLink } from "@/lib/router";
import { SidebarAgents } from "@/components/SidebarAgents";
import { SidebarCompanyMenu } from "@/components/SidebarCompanyMenu";
import { cn } from "@/lib/utils";
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

function readToken(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function seconds(name: string, fallbackMs: number): number {
  const raw = readToken(name);
  const value = raw.endsWith("ms") ? Number.parseFloat(raw) : raw.endsWith("s") ? Number.parseFloat(raw) * 1000 : Number.NaN;
  return (Number.isFinite(value) ? value : fallbackMs) / 1000;
}

function bezier(name: string): [number, number, number, number] {
  const match = readToken(name).match(/cubic-bezier\(([^)]+)\)/);
  const parts = match?.[1]?.split(",").map((part) => Number.parseFloat(part));
  return parts && parts.length === 4 && parts.every(Number.isFinite)
    ? (parts as [number, number, number, number])
    : [0.16, 1, 0.3, 1];
}

function useMotionTokens() {
  const reduced = useReducedMotion();
  return useMemo(() => {
    const zero = reduced === true;
    return {
      fast: zero ? 0 : seconds("--motion-duration-fast", 160),
      base: zero ? 0 : seconds("--motion-duration-base", 240),
      stagger: zero ? 0 : seconds("--motion-plan-entry-stagger", 40),
      easeOut: bezier("--motion-ease-out-expo"),
      standard: bezier("--motion-ease-standard"),
    };
  }, [reduced]);
}

/** Mock counts so the proposal shows how badges sit; the real app reads them from the API. */
const DEMO_BADGES: Record<string, number> = { decisions: 3, tasks: 12, conversations: 2 };

function NavItem({ id, index }: { id: string; index: number }) {
  const tokens = useMotionTokens();
  const page = pageById(id);
  const Icon = iconFor(page.icon);
  const badge = DEMO_BADGES[id];
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
    >
      <NavLink
        to={page.route}
        className={({ isActive }) => cn(
          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm outline-none",
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
                className="absolute inset-0 rounded-lg bg-accent shadow-sm"
                transition={{ duration: tokens.base, ease: tokens.easeOut }}
              >
                <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
              </motion.span>
            ) : null}
            <Icon
              aria-hidden="true"
              className={cn(
                "relative h-4 w-4 shrink-0 transition-transform duration-(--motion-duration-fast) ease-(--motion-ease-out-expo)",
                "group-hover:scale-110",
                isActive && "text-primary",
              )}
            />
            <span className={cn("relative min-w-0 flex-1 truncate", isActive && "font-medium")}>{page.name}</span>
            {badge ? (
              <span className="relative rounded-full bg-primary/15 px-1.5 text-xs font-medium tabular-nums text-primary">
                {badge}
              </span>
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
  const body = section.items.map((id, index) => id === AGENT_LIST_ITEM
    ? <SidebarAgents key={id} streamlined />
    : <NavItem key={id} id={id} index={offset + index} />);
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
