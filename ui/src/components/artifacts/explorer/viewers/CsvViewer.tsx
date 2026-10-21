import { CsvPreview } from "@/components/CsvPreview";
import type { PreviewTarget } from "../preview-target";
import { TextContentStatus } from "./ViewerMessage";
import { useTextContent } from "./useTextContent";

export function CsvViewer({ target }: { target: PreviewTarget }) {
  const content = useTextContent(target);
  if (content.status !== "ready") return <TextContentStatus state={content} downloadPath={target.downloadPath} />;
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <CsvPreview text={content.text} title={target.title} />
    </div>
  );
}
