import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContextRole } from "@/api/context";
import { companyFilesApi, type CompanyFile } from "@/api/company-files";
import { projectsApi } from "@/api/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import {
  CONTEXT_ROLES,
  buildFileUpdate,
  draftChanged,
  draftFromFile,
  isExpired,
  type ContextAudienceKind,
  type ContextPropertiesDraft,
} from "./context-properties";

/**
 * Optional "context for agents" properties of one Entrada file. Closed by default
 * and never required: a file without a role is simply not reference context.
 * The parent re-keys it by file and update time so a saved file re-syncs the draft.
 */
export function FileContextProperties({ companyId, file }: { companyId: string; file: CompanyFile }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ContextPropertiesDraft>(() => draftFromFile(file));
  const projects = useQuery({
    queryKey: ["context-projects", companyId],
    queryFn: () => projectsApi.list(companyId),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: () => {
      const input = buildFileUpdate(file, draft);
      if (!input) throw new Error(t("context.projectRequired", { defaultValue: "Elige un proyecto para limitar la audiencia." }));
      return companyFilesApi.update(file.id, input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.companyFiles.all(companyId) });
      await queryClient.invalidateQueries({ queryKey: ["context", companyId] });
    },
  });

  const roleLabel = (role: ContextRole | null) => {
    const item = CONTEXT_ROLES.find(candidate => candidate.role === role);
    return item ? t(item.labelKey, { defaultValue: item.defaultLabel }) : t("context.noRole", { defaultValue: "Sin función de contexto" });
  };
  const summary = file.contextRole
    ? [
        roleLabel(file.contextRole),
        file.audienceKind === "project" ? t("context.project", { defaultValue: "Proyecto" }) : file.audienceKind === "customer" ? t("context.customer", { defaultValue: "Cliente" }) : t("context.company", { defaultValue: "Toda la empresa" }),
        isExpired(file, new Date()) ? t("context.expired", { defaultValue: "Caducado" }) : null,
      ].filter(Boolean).join(" · ")
    : t("context.noRole", { defaultValue: "Sin función de contexto" });
  const customerAudience = file.audienceKind === "customer";
  const projectMissing = draft.audienceKind === "project" && !draft.audienceId;

  return (
    <details className="rounded-md border border-border p-2.5 text-xs" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">
        {t("context.agentContext", { defaultValue: "Contexto para agentes" })}
        <span className="ml-2 font-normal text-muted-foreground">{summary}</span>
      </summary>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={event => { event.preventDefault(); if (!projectMissing) save.mutate(); }}
      >
        <label className="grid gap-1">
          {t("context.role", { defaultValue: "Sección" })}
          <NativeSelect
            value={draft.role ?? ""}
            onChange={event => setDraft({ ...draft, role: (event.target.value || null) as ContextRole | null })}
          >
            <option value="">{t("context.noRole", { defaultValue: "Sin función de contexto" })}</option>
            {CONTEXT_ROLES.map(item => <option key={item.role} value={item.role}>{t(item.labelKey, { defaultValue: item.defaultLabel })}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1">
          {t("context.audience", { defaultValue: "Audiencia" })}
          <NativeSelect
            value={draft.audienceKind}
            onChange={event => setDraft({ ...draft, audienceKind: event.target.value as ContextAudienceKind, audienceId: "" })}
          >
            <option value="company">{customerAudience ? t("context.customerKept", { defaultValue: "Cliente (sin cambios)" }) : t("context.company", { defaultValue: "Toda la empresa" })}</option>
            <option value="project">{t("context.project", { defaultValue: "Proyecto" })}</option>
          </NativeSelect>
        </label>
        {draft.audienceKind === "project" && (
          <label className="grid gap-1">
            {t("context.project", { defaultValue: "Proyecto" })}
            <NativeSelect value={draft.audienceId} onChange={event => setDraft({ ...draft, audienceId: event.target.value })}>
              <option value="">{t("context.chooseProject", { defaultValue: "Seleccionar proyecto" })}</option>
              {(projects.data ?? []).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </NativeSelect>
          </label>
        )}
        {draft.audienceKind === "project" && projects.error && (
          <p role="alert" className="text-destructive">
            {t("context.projectsError", { defaultValue: "No se pudieron cargar los proyectos. Vuelve a intentarlo antes de subir archivos para un proyecto." })} {projects.error.message}
          </p>
        )}
        <label className="grid gap-1">
          {t("context.validUntil", { defaultValue: "Válido hasta" })}
          <Input type="date" value={draft.validUntil} onChange={event => setDraft({ ...draft, validUntil: event.target.value })} />
        </label>
        {save.error && <p role="alert" className="text-destructive">{save.error.message}</p>}
        <div>
          <Button type="submit" size="sm" disabled={save.isPending || projectMissing || !draftChanged(file, draft)}>
            {save.isPending ? t("common.saving", { defaultValue: "Guardando…" }) : t("common.save", { defaultValue: "Guardar" })}
          </Button>
        </div>
      </form>
    </details>
  );
}
