import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import type { TextContentState } from "./useTextContent";

/** Centered status line for loading, error and empty viewer states. */
export function ViewerMessage({ children, tone = "muted", className }: {
  children: ReactNode;
  tone?: "muted" | "error";
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-1 p-4 text-center text-sm",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DownloadLink({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <a href={href} download className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}>
      <Download aria-hidden />
      {t("artifacts.explorer.preview.download")}
    </a>
  );
}

/** Loading and error states for text-based viewers. Renders nothing once the text is ready. */
export function TextContentStatus({ state, downloadPath }: {
  state: TextContentState;
  downloadPath?: string | null;
}) {
  const { t } = useTranslation();
  if (state.status === "ready") return null;
  if (state.status === "loading") return <ViewerMessage>{t("artifacts.explorer.viewer.loading")}</ViewerMessage>;
  if (state.reason === "too-large") {
    return (
      <ViewerMessage tone="error">
        <span>{t("artifacts.explorer.viewer.tooLarge")}</span>
        {downloadPath ? <DownloadLink href={downloadPath} /> : null}
      </ViewerMessage>
    );
  }
  if (state.reason === "missing") return <ViewerMessage>{t("artifacts.explorer.viewer.unavailable")}</ViewerMessage>;
  return (
    <ViewerMessage tone="error">
      <span>{t("artifacts.explorer.viewer.loadError")}</span>
      {state.message ? <span className="text-xs">{state.message}</span> : null}
    </ViewerMessage>
  );
}
