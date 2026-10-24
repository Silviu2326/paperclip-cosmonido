import { useMemo } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Motion durations and curves for `motion/react` animations, read from the
 * `--motion-*` tokens in index.css so every animated surface shares one set of
 * timings. Reduced motion collapses every duration to zero.
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
