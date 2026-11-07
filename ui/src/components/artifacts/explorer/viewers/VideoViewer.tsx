import { OutputVideoPlayer } from "@/components/issue-output/OutputVideoPlayer";
import { useTranslation } from "@/i18n";
import type { PreviewTarget } from "../preview-target";
import { ViewerMessage } from "./ViewerMessage";

export function VideoViewer({ target }: { target: PreviewTarget }) {
  const { t } = useTranslation();
  if (!target.contentPath) return <ViewerMessage>{t("artifacts.explorer.viewer.unavailable")}</ViewerMessage>;
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center bg-muted p-2">
      <OutputVideoPlayer src={target.contentPath} title={target.title} className="max-h-full" />
    </div>
  );
}
