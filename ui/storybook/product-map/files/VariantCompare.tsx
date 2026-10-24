import { useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { tint, useMotionTokens } from "../motion";
import { ACCENT } from "../parts";

export interface VariantOption {
  id: string;
  /** Short name shown on the tab. */
  label: string;
  /** One sentence: what this variant prioritises. */
  priority: string;
  render: () => ReactNode;
}

/** Switch between design variants of the same page; each tab states what it prioritises. */
export function VariantCompare({ title, options, initial }: { title: string; options: VariantOption[]; initial?: string }) {
  const tokens = useMotionTokens();
  const [active, setActive] = useState(initial ?? options[0]!.id);
  const current = options.find((option) => option.id === active) ?? options[0]!;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="sticky top-0 z-30 flex flex-col gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
          <LayoutGroup id={`variant-${title}`}>
            <div role="tablist" className="inline-flex flex-wrap rounded-xl border border-border bg-muted/40 p-1">
              {options.map((option) => (
                <button key={option.id} type="button" role="tab" aria-selected={active === option.id} onClick={() => setActive(option.id)} className={cn("relative rounded-lg px-3 py-1 text-sm transition-colors duration-(--motion-duration-fast)", active === option.id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {active === option.id ? <motion.span layoutId="variant-pill" className="absolute inset-0 rounded-lg bg-background shadow-sm" transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                  <span className="relative">{option.label}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
        </div>
        <p className="rounded-lg px-3 py-1.5 text-sm" style={{ background: tint(ACCENT.lilac, 14) }}><strong>Prioriza:</strong> {current.priority}</p>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={current.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }}>
          {current.render()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
