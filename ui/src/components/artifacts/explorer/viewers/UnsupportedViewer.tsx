import { File } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import type { PreviewTarget } from "../preview-target";
import { DownloadLink, ViewerMessage } from "./ViewerMessage";

/** Fallback for types without an inline viewer. Offers download and, when known, opening in a new tab. */
export function UnsupportedViewer({ target }: { target: PreviewTarget }) {
  const { t } = useTranslation();
  const openHref = target.openPath ?? null;
  return (
    <ViewerMessage>
      <File aria-hidden className="size-8 text-muted-foreground" />
      <span className="font-medium text-foreground">{t("artifacts.explorer.preview.unsupported")}</span>
      <span className="text-xs">{t("artifacts.explorer.preview.unsupportedHint")}</span>
      <div className="flex flex-wrap justify-center gap-1.5">
        {target.downloadPath ? <DownloadLink href={target.downloadPath} /> : null}
        {openHref ? (
          <a href={openHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}>
            {t("artifacts.explorer.preview.openNewTab")}
          </a>
        ) : null}
      </div>
    </ViewerMessage>
  );
}
