/**
 * Motion and colour helpers shared by the product-map proposals. Timings and
 * curves come from the motion tokens in ui/src (motion-tokens.css /
 * index.css), so "reduce motion" collapses them to zero.
 */

export { useMotionTokens } from "@/hooks/useMotionTokens";

/** Mixes an accent into the current surface so tints read in light and dark themes. */
export const tint = (color: string, percent: number) => `color-mix(in oklab, ${color} ${percent}%, transparent)`;
/** Dark ink tinted with the accent, readable on the light brand accents. */
export const ink = (color: string) => `color-mix(in oklab, ${color} 25%, black)`;
/** Accent pulled toward the text colour: readable on the page in both themes. */
export const readable = (color: string) => `color-mix(in oklab, ${color} 65%, var(--foreground))`;

/** Brand agent palette (same in light and dark), indexed 1–10. */
export const BRAND = (index: number, tone: "a" | "b" = "a") => `var(--agent-${index}${tone})`;
