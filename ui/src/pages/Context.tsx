import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload } from "lucide-react";
import { contextApi, type ContextRole } from "@/api/context";
import { companyFileContentPath, companyFilesApi } from "@/api/company-files";
import { projectsApi } from "@/api/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useTranslation } from "@/i18n";

const ROLES: Array<{ role: ContextRole; labelKey: string; defaultLabel: string }> = [
  { role: "offer", labelKey: "context.roles.offer", defaultLabel: "Oferta" },
  { role: "brand", labelKey: "context.roles.brand", defaultLabel: "Marca" },
  { role: "procedure", labelKey: "context.roles.procedure", defaultLabel: "Procedimientos" },
  { role: "customer", labelKey: "context.roles.customer", defaultLabel: "Clientes" },
];

export function Context() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<ContextRole>("offer");
  const [validUntil, setValidUntil] = useState("");
  const [audienceKind, setAudienceKind] = useState<"company" | "project">("company");
  const [audienceId, setAudienceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => { setBreadcrumbs([{ label: t("context.title", { defaultValue: "Context" }) }]); }, [setBreadcrumbs, t]);
  const query = useQuery({
    queryKey: ["context", selectedCompanyId],
    queryFn: async () => Promise.all(ROLES.map(async (item) => [item.role, await contextApi.list(selectedCompanyId!, item.role, true)] as const)),
    enabled: Boolean(selectedCompanyId),
  });
  const projects = useQuery({ queryKey: ["context-projects", selectedCompanyId], queryFn: () => projectsApi.list(selectedCompanyId!), enabled: Boolean(selectedCompanyId) });
  const upload = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !file) throw new Error("Selecciona un archivo");
      const created = await companyFilesApi.upload(selectedCompanyId, file);
      await companyFilesApi.update(created.id, { contextRole: role, validUntil: validUntil ? new Date(validUntil) : null, audienceKind, audienceId: audienceKind === "project" ? audienceId : null });
    },
    onSuccess: async () => {
      setFile(null); setValidUntil("");
      await queryClient.invalidateQueries({ queryKey: ["context", selectedCompanyId] });
    },
  });
  if (!selectedCompanyId) return <EmptyState icon={FileText} message={t("context.selectCompany", { defaultValue: "Selecciona una empresa para consultar su contexto." })} />;
  if (query.isLoading) return <PageSkeleton variant="list" />;
  const groups = new Map(query.data ?? []);
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t("context.title", { defaultValue: "Contexto del negocio" })}</h1>
        <p className="text-sm text-muted-foreground">{t("context.description", { defaultValue: "Archivos de referencia que los agentes pueden consultar durante su trabajo." })}</p>
      </header>
      {query.error && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); upload.mutate(); }}>
        <label className="grid gap-1 text-sm">{t("context.role", { defaultValue: "Sección" })}<NativeSelect value={role} onChange={(event) => setRole(event.target.value as ContextRole)} aria-label={t("context.role", { defaultValue: "Sección" })}>{ROLES.map((item) => <option key={item.role} value={item.role}>{t(item.labelKey, { defaultValue: item.defaultLabel })}</option>)}</NativeSelect></label>
        <label className="grid gap-1 text-sm">{t("context.audience", { defaultValue: "Audiencia" })}<NativeSelect value={audienceKind} onChange={(event) => setAudienceKind(event.target.value as "company" | "project")} aria-label={t("context.audience", { defaultValue: "Audiencia" })}><option value="company">{t("context.company", { defaultValue: "Toda la empresa" })}</option><option value="project">{t("context.project", { defaultValue: "Proyecto" })}</option></NativeSelect></label>
        {audienceKind === "project" && <label className="grid gap-1 text-sm">{t("context.project", { defaultValue: "Proyecto" })}<NativeSelect value={audienceId} onChange={(event) => setAudienceId(event.target.value)} aria-label={t("context.project", { defaultValue: "Proyecto" })}><option value="">{t("context.chooseProject", { defaultValue: "Seleccionar proyecto" })}</option>{(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</NativeSelect></label>}
        <label className="grid gap-1 text-sm">{t("context.validUntil", { defaultValue: "Válido hasta" })}<Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
        <Input type="file" className="max-w-sm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} aria-label={t("context.chooseFile", { defaultValue: "Elegir archivo" })} />
        <Button type="submit" disabled={!file || upload.isPending || (audienceKind === "project" && (!audienceId || projects.isLoading || Boolean(projects.error)))}><Upload data-icon="inline-start" />{upload.isPending ? t("common.uploading", { defaultValue: "Subiendo…" }) : t("context.upload", { defaultValue: "Subir archivo" })}</Button>
        {audienceKind === "project" && projects.error && <p role="alert" className="basis-full text-sm text-destructive">{t("context.projectsError", { defaultValue: "No se pudieron cargar los proyectos. Vuelve a intentarlo antes de subir archivos para un proyecto." })} {projects.error.message}</p>}
        {upload.error && <p role="alert" className="basis-full text-sm text-destructive">{upload.error.message}</p>}
      </form>
      <div className="grid gap-6 md:grid-cols-2">
        {ROLES.map((item) => {
          const data = groups.get(item.role);
          return <section key={item.role} className="flex flex-col gap-3">
            <h2 className="text-base font-medium">{t(item.labelKey, { defaultValue: item.defaultLabel })}<span className="ml-2 text-sm text-muted-foreground">{data?.files.length ?? 0}</span></h2>
            {data?.truncated && <p className="text-sm text-muted-foreground">{t("context.truncated", { defaultValue: "Se muestran resultados limitados; consulta el explorador de archivos para ver más." })}</p>}
            {!data?.files.length ? <p className="text-sm text-muted-foreground">{t("context.empty", { defaultValue: "Todavía no hay archivos en esta sección." })}</p> : <ul className="space-y-2">{data.files.map((entry) => <li key={entry.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3"><a className="truncate text-sm text-primary underline-offset-4 hover:underline" href={companyFileContentPath(entry.id)} target="_blank" rel="noreferrer">{entry.name}</a>{entry.validUntil && new Date(entry.validUntil) < new Date() && <span className="text-xs text-destructive">{t("context.expired", { defaultValue: "Caducado" })}</span>}</li>)}</ul>}
          </section>;
        })}
      </div>
    </main>
  );
}
