import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { portablePackageSchema, type PortablePackage } from "@paperclipai/shared/productization/portable-package";
import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { portableCatalogApi, type CatalogPackageStatus, type CatalogPackageSummary } from "./api";
import { PackageInstallPanel } from "./PackageInstallPanel";

const MAX_PACKAGE_BYTES = 1_048_576;

const STATUS_LABELS: Record<CatalogPackageStatus, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  published: "Publicado",
  withdrawn: "Retirado",
};

export interface PortableCatalogPanelProps {
  companyId: string;
}

export function PortableCatalogPanel(props: PortableCatalogPanelProps) {
  return <PortableCatalogPanelContent key={props.companyId} {...props} />;
}

function parsePackageJson(source: string): { ok: true; value: PortablePackage } | { ok: false; message: string } {
  if (new TextEncoder().encode(source).byteLength > MAX_PACKAGE_BYTES) {
    return { ok: false, message: "El JSON del paquete supera el límite de 1 MiB." };
  }
  let json: unknown;
  try { json = JSON.parse(source); } catch { return { ok: false, message: "Introduce un paquete JSON válido." }; }
  const parsed = portablePackageSchema.safeParse(json);
  if (!parsed.success) {
    // Report only where the problem is, never the offending text (it may be the very datum that must not be shared).
    const where = [...new Set(parsed.error.issues.slice(0, 3).map((issue) => issue.path.join(".") || "(raíz)"))].join(", ");
    return {
      ok: false,
      message: `Este JSON no cumple el formato de paquete portátil o contiene datos que un paquete no puede llevar (correos, teléfonos, identificadores privados, credenciales). Revisa: ${where}.`,
    };
  }
  return { ok: true, value: parsed.data };
}

function PortableCatalogPanelContent({ companyId }: PortableCatalogPanelProps) {
  const { t } = useTranslation();
  const tr = (key: string, value: string) => t(`productization.catalog.library.${key}`, { defaultValue: value });
  const queryClient = useQueryClient();
  const listKey = ["productization", "catalog", "packages", companyId] as const;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [editing, setEditing] = useState(false);
  const [attested, setAttested] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: listKey, queryFn: () => portableCatalogApi.list(companyId), retry: false });
  const detail = useQuery({
    queryKey: [...listKey, selectedId],
    queryFn: () => portableCatalogApi.get(companyId, selectedId!),
    enabled: Boolean(selectedId),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: listKey });
  };
  const fail = (cause: Error) => { setMessage(null); setError(cause.message); };
  const done = (text: string) => { setError(null); setMessage(text); refresh(); };

  const create = useMutation({
    retry: false,
    mutationFn: (value: PortablePackage) => portableCatalogApi.createDraft(companyId, value),
    onSuccess: (created) => { setSource(""); setSelectedId(created.id); done(tr("created", "Borrador creado. Es privado de esta empresa.")); },
    onError: fail,
  });
  const update = useMutation({
    retry: false,
    mutationFn: (variables: { id: string; value: PortablePackage }) => portableCatalogApi.updateDraft(companyId, variables.id, variables.value),
    onSuccess: () => { setEditing(false); setSource(""); done(tr("updated", "Borrador actualizado.")); },
    onError: fail,
  });
  const act = useMutation({
    retry: false,
    mutationFn: (variables: { kind: "review" | "draft" | "publish" | "withdraw" | "delete"; id: string }) => {
      switch (variables.kind) {
        case "review": return portableCatalogApi.requestReview(companyId, variables.id);
        case "draft": return portableCatalogApi.returnToDraft(companyId, variables.id);
        case "publish": return portableCatalogApi.publish(companyId, variables.id);
        case "withdraw": return portableCatalogApi.withdraw(companyId, variables.id);
        case "delete": return portableCatalogApi.deleteDraft(companyId, variables.id);
      }
    },
    onSuccess: (_result, variables) => {
      setAttested(false);
      if (variables.kind === "delete") setSelectedId(null);
      done(tr("done", "Hecho."));
    },
    onError: fail,
  });

  const busy = create.isPending || update.isPending || act.isPending;

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_PACKAGE_BYTES) { setError(tr("fileTooLarge", "El archivo supera el límite de 1 MiB.")); return; }
    void file.text().then(setSource).catch(() => setError(tr("fileReadError", "No se pudo leer el archivo.")));
  }

  async function download(summary: CatalogPackageSummary) {
    try {
      const exported = await portableCatalogApi.exportPackage(companyId, summary.id);
      const blob = new Blob([JSON.stringify(exported.package, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${summary.packageKey}-${summary.packageVersion}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("exportError", "No se pudo exportar el paquete."));
    }
  }

  if (installingId) {
    return <PackageInstallPanel companyId={companyId} packageId={installingId} onBack={() => { setInstallingId(null); refresh(); }} />;
  }

  const selected = detail.data && detail.data.id === selectedId ? detail.data : null;

  function submitSource(mode: "create" | "update") {
    setError(null); setMessage(null);
    const parsed = parsePackageJson(source);
    if (!parsed.ok) { setError(parsed.message); return; }
    if (mode === "create") create.mutate(parsed.value);
    else if (selected) update.mutate({ id: selected.id, value: parsed.value });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{tr("title", "Catálogo privado de paquetes")}</CardTitle>
          <CardDescription>
            {tr("description", "Paquetes versionados visibles solo en esta empresa. Publicar congela una versión tras una revisión humana explícita; no instala nada ni concede permisos. Al instalar, los perfiles pasan por la contratación de la empresa y los recursos se crean como borradores sin publicar.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {list.isLoading && <p role="status" className="text-sm text-muted-foreground">{tr("loading", "Cargando paquetes…")}</p>}
          {list.isError && <p role="alert" className="text-sm text-destructive">{list.error instanceof Error ? list.error.message : ""}</p>}
          {list.data && list.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{tr("empty", "Todavía no hay paquetes. Crea un borrador pegando un JSON de paquete portátil.")}</p>
          )}
          <ul className="flex flex-col gap-2">
            {(list.data ?? []).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div className="flex flex-col">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-sm text-muted-foreground">{item.packageKey}@{item.packageVersion} · {item.counts.profiles} {tr("profiles", "perfiles")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.status === "published" ? "default" : "secondary"}>{STATUS_LABELS[item.status]}</Badge>
                  <Button type="button" size="sm" variant={selectedId === item.id ? "default" : "outline"}
                    onClick={() => { setSelectedId(item.id); setEditing(false); setAttested(false); setMessage(null); setError(null); }}>
                    {tr("open", "Abrir")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{selected.name}</CardTitle>
            <CardDescription>
              {selected.packageKey}@{selected.packageVersion} · <Badge variant="outline">{STATUS_LABELS[selected.status]}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{selected.description}</p>
            <ul className="grid gap-1 text-sm md:grid-cols-3">
              <li>{tr("teams", "Equipos")}: {selected.counts.teams}</li>
              <li>{tr("profiles", "Perfiles")}: {selected.counts.profiles}</li>
              <li>{tr("skills", "Skills")}: {selected.counts.skills}</li>
              <li>{tr("playbooks", "Playbooks")}: {selected.counts.playbooks}</li>
              <li>{tr("templates", "Plantillas de encargo")}: {selected.counts.requestTemplates}</li>
              <li>{tr("brands", "Presets de marca")}: {selected.counts.brandPresets}</li>
              <li>{tr("forms", "Formularios")}: {selected.counts.forms}</li>
              <li>{tr("meetings", "Tipos de reunión")}: {selected.counts.meetingTypes}</li>
              <li>{tr("connections", "Conexiones requeridas")}: {selected.counts.connectionRequests}</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              {tr("hash", "Huella del contenido")}: <code>{selected.contentHash.slice(0, 16)}…</code>
              {selected.publishedAt && ` · ${tr("publishedAt", "Publicado")}: ${new Date(selected.publishedAt).toLocaleString()}`}
            </p>

            {selected.status === "draft" && (
              <div className="flex flex-col gap-3">
                {editing ? (
                  <>
                    <Label htmlFor="catalog-edit-json">{tr("editJson", "JSON del paquete (misma clave y versión)")}</Label>
                    <Textarea id="catalog-edit-json" rows={10} value={source} onChange={(event) => setSource(event.target.value)} maxLength={MAX_PACKAGE_BYTES} />
                    <div className="flex justify-between gap-2">
                      <Button type="button" variant="ghost" onClick={() => { setEditing(false); setSource(""); }}>{tr("cancel", "Cancelar")}</Button>
                      <Button type="button" disabled={busy || !source.trim()} onClick={() => submitSource("update")}>{tr("save", "Guardar borrador")}</Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap justify-between gap-2">
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" disabled={busy}
                        onClick={() => { setSource(JSON.stringify(selected.content, null, 2)); setEditing(true); }}>{tr("edit", "Editar contenido")}</Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => act.mutate({ kind: "delete", id: selected.id })}>{tr("delete", "Eliminar borrador")}</Button>
                    </div>
                    <Button type="button" disabled={busy} onClick={() => act.mutate({ kind: "review", id: selected.id })}>{tr("requestReview", "Enviar a revisión")}</Button>
                  </div>
                )}
              </div>
            )}

            {selected.status === "in_review" && (
              <div className="flex flex-col gap-3 rounded-md border p-4">
                <p className="text-sm font-medium">{tr("reviewTitle", "Revisión previa a la publicación")}</p>
                <p className="text-sm text-muted-foreground">
                  {tr("reviewBody", "Publicar congela esta versión: no podrá editarse, solo retirarse. Compartirla no importa permisos, credenciales ni conexiones.")}
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={attested} aria-label={tr("attest", "Confirmo que he revisado el contenido y no incluye datos de clientes, credenciales ni material privado.")}
                    onCheckedChange={(checked) => setAttested(checked === true)} />
                  <span>{tr("attest", "Confirmo que he revisado el contenido y no incluye datos de clientes, credenciales ni material privado.")}</span>
                </label>
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => act.mutate({ kind: "draft", id: selected.id })}>{tr("backToDraft", "Devolver a borrador")}</Button>
                  <Button type="button" disabled={busy || !attested} onClick={() => act.mutate({ kind: "publish", id: selected.id })}>{tr("publish", "Publicar versión")}</Button>
                </div>
              </div>
            )}

            {selected.status === "published" && (
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void download(selected)}>{tr("export", "Exportar JSON")}</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => act.mutate({ kind: "withdraw", id: selected.id })}>{tr("withdraw", "Retirar")}</Button>
                </div>
                <Button type="button" onClick={() => setInstallingId(selected.id)}>{tr("install", "Revisar e instalar")}</Button>
              </div>
            )}
            {selected.status === "withdrawn" && (
              <p className="text-sm text-muted-foreground">{tr("withdrawnNote", "Versión retirada: no se puede instalar de nuevo. Las instalaciones existentes no cambian.")}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tr("newDraft", "Nuevo borrador")}</CardTitle>
          <CardDescription>{tr("newDraftHelp", "Pega o carga un JSON de paquete portátil. Se valida antes de guardarse y no puede incluir permisos ni secretos.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!editing && <Textarea aria-label={tr("jsonLabel", "JSON del paquete")} rows={8} value={source} onChange={(event) => setSource(event.target.value)} maxLength={MAX_PACKAGE_BYTES} />}
          <div className="flex flex-col gap-2">
            <Label htmlFor="catalog-draft-file">{tr("fileLabel", "O selecciona un archivo JSON local (máx. 1 MiB)")}</Label>
            <Input id="catalog-draft-file" type="file" accept="application/json,.json" onChange={onFileChange} />
          </div>
          <p className="text-sm text-muted-foreground" role="note">
            {tr("privacy", "Revisa el texto y elimina datos de clientes o información sensible: el esquema no puede garantizar su ausencia.")}
          </p>
          <div className="flex justify-end">
            <Button type="button" disabled={busy || editing || !source.trim()} onClick={() => submitSource("create")}>{tr("createDraft", "Crear borrador")}</Button>
          </div>
        </CardContent>
      </Card>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
