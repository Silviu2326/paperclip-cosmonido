import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { CustomerHealth } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { useMotionTokens } from "@/hooks/useMotionTokens";
import { accentInk, accentReadable, accentTint, brandAccent } from "@/lib/accent";
import { cn } from "@/lib/utils";

export const MINT = brandAccent(8);
export const SKY = brandAccent(7);
export const YELLOW = brandAccent(10);
export const LILAC = brandAccent(2);
export const MUTED = "var(--muted-foreground)";
export const RISK = "var(--destructive)";

export function useHealthMeta() {
  const { t } = useTranslation();
  return (health: CustomerHealth | null): { label: string; color: string } => {
    if (health === "good") return { label: t("uxCrm.list.healthGood", { defaultValue: "Bien" }), color: MINT };
    if (health === "watch") return { label: t("uxCrm.list.healthWatch", { defaultValue: "Vigilar" }), color: YELLOW };
    if (health === "risk") return { label: t("uxCrm.list.healthRisk", { defaultValue: "En riesgo" }), color: RISK };
    return { label: t("uxCrm.list.healthNone", { defaultValue: "Sin valorar" }), color: MUTED };
  };
}

/** Short date in the viewer's own language, e.g. "19 sept 2025". */
export function formatShortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Stable brand gradient per name, like agent capsules. */
export function PartyAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const index = ([...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 10) + 1;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-semibold text-white",
        size === "sm" && "h-7 w-7 text-xs",
        size === "md" && "h-10 w-10 text-sm",
        size === "lg" && "h-14 w-14 text-lg",
      )}
      style={{ background: `linear-gradient(135deg, ${brandAccent(index, "a")}, ${brandAccent(index, "b")})` }}
    >
      {initials(name)}
    </span>
  );
}

export function PanelCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-5", className)}>{children}</section>;
}

export function PanelTitle({ icon: Icon, color, children }: { icon: LucideIcon; color: string; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <Icon className="h-3.5 w-3.5" />
      {children}
    </h3>
  );
}

export function AccentPill({ color, children, strong = false }: { color: string; children: ReactNode; strong?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={strong ? { background: color, color: accentInk(color) } : { background: accentTint(color, 18), color: accentReadable(color) }}
    >
      {children}
    </span>
  );
}

/** Summary card: accent-tinted border and glow, a small colour tab on top, and the unit set apart from the number. */
export function StatCard({ label, value, unit, hint, color, icon: Icon, index, onOpen, openLabel }: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  color: string;
  icon: LucideIcon;
  index: number;
  onOpen?: () => void;
  openLabel?: string;
}) {
  const tokens = useMotionTokens();
  const Card = onOpen ? motion.button : motion.div;
  return (
    <Card
      {...(onOpen ? { type: "button" as const, onClick: onOpen, "aria-label": `${openLabel ?? label}: ${value}${unit ? ` ${unit}` : ""}` } : {})}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left",
        onOpen && "cursor-pointer transition-shadow duration-(--motion-duration-fast) hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      style={{
        borderColor: `color-mix(in oklab, ${color} 30%, var(--border))`,
        background: `radial-gradient(120% 130% at 0% 0%, ${accentTint(color, 13)}, transparent 55%), var(--card)`,
      }}
    >
      <span aria-hidden="true" className="absolute left-4 top-0 h-0.5 w-8 rounded-b-full" style={{ background: color }} />
      <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `linear-gradient(135deg, ${accentTint(color, 34)}, ${accentTint(color, 16)})`, boxShadow: `inset 0 0 0 1px ${accentTint(color, 32)}`, color: accentReadable(color) }}
        >
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </div>
      <p className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
        {unit && value !== "—" ? <span className="text-sm font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {onOpen ? <ArrowUpRight aria-hidden="true" className="absolute right-3.5 top-3.5 h-4 w-4 text-muted-foreground opacity-60 transition-[opacity,transform] duration-(--motion-duration-fast) group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" /> : null}
    </Card>
  );
}
