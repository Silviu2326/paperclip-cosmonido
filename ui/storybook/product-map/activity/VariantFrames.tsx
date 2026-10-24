import type { ReactNode } from "react";
import { ACCENT, Pill } from "../parts";

/**
 * Stacks design variants one under another, each in a scrollable frame with a
 * one-sentence label, so they can be compared in a single screenshot.
 * `transform` makes fixed-position bars (save bar, toasts) stay inside their frame.
 */
export interface VariantFrame {
  id: string;
  title: string;
  /** One sentence: what this design prioritises. */
  summary: string;
  node: ReactNode;
}

const FRAME_COLOR: Record<string, string> = { A: ACCENT.sky, B: ACCENT.mint, C: ACCENT.lilac };

export function VariantFrames({ frames, height = 720 }: { frames: VariantFrame[]; height?: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 sm:p-6">
      {frames.map((frame) => (
        <section key={frame.id} className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Pill color={FRAME_COLOR[frame.id] ?? ACCENT.muted} strong>Variante {frame.id}</Pill>
            <h2 className="text-sm font-semibold">{frame.title}</h2>
            <p className="min-w-0 flex-1 basis-72 text-sm text-muted-foreground">{frame.summary}</p>
          </div>
          <div className="min-w-0 overflow-auto rounded-2xl border border-border bg-background" style={{ height, transform: "translateZ(0)" }}>
            {frame.node}
          </div>
        </section>
      ))}
    </div>
  );
}
