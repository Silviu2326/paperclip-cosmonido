/**
 * Accent helpers for coloured navigation. Accents come from the brand agent
 * palette (`--agent-Na` / `--agent-Nb`, identical in light and dark); these
 * mixes keep tints and text readable on both themes.
 */

/** Brand agent palette, indexed 1–10. */
export const brandAccent = (index: number, tone: "a" | "b" = "a") => `var(--agent-${index}${tone})`;

/** Mixes an accent into the current surface. */
export const accentTint = (color: string, percent: number) =>
  `color-mix(in oklab, ${color} ${percent}%, transparent)`;

/** Dark ink tinted with the accent, readable on the light brand accents. */
export const accentInk = (color: string) => `color-mix(in oklab, ${color} 25%, black)`;

/** Accent pulled toward the text colour: readable on the page in both themes. */
export const accentReadable = (color: string) => `color-mix(in oklab, ${color} 65%, var(--foreground))`;

/** Sidebar section accents, shared by the nav groups. */
export const SIDEBAR_ACCENTS = {
  home: brandAccent(10, "b"),
  work: brandAccent(7),
  business: brandAccent(8),
  admin: brandAccent(2),
} as const;
