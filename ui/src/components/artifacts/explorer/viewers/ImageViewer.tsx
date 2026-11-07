import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import type { PreviewTarget } from "../preview-target";
import { ViewerMessage } from "./ViewerMessage";

export function ImageViewer({ target }: { target: PreviewTarget }) {
  const { t } = useTranslation();
  const [fit, setFit] = useState(true);
  if (!target.contentPath) return <ViewerMessage>{t("artifacts.explorer.viewer.unavailable")}</ViewerMessage>;
  return (
    <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-auto bg-muted">
      <img
        src={target.contentPath}
        alt={target.title}
        loading="lazy"
        className={cn(fit ? "max-h-full max-w-full object-contain" : "max-w-none")}
      />
      <div className="absolute right-1.5 bottom-1.5">
        <Button type="button" variant="outline" size="xs" aria-pressed={!fit} onClick={() => setFit((value) => !value)}>
          {fit ? t("artifacts.explorer.viewer.zoomActual") : t("artifacts.explorer.viewer.zoomFit")}
        </Button>
      </div>
    </div>
  );
}
