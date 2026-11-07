import { useState } from "react";
import { FilePreviewModeToggle, type FilePreviewMode } from "@/components/FilePreviewModeToggle";
import { MarkdownBody } from "@/components/MarkdownBody";
import { useTranslation } from "@/i18n";
import type { PreviewTarget } from "../preview-target";
import { TextContentStatus } from "./ViewerMessage";
import { useTextContent } from "./useTextContent";

export function MarkdownViewer({ target }: { target: PreviewTarget }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<FilePreviewMode>("rendered");
  const content = useTextContent(target);
  if (content.status !== "ready") return <TextContentStatus state={content} downloadPath={target.downloadPath} />;
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex justify-end border-b border-border px-2 py-1">
        <FilePreviewModeToggle mode={mode} onChange={setMode} label={t("artifacts.explorer.viewer.mode")} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {mode === "rendered"
          ? <MarkdownBody>{content.text}</MarkdownBody>
          : <pre className="whitespace-pre-wrap break-words font-mono text-xs">{content.text}</pre>}
      </div>
    </div>
  );
}
