import { useEffect, useState } from "react";
import { readTextPreview, TEXT_PREVIEW_MAX_BYTES } from "@/components/task-side-panel/TaskAttachmentPanel";
import type { PreviewTarget } from "../preview-target";

export type TextContentState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error"; reason: "too-large" | "missing" | "failed"; message: string };

function initialState(target: PreviewTarget): TextContentState {
  if (target.previewText !== null && target.previewText !== undefined) {
    return { status: "ready", text: target.previewText };
  }
  return { status: "loading" };
}

/**
 * Returns the text of a target: inline `previewText` when present, otherwise
 * the bounded text read of `contentPath` (512 KB cap, binary rejected).
 */
export function useTextContent(target: PreviewTarget): TextContentState {
  const { contentPath, previewText, byteSize } = target;
  const [state, setState] = useState<TextContentState>(() => initialState(target));

  useEffect(() => {
    if (previewText !== null && previewText !== undefined) {
      setState({ status: "ready", text: previewText });
      return;
    }
    if (!contentPath) {
      setState({ status: "error", reason: "missing", message: "" });
      return;
    }
    if (byteSize !== null && byteSize > TEXT_PREVIEW_MAX_BYTES) {
      setState({ status: "error", reason: "too-large", message: "" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(contentPath, { signal: controller.signal, credentials: "same-origin" })
      .then(readTextPreview)
      .then((text) => {
        if (!controller.signal.aborted) setState({ status: "ready", text });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setState({ status: "error", reason: "failed", message });
      });
    return () => controller.abort();
  }, [contentPath, previewText, byteSize]);

  return state;
}
