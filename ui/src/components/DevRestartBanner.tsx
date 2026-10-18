import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw, TimerReset } from "lucide-react";
import { healthApi, type DevServerHealthStatus } from "../api/health";
import { Badge } from "@/components/ui/badge";
import { t, useTranslation } from "@/i18n";

const RESTART_PENDING_RESET_MS = 30_000;

function formatRelativeTimestamp(value: string | null): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;

  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 60_000) return t("devRestartBanner.justNow");
  const deltaMinutes = Math.round(deltaMs / 60_000);
  if (deltaMinutes < 60) return t("devRestartBanner.minutesAgo", { count: deltaMinutes });
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return t("devRestartBanner.hoursAgo", { count: deltaHours });
  const deltaDays = Math.round(deltaHours / 24);
  return t("devRestartBanner.daysAgo", { count: deltaDays });
}

function describeReason(devServer: DevServerHealthStatus): string {
  if (devServer.reason === "backend_changes_and_pending_migrations") {
    return t("devRestartBanner.reasonBackendAndMigrations");
  }
  if (devServer.reason === "pending_migrations") {
    return t("devRestartBanner.reasonMigrations");
  }
  return t("devRestartBanner.reasonBackend");
}

export function DevRestartBanner({ devServer }: { devServer?: DevServerHealthStatus }) {
  const { t } = useTranslation();
  const [restartPending, setRestartPending] = useState(false);
  useEffect(() => {
    if (!restartPending) return;
    const timeout = window.setTimeout(() => {
      setRestartPending(false);
    }, RESTART_PENDING_RESET_MS);
    return () => window.clearTimeout(timeout);
  }, [restartPending]);

  if (!devServer?.enabled || !devServer.restartRequired) return null;

  const currentDevServer = devServer;
  const changedAt = formatRelativeTimestamp(devServer.lastChangedAt);
  const sample = devServer.changedPathsSample.slice(0, 3);
  const activeRunLabel = t(
    devServer.activeRunCount === 1 ? "devRestartBanner.liveRunOne" : "devRestartBanner.liveRunOther",
    { count: devServer.activeRunCount },
  );

  async function requestRestartNow() {
    const warning =
      currentDevServer.activeRunCount > 0
        ? t("devRestartBanner.confirmWithRuns", { runs: activeRunLabel })
        : t("devRestartBanner.confirm");
    if (!window.confirm(warning)) return;

    setRestartPending(true);
    try {
      await healthApi.requestDevServerRestart();
    } catch (error) {
      setRestartPending(false);
      window.alert(error instanceof Error ? error.message : t("devRestartBanner.requestFailed"));
    }
  }

  return (
    <div className="border-b border-amber-300/60 bg-muted text-amber-950 dark:border-amber-500/25 dark:bg-muted/10 dark:text-amber-100">
      <div className="flex flex-col gap-3 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-(--tracking-caps)">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{t("devRestartBanner.title")}</span>
            {devServer.autoRestartEnabled ? (
              <Badge variant="ghost" className="bg-muted/10 text-(length:--text-nano) tracking-(--tracking-eyebrow)">
                {t("devRestartBanner.autoRestartOn")}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm">
            {describeReason(devServer)}
            {changedAt ? ` · ${t("devRestartBanner.updated", { time: changedAt })}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-900/80 dark:text-amber-100/75">
            {sample.length > 0 ? (
              <span>
                {t("devRestartBanner.changed")} {sample.join(", ")}
                {devServer.changedPathCount > sample.length
                  ? ` ${t("devRestartBanner.moreCount", { count: devServer.changedPathCount - sample.length })}`
                  : ""}
              </span>
            ) : null}
            {devServer.pendingMigrations.length > 0 ? (
              <span>
                {t("devRestartBanner.pendingMigrations")} {devServer.pendingMigrations.slice(0, 2).join(", ")}
                {devServer.pendingMigrations.length > 2
                  ? ` ${t("devRestartBanner.moreCount", { count: devServer.pendingMigrations.length - 2 })}`
                  : ""}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium md:justify-end">
          {devServer.waitingForIdle ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-muted/10 px-3 py-1.5">
              <TimerReset className="h-3.5 w-3.5" />
              <span>{t("devRestartBanner.waitingFor", { runs: activeRunLabel })}</span>
            </div>
          ) : devServer.autoRestartEnabled ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-muted/10 px-3 py-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t("devRestartBanner.autoRestartIdle")}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-muted/10 px-3 py-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t("devRestartBanner.restartManual")} <code>pnpm dev:once</code> {t("devRestartBanner.afterWork")}</span>
            </div>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-muted dark:text-amber-950 dark:hover:bg-muted"
            onClick={() => {
              void requestRestartNow();
            }}
            disabled={restartPending}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{restartPending ? t("devRestartBanner.restartRequested") : t("devRestartBanner.restartNow")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
