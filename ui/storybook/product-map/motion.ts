import { useMemo } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Motion and colour helpers shared by the product-map proposals. Timings and
 * curves come from the motion tokens in ui/src (motion-tokens.css /
 * index.css), so "reduce motion" collapses them to zero.
 */

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

export function useMotionTokens() {
  const reduced = useReducedMotion();
  return useMemo(() => {
    const zero = reduced === true;
    return {
      fast: zero ? 0 : seconds("--motion-duration-fast", 160),
      base: zero ? 0 : seconds("--motion-duration-base", 240),
      slow: zero ? 0 : seconds("--motion-duration-slow", 360),
      stagger: zero ? 0 : seconds("--motion-plan-entry-stagger", 40),
      easeOut: bezier("--motion-ease-out-expo"),
      standard: bezier("--motion-ease-standard"),
    };
  }, [reduced]);
}

/** Mixes an accent into the current surface so tints read in light and dark themes. */
export const tint = (color: string, percent: number) => `color-mix(in oklab, ${color} ${percent}%, transparent)`;
/** Dark ink tinted with the accent, readable on the light brand accents. */
export const ink = (color: string) => `color-mix(in oklab, ${color} 25%, black)`;
/** Accent pulled toward the text colour: readable on the page in both themes. */
export const readable = (color: string) => `color-mix(in oklab, ${color} 65%, var(--foreground))`;

/** Brand agent palette (same in light and dark), indexed 1–10. */
export const BRAND = (index: number, tone: "a" | "b" = "a") => `var(--agent-${index}${tone})`;
