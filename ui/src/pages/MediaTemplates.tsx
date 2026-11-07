import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { useTranslation } from "@/i18n";
import { useLocation } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { companyFilesApi, type CompanyFile } from "../api/company-files";
import { mediaPresetsApi } from "../api/media-presets";
import { mediaStudioApi } from "../api/media-studio";
import { MediaProductionStatus, mediaProjectKey } from "@/components/MediaProductionStatus";
import { BUILT_IN_MEDIA_TEMPLATES, type MediaPreset } from "@paperclipai/shared/productization/media-presets";

// Shared template notes are English data; these map the known ones to message keys.
const TEMPLATE_NOTE_KEYS: Record<string, string> = {
  "Use a company file containing video the operator is authorized to process.": "mediaTemplates.notes.authorizedVideo",
  "Transcribe this source in Media Studio before rendering subtitles.": "mediaTemplates.notes.transcribeFirst",
};

export function isUsableCompanyFile(file: Pick<CompanyFile, "audienceKind" | "validUntil">, now = Date.now()) {
  if (file.audienceKind !== "company") return false;
  if (!file.validUntil) return true;
  const expiresAt = new Date(file.validUntil).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function readyCompanyVideos(files: CompanyFile[], now = Date.now()) {
  return files.filter((file) => isUsableCompanyFile(file, now) && file.contentType.startsWith("video/"));
}

function isBuiltInPreset(presetKey: string) {
  return BUILT_IN_MEDIA_TEMPLATES.some((candidate) => candidate.presetKey === presetKey);
}

export function MediaTemplates() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [sourceFileId, setSourceFileId] = useState(() => new URLSearchParams(location.search).get("sourceFileId") ?? "");
  const [selectedPresetId, setSelectedPresetId] = useState("clip");
  const [logoFileId, setLogoFileId] = useState("");
  const [voiceFileId, setVoiceFileId] = useState("");
  const [musicFileId, setMusicFileId] = useState("");
  const [musicLicenseReferenceUrl, setMusicLicenseReferenceUrl] = useState("");
  const [projectId, setProjectId] = useState("");
  const files = useQuery({ queryKey: ["media-template-source-files", selectedCompanyId], queryFn: () => companyFilesApi.list(selectedCompanyId!, { scope: "all" }), enabled: Boolean(selectedCompanyId) });
  const presets = useQuery({ queryKey: ["media-presets", selectedCompanyId], queryFn: () => mediaPresetsApi.list(selectedCompanyId!), enabled: Boolean(selectedCompanyId) });
  const metrics = useQuery({ queryKey: ["media-presets-metrics", selectedCompanyId, 30], queryFn: () => mediaPresetsApi.metrics(selectedCompanyId!, 30), enabled: Boolean(selectedCompanyId) });
  const sourceOptions = readyCompanyVideos(files.data?.files ?? []);
  const companyFiles = (files.data?.files ?? []).filter((file) => isUsableCompanyFile(file));
  useEffect(() => {
    if (files.isSuccess && sourceFileId && !readyCompanyVideos(files.data?.files ?? []).some(file => file.id === sourceFileId)) {
      setSourceFileId("");
    }
  }, [files.data, files.isSuccess, sourceFileId]);
  const imageFiles = companyFiles.filter((file) => file.contentType.startsWith("image/"));
  const audioFiles = companyFiles.filter((file) => file.contentType.startsWith("audio/"));
  const savedPreset = (presets.data ?? []).find((preset) => preset.id === selectedPresetId);
  const template = savedPreset ?? BUILT_IN_MEDIA_TEMPLATES.find((candidate) => candidate.presetKey === selectedPresetId) ?? BUILT_IN_MEDIA_TEMPLATES[0]!;
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: mediaProjectKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: ["media-presets-metrics", selectedCompanyId] }),
    ]);
  };
  const start = useMutation({
    mutationFn: async () => {
      const sourceFile = sourceOptions.find((file) => file.id === sourceFileId);
      if (!sourceFile || !selectedCompanyId) throw new Error(t("mediaTemplates.errors.chooseVideo", { defaultValue: "Elige primero un vídeo disponible de la empresa" }));
      const project = await mediaStudioApi.create(selectedCompanyId, { companyFileId: sourceFile.id });
      setProjectId(project.id);
      await mediaStudioApi.operations(project.id, template.operations);
      if (template.inputCriteria.transcriptRequired) return { projectId: project.id, status: "transcript_required" as const };
      const job = await mediaPresetsApi.renderWithAspect(project.id, crypto.randomUUID(), template.outputAspect);
      return { projectId: project.id, status: job.status };
    },
    onSuccess: invalidate,
  });
  const saveVersion = useMutation({
    mutationFn: async () => {
      const filesById = new Map(companyFiles.map((file) => [file.id, file]));
      const resolveAsset = async (fileId: string) => {
        const file = filesById.get(fileId);
        if (!file?.currentVersionId) throw new Error(t("mediaTemplates.errors.chooseVersion", { defaultValue: "Elige un archivo de la empresa con una versión actual" }));
        const versions = await companyFilesApi.versions(file.id);
        const version = versions.find((item) => item.id === file.currentVersionId);
        if (!version) throw new Error(t("mediaTemplates.errors.versionUnavailable", { defaultValue: "La versión del archivo de la empresa seleccionada no está disponible" }));
        return version.assetId;
      };
      const [logoAssetId, voiceAssetId, musicAssetId] = await Promise.all([
        logoFileId ? resolveAsset(logoFileId) : Promise.resolve(null),
        voiceFileId ? resolveAsset(voiceFileId) : Promise.resolve(null),
        musicFileId ? resolveAsset(musicFileId) : Promise.resolve(null),
      ]);
      return mediaPresetsApi.createVersion(selectedCompanyId!, {
        presetKey: template.presetKey,
        kind: template.kind,
        outputAspect: template.outputAspect,
        name: template.name,
        description: template.description,
        inputCriteria: template.inputCriteria,
        operations: template.operations,
        brandReferences: { ...template.brandReferences, logoAssetId, voiceAssetId, musicAssetId, musicLicenseReferenceUrl: musicLicenseReferenceUrl.trim() || null },
      });
    },
    onSuccess: async (created) => {
      setSelectedPresetId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["media-presets", selectedCompanyId] });
    },
  });

  // Built-in names and descriptions are localized by key; saved versions keep their stored text.
  function presetName<T extends { presetKey: string; name: string }>(preset: T) {
    return isBuiltInPreset(preset.presetKey)
      ? t(`mediaTemplates.presets.${preset.presetKey}.name`, { defaultValue: preset.name })
      : preset.name;
  }
  function presetDescription<T extends { presetKey: string; description?: string | null }>(preset: T) {
    return isBuiltInPreset(preset.presetKey) && preset.description
      ? t(`mediaTemplates.presets.${preset.presetKey}.description`, { defaultValue: preset.description })
      : preset.description;
  }
  function noteText(note: string) {
    const key = TEMPLATE_NOTE_KEYS[note];
    return key ? t(key, { defaultValue: note }) : note;
  }
  function operationLabel(type: string) {
    return t(`mediaTemplates.operations.${type}`, { defaultValue: type.replaceAll("_", " ") });
  }

  if (!selectedCompanyId) return <p className="text-sm text-muted-foreground">{t("mediaTemplates.noCompany", { defaultValue: "Selecciona una empresa para abrir las plantillas de vídeo." })}</p>;
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold">{t("mediaTemplates.title", { defaultValue: "Plantillas de vídeo" })}</h1><p className="text-sm text-muted-foreground">{t("mediaTemplates.headerDescription", { defaultValue: "Elige un vídeo de la empresa y una receta de edición repetible. El procesamiento se ejecuta en Media Studio con su presupuesto, credenciales y cola de trabajos existentes." })}</p></header>
      <div className="grid gap-4 lg:grid-cols-(--media-template-columns)">
        <Card><CardHeader><CardTitle>{t("mediaTemplates.startTitle", { defaultValue: "Iniciar un vídeo" })}</CardTitle><CardDescription>{t("mediaTemplates.startDescription", { defaultValue: "Las plantillas crean un proyecto de Media Studio, aplican las operaciones compatibles y encolan un render." })}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2"><Label htmlFor="media-source">{t("mediaTemplates.companyVideo", { defaultValue: "Vídeo de la empresa" })}</Label><NativeSelect id="media-source" value={sourceFileId} onChange={(event) => setSourceFileId(event.target.value)}><option value="">{t("mediaTemplates.selectCompanyVideo", { defaultValue: "Selecciona un vídeo de la empresa" })}</option>{sourceOptions.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</NativeSelect>{files.error ? <p role="alert" className="text-sm text-destructive">{files.error.message}</p> : null}{!files.isLoading && !files.error && sourceOptions.length === 0 ? <p className="text-sm text-muted-foreground">{t("uxFiles.noEligibleVideo", { defaultValue: "No company videos are available to select. Check file access and expiry, or upload a video." })}</p> : null}</div>
          <div className="flex flex-col gap-2"><Label htmlFor="media-template">{t("mediaTemplates.format", { defaultValue: "Formato" })}</Label><NativeSelect id="media-template" value={selectedPresetId} onChange={(event) => { setSelectedPresetId(event.target.value); setProjectId(""); }}><optgroup label={t("mediaTemplates.starterTemplates", { defaultValue: "Plantillas iniciales" })}>{BUILT_IN_MEDIA_TEMPLATES.map((preset) => <option key={preset.presetKey} value={preset.presetKey}>{presetName(preset)}</option>)}</optgroup>{presets.data?.length ? <optgroup label={t("mediaTemplates.savedVersions", { defaultValue: "Versiones guardadas" })}>{presets.data.map((preset) => <option key={preset.id} value={preset.id}>{t("mediaTemplates.versionLabel", { defaultValue: "{{name}} · v{{version}}", name: presetName(preset), version: preset.version })}</option>)}</optgroup> : null}</NativeSelect></div>
          <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">{t("mediaTemplates.brandToggle", { defaultValue: "Referencias de marca del preset guardado" })}</summary><div className="mt-3 flex flex-col gap-3"><p className="text-sm text-muted-foreground">{t("mediaTemplates.brandNote", { defaultValue: "Las referencias son metadatos de la empresa. Las plantillas de vídeo actuales no añaden superposiciones de logotipo ni música. Paperclip no verifica los derechos de voz ni de música." })}</p><div className="flex flex-col gap-2"><Label htmlFor="media-brand-logo">{t("mediaTemplates.logoImage", { defaultValue: "Imagen del logotipo" })}</Label><NativeSelect id="media-brand-logo" value={logoFileId} onChange={(event) => setLogoFileId(event.target.value)}><option value="">{t("mediaTemplates.noLogo", { defaultValue: "Sin referencia de logotipo" })}</option>{imageFiles.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</NativeSelect></div><div className="flex flex-col gap-2"><Label htmlFor="media-brand-voice">{t("mediaTemplates.voiceRef", { defaultValue: "Referencia de audio de voz" })}</Label><NativeSelect id="media-brand-voice" value={voiceFileId} onChange={(event) => setVoiceFileId(event.target.value)}><option value="">{t("mediaTemplates.noVoice", { defaultValue: "Sin referencia de voz" })}</option>{audioFiles.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</NativeSelect></div><div className="flex flex-col gap-2"><Label htmlFor="media-brand-music">{t("mediaTemplates.musicRef", { defaultValue: "Referencia de audio de música" })}</Label><NativeSelect id="media-brand-music" value={musicFileId} onChange={(event) => setMusicFileId(event.target.value)}><option value="">{t("mediaTemplates.noMusic", { defaultValue: "Sin referencia de música" })}</option>{audioFiles.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</NativeSelect></div><div className="flex flex-col gap-2"><Label htmlFor="media-music-evidence">{t("mediaTemplates.musicLicense", { defaultValue: "URL de referencia de licencia de música aportada por la empresa" })}</Label><Input id="media-music-evidence" type="url" value={musicLicenseReferenceUrl} onChange={(event) => setMusicLicenseReferenceUrl(event.target.value)} placeholder="https://…" /></div></div></details>
          <div className="rounded-lg border bg-muted p-3"><p className="font-medium">{presetName(template)}</p>{presetDescription(template) ? <p className="mt-1 text-sm text-muted-foreground">{presetDescription(template)}</p> : null}<ul className="mt-2 flex flex-col gap-1">{template.inputCriteria.notes.map((note, index) => <li key={index} className="text-sm text-muted-foreground">{noteText(note)}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">{template.operations.map((operation) => operationLabel(operation.type)).join(" · ")} · {template.outputAspect}</p></div>
          <div className="flex flex-wrap gap-2"><Button disabled={!sourceFileId || start.isPending} onClick={() => { setProjectId(""); start.mutate(); }}>{start.isPending ? t("mediaTemplates.preparing", { defaultValue: "Preparando…" }) : t("mediaTemplates.prepareRender", { defaultValue: "Preparar y renderizar" })}</Button><Button variant="outline" disabled={saveVersion.isPending} onClick={() => saveVersion.mutate()}>{saveVersion.isPending ? t("mediaTemplates.saving", { defaultValue: "Guardando…" }) : savedPreset ? t("mediaTemplates.saveNext", { defaultValue: "Guardar la siguiente versión" }) : t("mediaTemplates.saveFirst", { defaultValue: "Guardar una versión" })}</Button></div>
          {start.error ? <p role="alert" className="text-sm text-destructive">{start.error.message}</p> : null}{saveVersion.error ? <p role="alert" className="text-sm text-destructive">{saveVersion.error.message}</p> : null}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{t("mediaTemplates.productionCost", { defaultValue: "Coste de producción" })}</CardTitle><CardDescription>{t("mediaTemplates.productionCostDescription", { defaultValue: "Últimos 30 días, con cobertura de evidencia." })}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{metrics.error ? <p role="alert" className="text-sm text-destructive">{metrics.error.message}</p> : metrics.data ? <><p className="text-2xl font-semibold">{metrics.data.centsPerMinute === null ? "—" : t("mediaTemplates.centsValue", { defaultValue: "{{value}} céntimos", value: metrics.data.centsPerMinute })}<span className="ml-1 text-sm font-normal text-muted-foreground">{t("mediaTemplates.perPricedMinute", { defaultValue: "/ minuto con precio" })}</span></p><p className="text-sm">{t("mediaTemplates.totalCost", { defaultValue: "Coste total reportado y estimado: {{cents}} céntimos", cents: metrics.data.pricedCostCents })}</p><p className="text-sm text-muted-foreground">{t("mediaTemplates.jobCounts", { defaultValue: "{{completed}} completados · evidencia de coste en {{cost}} · evidencia de duración en {{duration}}", completed: metrics.data.completedJobs, cost: metrics.data.jobsWithCostEvidence, duration: metrics.data.jobsWithDurationEvidence })}</p><p className="text-xs text-muted-foreground">{t("mediaTemplates.coverage", { defaultValue: "Evidencia de coste {{cost}}% · evidencia de duración {{duration}}%", cost: metrics.data.costCoveragePercent, duration: metrics.data.durationCoveragePercent })}</p><p className="text-xs text-muted-foreground">{metrics.data.basis}</p></> : <p className="text-sm text-muted-foreground">{t("mediaTemplates.loadingUsage", { defaultValue: "Cargando evidencia de uso…" })}</p>}</CardContent></Card>
      </div>
      {projectId ? <Card><CardHeader><CardTitle>{t("mediaTemplates.currentProduction", { defaultValue: "Producción actual" })}</CardTitle><CardDescription>{t("mediaTemplates.currentProductionDescription", { defaultValue: "El estado de los trabajos se lee del proyecto existente de Media Studio." })}</CardDescription></CardHeader><CardContent><MediaProductionStatus projectId={projectId} template={{ transcriptRequired: template.inputCriteria.transcriptRequired, outputAspect: template.outputAspect }} /></CardContent></Card> : null}
    </main>
  );
}

export default MediaTemplates;
