import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n";
import { customerPortalApi, customerPortalKinds } from "../api/customer-portal";

export interface CustomerPortalSettingsProps { companyId: string; customerId: string; }

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Board view of the files this customer's links can see: share, hide/show and download, with the real stored state. */
function CustomerFilesPanel({ companyId, customerId }: CustomerPortalSettingsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ["customer-portal-files", companyId, customerId];
  const files = useQuery({ queryKey, queryFn: () => customerPortalApi.files(companyId, customerId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const share = useMutation({ mutationFn: (file: File) => customerPortalApi.shareFile(companyId, customerId, file), onSuccess: refresh });
  const visibility = useMutation({ mutationFn: ({ id, visible }: { id: string; visible: boolean }) => customerPortalApi.setFileVisibility(companyId, id, visible), onSuccess: refresh });
  const download = useMutation({ mutationFn: async (item: { id: string; name: string }) => saveBlob(await customerPortalApi.downloadFile(companyId, item.id), item.name) });
  const stateLabel = (state: string) => state === "stored" ? t("customerPortal.files.stored", { defaultValue: "Guardado" }) : state === "pending" ? t("customerPortal.files.pending", { defaultValue: "Sin confirmar" }) : state === "rejected" ? t("customerPortal.files.rejected", { defaultValue: "Rechazado" }) : t("customerPortal.files.abandoned", { defaultValue: "No completado" });
  const error = files.error ?? share.error ?? visibility.error ?? download.error;
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <h3 className="font-medium">{t("customerPortal.files.title", { defaultValue: "Archivos del cliente" })}</h3>
      <p className="text-sm text-muted-foreground">{t("customerPortal.files.note", { defaultValue: "Solo los enlaces con archivos activados ven estos archivos. Ocultar un archivo lo retira de todos los enlaces sin borrarlo." })}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="portal-share-file">{t("customerPortal.files.share", { defaultValue: "Compartir un archivo con el cliente" })}</Label>
        <Input id="portal-share-file" type="file" disabled={share.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) share.mutate(file); event.target.value = ""; }} />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : null}
      <ul className="flex flex-col gap-2">
        {(files.data ?? []).map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted p-3">
            <span className="text-sm">{item.name} · {item.direction === "inbound" ? t("customerPortal.files.fromCustomer", { defaultValue: "del cliente" }) : t("customerPortal.files.fromUs", { defaultValue: "nuestro" })} · {stateLabel(item.state)}{item.state === "stored" && !item.visibleToCustomer ? ` · ${t("customerPortal.files.hidden", { defaultValue: "oculto" })}` : ""}</span>
            {item.state === "stored" ? <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={download.isPending} onClick={() => download.mutate({ id: item.id, name: item.name })}>{t("customerPortal.files.download", { defaultValue: "Descargar" })}</Button>
              <Button variant="outline" size="sm" disabled={visibility.isPending} onClick={() => visibility.mutate({ id: item.id, visible: !item.visibleToCustomer })}>{item.visibleToCustomer ? t("customerPortal.files.hide", { defaultValue: "Ocultar" }) : t("customerPortal.files.show", { defaultValue: "Mostrar" })}</Button>
            </div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CustomerPortalSettings({ companyId, customerId }: CustomerPortalSettingsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expiresAt, setExpiresAt] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16));
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [allowDeliverableFeedback, setAllowDeliverableFeedback] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(false);
  const [allowFileUploads, setAllowFileUploads] = useState(false);
  const [feedbackPortalId, setFeedbackPortalId] = useState<string | null>(null);
  const portals = useQuery({ queryKey: ["customer-portals", companyId, customerId], queryFn: () => customerPortalApi.list(companyId, customerId) });
  const create = useMutation({
    mutationFn: () => customerPortalApi.create(companyId, {
      customerId, expiresAt: new Date(expiresAt).toISOString(), allowDeliverableFeedback,
      ...(includeFiles ? { resourceKinds: customerPortalKinds, allowFileUploads } : {}),
    }),
    onSuccess: async (portal) => { setCreatedUrl(`${window.location.origin}${portal.url}`); await queryClient.invalidateQueries({ queryKey: ["customer-portals", companyId, customerId] }); },
  });
  const revoke = useMutation({
    mutationFn: (portalId: string) => customerPortalApi.revoke(companyId, portalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-portals", companyId, customerId] }),
  });
  const feedback = useQuery({ queryKey: ["customer-portal-feedback", companyId, feedbackPortalId], queryFn: () => customerPortalApi.feedback(companyId, feedbackPortalId!), enabled: Boolean(feedbackPortalId) });
  return (
    <Card>
      <CardHeader><CardTitle>{t("customerPortal.settings.title", { defaultValue: "Portal del cliente" })}</CardTitle><CardDescription>{t("customerPortal.settings.description", { defaultValue: "Crea un enlace privado y caducable para este cliente." })}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2"><Label htmlFor="portal-expiration">{t("customerPortal.settings.expires", { defaultValue: "El enlace caduca" })}</Label><Input id="portal-expiration" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
          <Button onClick={() => { setCreatedUrl(null); create.mutate(); }} disabled={create.isPending || !expiresAt}>{create.isPending ? t("customerPortal.settings.creating", { defaultValue: "Creando…" }) : t("customerPortal.settings.create", { defaultValue: "Crear enlace del portal" })}</Button>
        </div>
        <div className="flex items-center gap-2"><Checkbox id="portal-deliverable-feedback" checked={allowDeliverableFeedback} onCheckedChange={(checked) => setAllowDeliverableFeedback(checked === true)} /><Label htmlFor="portal-deliverable-feedback">{t("customerPortal.settings.allowFeedback", { defaultValue: "Permitir comentarios del cliente sobre todos los entregables" })}</Label></div>
        <p className="text-sm text-muted-foreground">{t("customerPortal.settings.feedbackNote", { defaultValue: "El comentario registra la respuesta del cliente sobre la versión actual del entregable. No aprueba ni resuelve una revisión interna." })}</p>
        <div className="flex items-center gap-2"><Checkbox id="portal-files" checked={includeFiles} onCheckedChange={(checked) => { setIncludeFiles(checked === true); if (checked !== true) setAllowFileUploads(false); }} /><Label htmlFor="portal-files">{t("customerPortal.settings.includeFiles", { defaultValue: "Incluir los archivos compartidos con este cliente" })}</Label></div>
        {includeFiles ? <div className="flex items-center gap-2"><Checkbox id="portal-file-uploads" checked={allowFileUploads} onCheckedChange={(checked) => setAllowFileUploads(checked === true)} /><Label htmlFor="portal-file-uploads">{t("customerPortal.settings.allowUploads", { defaultValue: "Permitir que el cliente suba archivos" })}</Label></div> : null}
        {create.error ? <p role="alert" className="text-sm text-destructive">{create.error.message}</p> : null}
        {createdUrl ? <div className="flex flex-col gap-2 rounded-lg border bg-muted p-3"><p className="text-sm">{t("customerPortal.settings.copyNow", { defaultValue: "Copia este enlace ahora. El secreto solo se muestra una vez." })}</p><Input readOnly value={createdUrl} onFocus={(event) => event.currentTarget.select()} /></div> : null}
        {portals.error ? <p role="alert" className="text-sm text-destructive">{portals.error.message}</p> : null}
        <ul className="flex flex-col gap-2">{(portals.data ?? []).map((portal) => <li key={portal.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><span className="text-sm">{t("customerPortal.settings.statusLine", { defaultValue: "{{status}} · caduca {{date}}", status: portal.revokedAt ? t("customerPortal.settings.revoked", { defaultValue: "Revocado" }) : new Date(portal.expiresAt) <= new Date() ? t("customerPortal.settings.expired", { defaultValue: "Caducado" }) : t("customerPortal.settings.active", { defaultValue: "Activo" }), date: new Date(portal.expiresAt).toLocaleString() })}{portal.resourceKinds.includes("files") ? ` · ${portal.allowFileUploads ? t("customerPortal.settings.filesUpload", { defaultValue: "archivos (con subida)" }) : t("customerPortal.settings.filesRead", { defaultValue: "archivos (solo descarga)" })}` : ""}</span><div className="flex gap-2">{portal.allowDeliverableFeedback ? <Button variant="outline" size="sm" onClick={() => setFeedbackPortalId(portal.id)}>{t("customerPortal.settings.viewFeedback", { defaultValue: "Ver comentarios del cliente" })}</Button> : null}{!portal.revokedAt && new Date(portal.expiresAt) > new Date() ? <Button variant="outline" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(portal.id)}>{t("customerPortal.settings.revoke", { defaultValue: "Revocar" })}</Button> : null}</div></li>)}</ul>
        {feedbackPortalId ? <section className="flex flex-col gap-2 rounded-lg border p-3"><h3 className="font-medium">{t("customerPortal.settings.feedbackTitle", { defaultValue: "Comentarios externos del cliente" })}</h3><p className="text-sm text-muted-foreground">{t("customerPortal.settings.feedbackSectionNote", { defaultValue: "Es evidencia aportada por el cliente. Las decisiones de revisión interna siguen separadas." })}</p>{feedback.error ? <p role="alert" className="text-sm text-destructive">{feedback.error.message}</p> : null}{(feedback.data ?? []).map((item) => <article key={`${item.targetVersion}-${item.createdAt}`} className="rounded-md bg-muted p-3"><p className="font-medium">{item.targetTitle} · {item.decision === "accept" ? t("customerPortal.settings.acceptedExternally", { defaultValue: "Aceptado externamente" }) : t("customerPortal.settings.changesRequested", { defaultValue: "Cambios solicitados" })}</p><p className="whitespace-pre-wrap text-sm">{item.comment || t("customerPortal.settings.noComment", { defaultValue: "Sin comentario." })}</p><p className="text-xs text-muted-foreground">{t("customerPortal.settings.versionDate", { defaultValue: "Versión {{version}} · {{date}}", version: item.targetVersion, date: new Date(item.createdAt).toLocaleString() })}</p></article>)}</section> : null}
        <CustomerFilesPanel companyId={companyId} customerId={customerId} />
      </CardContent>
    </Card>
  );
}

export default CustomerPortalSettings;
