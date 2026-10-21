import { useMemo } from "react";
import type { PreviewTarget } from "../preview-target";
import { TextContentStatus } from "./ViewerMessage";
import { useTextContent } from "./useTextContent";

export function TextViewer({ target }: { target: PreviewTarget }) {
  const content = useTextContent(target);
  const lines = useMemo(
    () => (content.status === "ready" ? content.text.split("\n").map((line) => line.replace(/\r$/, "")) : []),
    [content],
  );
  if (content.status !== "ready") return <TextContentStatus state={content} downloadPath={target.downloadPath} />;
  return (
    <div className="h-full min-h-0 w-full overflow-auto bg-background py-2 font-mono text-xs">
      {lines.map((line, index) => (
        <div key={index} className="flex">
          <span className="w-12 shrink-0 select-none pr-3 text-right text-muted-foreground">{index + 1}</span>
          <span className="whitespace-pre-wrap break-all pr-3">{line}</span>
        </div>
      ))}
    </div>
  );
}
