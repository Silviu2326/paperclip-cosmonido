import type { SVGProps } from "react";
import { cn } from "../lib/utils";
import { useTranslation } from "@/i18n";

export function AnimatedRobotIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("robot-loading-icon", className)}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <g className="robot-loading-body">
        <path d="M16 8 V4" />
        <circle className="robot-loading-antenna" cx="16" cy="3" r="1.5" fill="currentColor" />
        <rect x="6" y="8" width="20" height="16" rx="4" />
        <path d="M3 14 v4 M29 14 v4" />
        <ellipse className="robot-loading-eye" cx="12" cy="15" rx="1.6" ry="2" fill="currentColor" stroke="none" />
        <ellipse className="robot-loading-eye" cx="20" cy="15" rx="1.6" ry="2" fill="currentColor" stroke="none" />
        <path d="M12 20.5 h8" />
        <path d="M11 24 v3 M21 24 v3" />
      </g>
      <ellipse className="robot-loading-shadow" cx="16" cy="30" rx="7" ry="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Full-page loading state: a large, centered, gray animated robot. */
export function RobotLoading({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={cn("flex min-h-dvh w-full items-center justify-center", className)}
    >
      <AnimatedRobotIcon className="h-24 w-24 text-muted-foreground" />
      <span className="sr-only">{t("animatedPaperclipIcon.loading")}</span>
    </div>
  );
}
