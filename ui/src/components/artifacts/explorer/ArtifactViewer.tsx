import type { PreviewKind, PreviewTarget } from "./preview-target";
import { previewKindFor } from "./preview-target";
import { CsvViewer } from "./viewers/CsvViewer";
import { HtmlViewer } from "./viewers/HtmlViewer";
import { ImageViewer } from "./viewers/ImageViewer";
import { JsonViewer } from "./viewers/JsonViewer";
import { MarkdownViewer } from "./viewers/MarkdownViewer";
import { PdfViewer } from "./viewers/PdfViewer";
import { SheetViewer } from "./viewers/SheetViewer";
import { TextViewer } from "./viewers/TextViewer";
import { UnsupportedViewer } from "./viewers/UnsupportedViewer";
import { VideoViewer } from "./viewers/VideoViewer";

/** Picks the viewer for a target. Fills its parent, so the parent must set a height. */
export function ArtifactViewer({
  target,
  kind,
  mode = "pane",
}: {
  target: PreviewTarget;
  kind?: PreviewKind;
  /** `fullscreen` enables every page and search in the PDF viewer. */
  mode?: "pane" | "fullscreen";
}) {
  const resolved = kind ?? previewKindFor(target.contentType, target.title);
  switch (resolved) {
    case "image":
      return <ImageViewer target={target} />;
    case "video":
      return <VideoViewer target={target} />;
    case "pdf":
      return <PdfViewer target={target} mode={mode} />;
    case "markdown":
      return <MarkdownViewer target={target} />;
    case "html":
      return <HtmlViewer target={target} />;
    case "csv":
      return <CsvViewer target={target} />;
    case "sheet":
      return <SheetViewer target={target} />;
    case "json":
      return <JsonViewer target={target} />;
    case "text":
      return <TextViewer target={target} />;
    case "pr":
    case "unsupported":
      return <UnsupportedViewer target={target} />;
  }
}
