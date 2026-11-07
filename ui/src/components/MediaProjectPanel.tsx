import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { mediaStudioApi } from "@/api/media-studio";
import type { MediaOperation } from "@paperclipai/shared";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { MediaProductionStatus, mediaProjectKey } from "@/components/MediaProductionStatus";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function describeOperation(operation: MediaOperation, t: TFunction): string {
  switch (operation.type) {
    case "cut_ranges": return t("media.operation.cuts", { defaultValue: "Eliminar {{count}} rangos de tiempo", count: operation.ranges.length });
    case "remove_silences": return t("media.operation.silences", { defaultValue: "Eliminar silencios por debajo de {{threshold}} dB, desde {{duration}} ms", threshold: operation.thresholdDb, duration: operation.minDurationMs });
    case "remove_fillers": return t("media.operation.fillers", { defaultValue: "Eliminar muletillas: {{words}}", words: operation.words.join(", ") });
    case "burn_subtitles": return t("media.operation.subtitles", { defaultValue: "Incrustar subtítulos de {{size}} puntos", size: operation.style.size });
    case "export": return t("media.operation.export", { defaultValue: "Exportar a {{aspect}} con recorte centrado", aspect: operation.aspect });
    case "replace_audio": return t("media.operation.audio", { defaultValue: "Reemplazar la pista de audio" });
    case "stop_motion": return t("media.operation.stopMotion", { defaultValue: "Stop motion: {{seconds}} s por fotograma, cámara {{motion}}", seconds: operation.frameDurationSeconds, motion: operation.cameraMotion });
    case "voiceover": return t("media.operation.voiceover", { defaultValue: "Voz en off con atenuación de {{ducking}} dB", ducking: operation.duckingDb });
    case "dub_multivoice": return t("media.operation.multivoice", { defaultValue: "Doblaje multivoz en {{language}}", language: operation.language });
  }
}

export function MediaProjectPanel({ companyId, assetId, projectId: initialProjectId, companyFileId }: { companyId: string; assetId?: string; projectId?: string; companyFileId?: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const project = useMutation({
    mutationFn: () => mediaStudioApi.create(companyId, { assetId, companyFileId }),
    onSuccess: row => { setCreatedId(row.id); client.setQueryData(mediaProjectKey(row.id), { ...row, jobs: [], transcript: null }); },
  });
  const id = initialProjectId ?? createdId ?? "";
  if (!id) return <>
    <Button size="sm" onClick={() => project.mutate()} disabled={project.isPending || (!assetId && !companyFileId)}>
      {t("media.createProject", { defaultValue: "Crear proyecto de medios" })}
    </Button>
    {project.error && <p className="text-sm text-destructive">{project.error.message}</p>}
  </>;
  return <section className="flex flex-col gap-3" aria-label={t("media.title", { defaultValue: "Estudio de medios" })}>
    <h3 className="font-medium">{t("media.title", { defaultValue: "Estudio de medios" })}</h3>
    <MediaProductionStatus projectId={id}>
      {data => <Tabs defaultValue="transcript" className="w-full">
        <TabsList>
          <TabsTrigger value="transcript">{t("media.transcript", { defaultValue: "Transcripción" })}</TabsTrigger>
          <TabsTrigger value="operations">{t("media.operations", { defaultValue: "Operaciones aplicadas" })}</TabsTrigger>
        </TabsList>
        <TabsContent value="transcript" className="flex flex-col gap-2">
          {data?.transcript ? <>
            <p className="text-xs text-muted-foreground">
              {[data.transcript.language, data.transcript.duration !== null ? `${data.transcript.duration.toFixed(1)} s` : null].filter(Boolean).join(" · ")}
            </p>
            <p className="whitespace-pre-wrap text-sm">{data.transcript.text || t("media.emptyTranscript", { defaultValue: "La transcripción está vacía." })}</p>
            {data.transcript.words.length > 0 && <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{t("media.wordTiming", { defaultValue: "Marcas por palabra" })}</summary>
              <ol className="mt-2 flex flex-col gap-1">
                {data.transcript.words.slice(0, 300).map((word, index) => <li key={`${word.start}-${index}`} className="flex gap-3">
                  <span className="text-muted-foreground">{word.start.toFixed(2)}–{word.end.toFixed(2)} s</span><span>{word.text}</span>
                </li>)}
              </ol>
              {data.transcript.words.length > 300 && <p className="mt-2 text-xs text-muted-foreground">{t("media.wordLimit", { defaultValue: "Se muestran las primeras 300 palabras." })}</p>}
            </details>}
          </> : <p className="text-sm text-muted-foreground">{t("media.noTranscript", { defaultValue: "Inicia la transcripción para generarla." })}</p>}
        </TabsContent>
        <TabsContent value="operations">
          {data?.operations.length ? <ol className="flex flex-col gap-2">
            {data.operations.map((operation, index) => <li key={`${operation.type}-${index}`} className="flex gap-2 text-sm">
              <span className="text-muted-foreground">{index + 1}.</span><span>{describeOperation(operation, t)}</span>
            </li>)}
          </ol> : <p className="text-sm text-muted-foreground">{t("media.noOperations", { defaultValue: "Todavía no se han aplicado operaciones." })}</p>}
        </TabsContent>
      </Tabs>}
    </MediaProductionStatus>
  </section>;
}
