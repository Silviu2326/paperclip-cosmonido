import { Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import { ArtifactViewer } from "./ArtifactViewer";
import type { PreviewTarget } from "./preview-target";

interface ArtifactFullscreenDialogProps {
  target: PreviewTarget | null;
  onClose: () => void;
}

/** Shows the same viewer as the preview pane, large, with a download button. */
export function ArtifactFullscreenDialog({ target, onClose }: ArtifactFullscreenDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-(--sz-85vh) max-h-(--sz-85vh) w-(--pct-90) max-w-(--pct-90) flex-col gap-0 p-0 sm:max-w-(--pct-90)">
        {target ? (
          <>
            <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-4 py-3 pr-12">
              <div className="min-w-0">
                <DialogTitle className="truncate text-sm font-semibold">{target.title}</DialogTitle>
                <DialogDescription className="sr-only">{t("artifacts.explorer.preview.fullscreenTitle")}</DialogDescription>
              </div>
              {target.downloadPath ? (
                <a href={target.downloadPath} download className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
                  <Download aria-hidden />
                  {t("artifacts.explorer.preview.download")}
                </a>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  <Download aria-hidden />
                  {t("artifacts.explorer.preview.download")}
                </Button>
              )}
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col">
              <ArtifactViewer key={target.id} target={target} mode="fullscreen" />
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
