import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND, ink, readable, tint, useMotionTokens } from "./motion";

/** Shared visual parts for the product-map page proposals (Inicio, Decisiones…). */

export const ACCENT = {
  turquoise: BRAND(10, "b"),
  sky: BRAND(7),
  mint: BRAND(8),
  lilac: BRAND(2),
  yellow: BRAND(10),
  risk: "var(--destructive)",
  muted: "var(--muted-foreground)",
} as const;

function initials(name: string) {
  // Letters only, so "Marta (agente de cuentas)" gives "MA", not "M(".
  const parts = name.replace(/\(.*?\)/g, "").split(/\s+/).map((part) => part.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

/** Stable brand gradient per name, like agent capsules. */
export function Avatar({ name, size = "md", ring }: { name: string; size?: "xs" | "sm" | "md" | "lg"; ring?: string }) {
  const index = ([...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 10) + 1;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-semibold",
        size === "xs" && "h-5 w-5 rounded-md text-xs",
        size === "sm" && "h-7 w-7 text-xs",
        size === "md" && "h-10 w-10 text-sm",
        size === "lg" && "h-14 w-14 text-lg",
      )}
      style={{
        background: `linear-gradient(135deg, ${BRAND(index, "a")}, ${BRAND(index, "b")})`,
        color: "white",
        boxShadow: ring ? `0 0 0 2px var(--background), 0 0 0 4px ${ring}` : undefined,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function Pill({ color, children, strong = false }: { color: string; children: ReactNode; strong?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={strong ? { background: color, color: ink(color) } : { background: tint(color, 18), color: readable(color) }}
    >
      {children}
    </span>
  );
}

export function IconTile({ icon: Icon, color, size = "md" }: { icon: LucideIcon; color: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-lg", size === "sm" ? "h-6 w-6" : "h-8 w-8")}
      style={{ background: tint(color, 26), color: readable(color) }}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </span>
  );
}

export function Stat({ label, value, hint, color, icon, index, children }: {
  label: string; value: string; hint?: string; color: string; icon: LucideIcon; index: number; children?: ReactNode;
}) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      className="relative flex flex-col gap-1 overflow-hidden rounded-xl border border-border p-4"
      style={{ background: `linear-gradient(135deg, ${tint(color, 16)}, transparent 70%)` }}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <IconTile icon={icon} color={color} size="sm" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </motion.div>
  );
}

/** Thin progress bar that grows in on mount. */
export function Progress({ value, color }: { value: number; color: string }) {
  const tokens = useMotionTokens();
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: tint(color, 18) }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: tokens.slow, ease: tokens.easeOut }}
      />
    </div>
  );
}

export function SectionTitle({ color, icon: Icon, children, action }: { color: string; icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        <Icon className="h-4 w-4 text-muted-foreground" />
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-background p-4", className)}>{children}</section>;
}
