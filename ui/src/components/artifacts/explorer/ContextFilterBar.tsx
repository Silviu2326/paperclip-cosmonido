import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { useTranslation } from "@/i18n";
import type { ContextRole } from "@/api/context";
import {
  CONTEXT_ROLES,
  type ContextAudienceFilter,
  type ContextAudienceKind,
  type ContextFilter,
  type ContextValidity,
} from "./context-properties";
import type { useContextMode } from "./useContextMode";

type ContextMode = ReturnType<typeof useContextMode>;

/**
 * Filters of the Entrada context view plus the optional properties given to files uploaded from it.
 * Role, validity (active / expired) and audience narrow the listing; the upload block stays closed.
 */
export function ContextFilterBar({ filter, onFilter, onClose, mode }: {
  filter: ContextFilter;
  onFilter: (filter: ContextFilter) => void;
  onClose: () => void;
  mode: ContextMode;
}) {
  const { t } = useTranslation();
  const { defaults, setDefaults, projects, projectUnavailable, truncated, uploadBlocker } = mode;
  const roleLabel = (role: ContextRole) => {
    const item = CONTEXT_ROLES.find(candidate => candidate.role === role)!;
    return t(item.labelKey, { defaultValue: item.defaultLabel });
  };
  const audienceLabel = defaults.audienceKind === "project"
    ? (projects.data?.find(project => project.id === defaults.audienceId)?.name ?? t("context.project", { defaultValue: "Proyecto" }))
    : t("context.company", { defaultValue: "Toda la empresa" });

  return (
    <div className="flex flex-col gap-3 border-b border-border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <p className="basis-full text-muted-foreground">
          {t("context.description", { defaultValue: "Archivos de referencia que los agentes pueden consultar durante su trabajo." })}
        </p>
        <label className="grid gap-1">
          {t("context.role", { defaultValue: "Sección" })}
          <NativeSelect value={filter.role} onChange={event => onFilter({ ...filter, role: event.target.value as ContextRole | "any" })}>
            <option value="any">{t("context.allRoles", { defaultValue: "Todas" })}</option>
            {CONTEXT_ROLES.map(item => <option key={item.role} value={item.role}>{roleLabel(item.role)}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1">
          {t("context.validity", { defaultValue: "Vigencia" })}
          <NativeSelect value={filter.validity} onChange={event => onFilter({ ...filter, validity: event.target.value as ContextValidity })}>
            <option value="all">{t("context.validityAll", { defaultValue: "Todos" })}</option>
            <option value="active">{t("context.validityActive", { defaultValue: "Vigentes" })}</option>
            <option value="expired">{t("context.expiredOnly", { defaultValue: "Caducados" })}</option>
          </NativeSelect>
        </label>
        <label className="grid gap-1">
          {t("context.audience", { defaultValue: "Audiencia" })}
          <NativeSelect
            value={filter.audience}
            onChange={event => onFilter({ ...filter, audience: event.target.value as ContextAudienceFilter, projectId: null })}
          >
            <option value="any">{t("context.audienceAny", { defaultValue: "Cualquiera" })}</option>
            <option value="company">{t("context.company", { defaultValue: "Toda la empresa" })}</option>
            <option value="project">{t("context.project", { defaultValue: "Proyecto" })}</option>
            <option value="customer">{t("context.customer", { defaultValue: "Cliente" })}</option>
          </NativeSelect>
        </label>
        {filter.audience === "project" && (
          <label className="grid gap-1">
            {t("context.project", { defaultValue: "Proyecto" })}
            <NativeSelect value={filter.projectId ?? ""} onChange={event => onFilter({ ...filter, projectId: event.target.value || null })}>
              <option value="">{t("context.anyProject", { defaultValue: "Cualquier proyecto" })}</option>
              {(projects.data ?? []).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </NativeSelect>
          </label>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          <X aria-hidden="true" />
          {t("context.close", { defaultValue: "Ver todos los archivos" })}
        </Button>
      </div>

      {truncated && (
        <p role="status" className="text-muted-foreground">
          {t("context.truncated", { defaultValue: "Se muestran resultados limitados; consulta el explorador de archivos para ver más." })}
        </p>
      )}
      {projectUnavailable && (
        <p role="alert" className="text-destructive">
          {t("uxFiles.projectUnavailable", { defaultValue: "This project is not available in the selected company. Choose an authorized project before uploading." })}
        </p>
      )}

      <details className="rounded-md border border-border p-2.5">
        <summary className="cursor-pointer font-medium">
          {t("context.uploadAs", { defaultValue: "Propiedades de los archivos que subas aquí" })}
          <span className="ml-2 font-normal text-muted-foreground">{roleLabel(defaults.role)} · {audienceLabel}</span>
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            {t("context.role", { defaultValue: "Sección" })}
            <NativeSelect value={defaults.role} onChange={event => setDefaults({ ...defaults, role: event.target.value as ContextRole })}>
              {CONTEXT_ROLES.map(item => <option key={item.role} value={item.role}>{roleLabel(item.role)}</option>)}
            </NativeSelect>
          </label>
          <label className="grid gap-1">
            {t("context.audience", { defaultValue: "Audiencia" })}
            <NativeSelect
              value={defaults.audienceKind}
              onChange={event => setDefaults({ ...defaults, audienceKind: event.target.value as ContextAudienceKind, audienceId: "" })}
            >
              <option value="company">{t("context.company", { defaultValue: "Toda la empresa" })}</option>
              <option value="project">{t("context.project", { defaultValue: "Proyecto" })}</option>
            </NativeSelect>
          </label>
          {defaults.audienceKind === "project" && (
            <label className="grid gap-1">
              {t("context.project", { defaultValue: "Proyecto" })}
              <NativeSelect value={defaults.audienceId} onChange={event => setDefaults({ ...defaults, audienceId: event.target.value })}>
                <option value="">{t("context.chooseProject", { defaultValue: "Seleccionar proyecto" })}</option>
                {(projects.data ?? []).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </NativeSelect>
            </label>
          )}
          <label className="grid gap-1">
            {t("context.validUntil", { defaultValue: "Válido hasta" })}
            <Input type="date" value={defaults.validUntil} onChange={event => setDefaults({ ...defaults, validUntil: event.target.value })} />
          </label>
          {defaults.audienceKind === "project" && projects.error && (
            <p role="alert" className="basis-full text-destructive">
              {t("context.projectsError", { defaultValue: "No se pudieron cargar los proyectos. Vuelve a intentarlo antes de subir archivos para un proyecto." })} {projects.error.message}
            </p>
          )}
          {uploadBlocker === "projectMissing" && (
            <p role="status" className="basis-full text-muted-foreground">
              {t("context.projectRequired", { defaultValue: "Elige un proyecto para limitar la audiencia." })}
            </p>
          )}
          {defaults.audienceKind === "project" && defaults.audienceId && !uploadBlocker && (
            <p role="status" className="basis-full text-muted-foreground">
              {t("uxFiles.projectContextSelected", { defaultValue: "The selected project will be used as the file audience." })}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
