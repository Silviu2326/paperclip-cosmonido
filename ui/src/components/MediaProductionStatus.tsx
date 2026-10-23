import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { mediaPresetsApi } from "@/api/media-presets";
import { mediaStudioApi, type MediaProject } from "@/api/media-studio";

/** What a template asks of the production: whether subtitles need a transcript first, and the output shape. */
export type MediaProductionTemplate = { transcriptRequired: boolean; outputAspect: "9:16" | "16:9" };

export const mediaProjectKey = (projectId: string) => ["media-project", projectId] as const;

/** Polls only while a job is queued or running, so a finished project stops generating requests. */
export function mediaProjectRefetchInterval(project: Pick<MediaProject, "jobs"> | undefined) {
  return project?.jobs.some((job) => job.status === "queued" || job.status === "running") ? 3000 : false;
}

/**
 * The one production-status view for a Media Studio project: job list with errors and output, transcript state and the
 * transcribe/render actions. With a `template` the actions follow its rules (subtitles need a transcript, render uses
 * its aspect); without one both actions are always offered. `children` receives the project for extra detail tabs.
 */
export function MediaProductionStatus({ projectId, template, children }: {
  projectId: string;
  template?: MediaProductionTemplate;
  children?: (project: MediaProject | undefined) => ReactNode;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: mediaProjectKey(projectId),
    queryFn: () => mediaStudioApi.get(projectId),
    refetchInterval: (state) => mediaProjectRefetchInterval(state.state.data),
  });
  const refresh = () => client.invalidateQueries({ queryKey: mediaProjectKey(projectId) });
  const transcribe = useMutation({
    mutationFn: () => mediaStudioApi.transcribe(projectId, template ? crypto.randomUUID() : `transcribe:${projectId}`),
    onSuccess: refresh,
  });
  const render = useMutation({
    mutationFn: () => template
      ? mediaPresetsApi.renderWithAspect(projectId, crypto.randomUUID(), template.outputAspect)
      : mediaStudioApi.render(projectId, `render:${projectId}:${crypto.randomUUID()}`),
    onSuccess: refresh,
  });
  const project = query.data;
  const jobs = project?.jobs ?? [];
  const transcribing = jobs.some((job) => job.kind === "transcribe" && (job.status === "queued" || job.status === "running"));
  const activeRender = [...jobs].reverse().find((job) => job.kind === "render");
  const hasTranscript = Boolean(project?.transcript);
  const busy = transcribe.isPending || render.isPending;
  const needsTranscript = template?.transcriptRequired === true;
  const showTranscribe = !template || (needsTranscript && !hasTranscript);
  const showRender = !template || (needsTranscript && hasTranscript && (!activeRender || activeRender.status === "failed"));

  if (query.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("media.loading", { defaultValue: "Cargando proyecto…" })}</p>;
  if (query.error) return <p role="alert" className="text-sm text-destructive">{query.error.message}</p>;
  return (
    <div className="flex flex-col gap-3">
      {template ? (
        <p className="text-sm">{project?.transcript
          ? t("mediaTemplates.secondsIndexed", { defaultValue: "{{seconds}} segundos indexados", seconds: Math.ceil(project.transcript.duration ?? 0) })
          : t("mediaTemplates.waitingTranscript", { defaultValue: "Esperando la transcripción" })}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {jobs.map((job) => (
          <div key={job.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge>
            <span>{job.kind}</span>
            {job.error ? <span className="text-destructive">{job.error}</span> : null}
            {job.status === "done" && job.outputAssetId ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/assets/${job.outputAssetId}/content`} target="_blank" rel="noreferrer">{t("mediaTemplates.openOutput", { defaultValue: "Abrir resultado" })}</a>
              </Button>
            ) : null}
          </div>
        ))}
        {jobs.length === 0 ? <p className="text-sm text-muted-foreground">{t("media.noJobs", { defaultValue: "Todavía no hay trabajos." })}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showTranscribe ? (
          <Button size="sm" variant="outline" disabled={busy || transcribing} onClick={() => transcribe.mutate()}>
            {template
              ? (transcribe.isPending ? t("mediaTemplates.queueingTranscription", { defaultValue: "Encolando transcripción…" }) : t("mediaTemplates.transcribe", { defaultValue: "Transcribir (puede usar un proveedor de pago)" }))
              : t("media.transcribe", { defaultValue: "Transcribir" })}
          </Button>
        ) : null}
        {showRender ? (
          <Button size="sm" disabled={busy} onClick={() => render.mutate()}>
            {template
              ? (render.isPending ? t("mediaTemplates.queueingRender", { defaultValue: "Encolando renderización…" }) : t("mediaTemplates.renderSubtitles", { defaultValue: "Renderizar con subtítulos" }))
              : t("media.render", { defaultValue: "Renderizar" })}
          </Button>
        ) : null}
      </div>
      {transcribe.error || render.error ? <p role="alert" className="text-sm text-destructive">{(transcribe.error ?? render.error)?.message}</p> : null}
      {children?.(project)}
    </div>
  );
}
