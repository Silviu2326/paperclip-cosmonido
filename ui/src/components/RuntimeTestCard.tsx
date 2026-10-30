import {
  CircleCheck,
  CircleAlert,
  Loader2,
  Play,
  ChevronRight,
} from "lucide-react";
import type { AdapterEnvironmentTestResult } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
export type TestState = "idle" | "running" | "pass" | "fail";

const copy = {
  idle: {
    title: t("runtimeTestCard.idle.title"),
    description: t("runtimeTestCard.idle.description"),
    action: t("runtimeTestCard.idle.action"),
  },
  running: {
    title: t("runtimeTestCard.running.title"),
    description: t("runtimeTestCard.running.description"),
    action: t("runtimeTestCard.running.action"),
  },
  pass: {
    title: t("runtimeTestCard.pass.title"),
    description: t("runtimeTestCard.pass.description"),
    action: t("runtimeTestCard.again"),
  },
  warn: {
    title: t("runtimeTestCard.warn.title"),
    description: t("runtimeTestCard.warn.description"),
    action: t("runtimeTestCard.again"),
  },
  fail: {
    title: t("runtimeTestCard.fail.title"),
    description: t("runtimeTestCard.fail.description"),
    action: t("runtimeTestCard.fail.action"),
  },
} as const;

const prerequisiteCopy = {
  idle: { title: t("runtimeTestCard.prereq.idle.title"), description: t("runtimeTestCard.prereq.idle.description"), action: t("runtimeTestCard.prereq.idle.action") },
  running: { title: t("runtimeTestCard.prereq.running.title"), description: t("runtimeTestCard.prereq.running.description"), action: t("runtimeTestCard.prereq.running.action") },
  pass: { title: t("runtimeTestCard.prereq.pass.title"), description: t("runtimeTestCard.prereq.pass.description"), action: t("runtimeTestCard.prereq.again") },
  warn: { title: t("runtimeTestCard.prereq.warn.title"), description: t("runtimeTestCard.prereq.warn.description"), action: t("runtimeTestCard.prereq.again") },
  fail: { title: t("runtimeTestCard.prereq.fail.title"), description: t("runtimeTestCard.prereq.fail.description"), action: t("runtimeTestCard.prereq.fail.action") },
} as const;

export function RuntimeTestCard({
  state,
  result,
  error,
  onTest,
  disabled = false,
  variant = "connection",
}: {
  state: TestState | "warn";
  result: AdapterEnvironmentTestResult | null;
  error?: string | null;
  onTest: () => void;
  disabled?: boolean;
  variant?: "connection" | "prerequisites";
}) {
  const missingCodeSandbox = result?.checks.some(check => check.code === "codex_code_sandbox_unavailable");
  const missingRuntime = state === "fail"
    ? result?.checks.find(check => check.code === "acpx_runtime_package_missing")
    : undefined;
  const content = missingRuntime
    ? { ...copy.fail, title: t("runtimeTestCard.runtimeMissing"), description: missingRuntime.message }
    : (variant === "prerequisites" ? prerequisiteCopy : copy)[state];
  const Icon =
    state === "running"
      ? Loader2
      : state === "pass"
        ? CircleCheck
        : state === "fail" || state === "warn"
          ? CircleAlert
          : Play;
  return (
    <section
      aria-label={t("runtimeTestCard.ariaLabel")}
      className="rounded-lg border border-border bg-card"
    >
      <div className="flex items-start gap-3 p-4 sm:items-center">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted",
            state === "pass"
              ? "text-green-600 dark:text-green-400"
              : state === "fail"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          <Icon
            className={cn(
              "size-4",
              state === "running" && "animate-spin motion-reduce:animate-none",
            )}
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role={state === "fail" ? "alert" : "status"}
            aria-atomic="true"
            className="min-w-0 space-y-1"
          >
            <h3 className="text-sm font-medium">{content.title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {missingCodeSandbox ? t("agentWorkPermissions.sandboxUnavailable") : state === "fail" && error ? error : content.description}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 self-start sm:self-center"
            disabled={disabled || state === "running"}
            onClick={onTest}
          >
            {content.action}
          </Button>
        </div>
      </div>
      {result && result.checks.length > 0 && (
        <details
          key={`${state}:${result.testedAt}`}
          className="group border-t border-border"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight
              aria-hidden="true"
              className="size-3 transition-transform group-open:rotate-90"
            />
            {t("runtimeTestCard.details")}
          </summary>
          <ul className="space-y-3 px-4 pb-4">
            {result.checks.map((check) => (
              <li
                key={check.code}
                className="flex gap-2 text-xs leading-relaxed"
              >
                {check.level === "error" || check.level === "warn" ? (
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-destructive"
                  />
                ) : (
                  <CircleCheck
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="break-words text-foreground">{check.code === "codex_code_sandbox_unavailable" ? t("agentWorkPermissions.sandboxUnavailable") : check.message}</p>
                  {check.detail && (
                    <p className="break-all text-muted-foreground">
                      {check.detail}
                    </p>
                  )}
                  {check.hint && (
                    <p className="text-muted-foreground">{check.hint}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
