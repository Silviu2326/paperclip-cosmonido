const defaultPipelineStageColumnTone = {
  outer: "border-border bg-background",
  header: "border-border text-muted-foreground",
  meta: "border-border",
  body: "",
  bodyOver: "bg-accent/40",
};

export const pipelineStageColumnTones: Record<string, typeof defaultPipelineStageColumnTone> = {
  review: {
    outer: "border-violet-500/25 bg-secondary/50 dark:bg-secondary/15",
    header: "border-violet-500/15 text-violet-700 dark:text-violet-300",
    meta: "border-violet-500/15",
    body: "bg-secondary/30 dark:bg-secondary/10",
    bodyOver: "bg-secondary/65 dark:bg-secondary/30",
  },
  in_review: {
    outer: "border-violet-500/25 bg-secondary/50 dark:bg-secondary/15",
    header: "border-violet-500/15 text-violet-700 dark:text-violet-300",
    meta: "border-violet-500/15",
    body: "bg-secondary/30 dark:bg-secondary/10",
    bodyOver: "bg-secondary/65 dark:bg-secondary/30",
  },
  done: {
    outer: "border-green-500/25 bg-accent/50 dark:bg-accent/15",
    header: "border-green-500/15 text-green-700 dark:text-green-300",
    meta: "border-green-500/15",
    body: "bg-accent/30 dark:bg-accent/10",
    bodyOver: "bg-accent/65 dark:bg-accent/30",
  },
  cancelled: {
    outer: "border-border/70 bg-muted/25 opacity-85 dark:bg-card/20",
    header: "border-border/70 text-muted-foreground/80",
    meta: "border-border/70",
    body: "bg-muted/20",
    bodyOver: "bg-muted/45",
  },
};

export function getPipelineStageColumnTone(kind: string | null | undefined) {
  return pipelineStageColumnTones[kind?.trim().toLowerCase() ?? ""] ?? defaultPipelineStageColumnTone;
}

export function pipelineStageAutomationSettingsHref(pipelineId: string, stageId: string) {
  return `/pipelines/${pipelineId}/settings?stage=${stageId}&section=instructions`;
}
