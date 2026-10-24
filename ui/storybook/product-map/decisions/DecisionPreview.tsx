import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { readable, tint } from "../motion";
import { ACCENT, Progress } from "../parts";
import { kindOf } from "./DecisionsProposal";
import type { DemoDecision } from "./demo-data";

/** The decision's embedded context (options to pick, items to approve, budget, plain text), shared by the inbox and deck variants. */
export function DecisionPreview({ decision, choice, onChoice }: { decision: DemoDecision; choice: number | null; onChoice: (index: number) => void }) {
  const kind = kindOf(decision);
  const preview = decision.preview;
  if (!preview) return null;
  return (
    <div className="rounded-xl p-3 text-sm" style={{ background: tint(kind.color, 10) }}>
      {preview.kind === "options" ? (
        <div role="radiogroup" aria-label="Opciones" className="flex flex-col gap-1.5">
          {preview.lines.map((line, index) => (
            <button
              key={line}
              role="radio"
              aria-checked={choice === index}
              onClick={() => onChoice(index)}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-(--motion-duration-fast)", choice === index ? "border-transparent font-medium" : "border-border hover:bg-accent/50")}
              style={choice === index ? { background: tint(kind.color, 24), boxShadow: `inset 0 0 0 1.5px ${kind.color}` } : undefined}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current">{choice === index ? <span className="h-2 w-2 rounded-full bg-current" /> : null}</span>
              <span className="min-w-0 break-words">{line}</span>
            </button>
          ))}
        </div>
      ) : preview.kind === "list" ? (
        <ol className="flex flex-col gap-1.5">
          {preview.lines.map((line, index) => (
            <li key={line} className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs font-semibold" style={{ background: tint(kind.color, 30), color: readable(kind.color) }}>{index + 1}</span><span className="min-w-0 break-words">{line}</span></li>
          ))}
        </ol>
      ) : preview.kind === "budget" ? (
        <div className="flex flex-col gap-2">
          <Progress value={96} color={ACCENT.yellow} />
          {preview.lines.map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : (
        preview.lines.map((line) => <p key={line} className="flex items-start gap-2"><Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 break-words">{line}</span></p>)
      )}
    </div>
  );
}
