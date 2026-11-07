import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CONTACT_IMPORT_MAX_BYTES, contactImportPreviewSchema, contactImportReceiptSchema, type ContactImportPreview, type ContactImportReceipt, type ContactImportMapping } from "@paperclipai/shared/productization/contact-import";
import { api } from "@/api/client";
import { useAccountIdentity } from "@/api/companies-query";
import { useCompany } from "@/context/CompanyContext";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/lib/router";
import { createUuid } from "@/lib/uuid";

const SAMPLE = "displayName,email,phone,language\nContacto de ejemplo,ejemplo@example.com,,es\n";

export function ContactImport() {
  const { selectedCompanyId } = useCompany();
  const identity = useAccountIdentity();
  const { t } = useTranslation();
  if (!identity.settled) return <p role="status">{t("common.loading", { defaultValue: "Cargando…" })}</p>;
  if (!selectedCompanyId || !identity.userId) return <p>{t("contactImport.signIn", { defaultValue: "Inicia sesión y selecciona una empresa para importar contactos." })}</p>;
  return <ImportForCompany key={`${identity.userId}:${selectedCompanyId}`} companyId={selectedCompanyId} />;
}

function ImportForCompany({ companyId }: { companyId: string }) {
  const { t } = useTranslation(), queryClient = useQueryClient();
  const [csv, setCsv] = useState(""), [preview, setPreview] = useState<ContactImportPreview | null>(null);
  const [receipt, setReceipt] = useState<ContactImportReceipt | null>(null), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [batchKey, setBatchKey] = useState(createUuid);
  const [mapping, setMapping] = useState<ContactImportMapping>({ displayName: "displayName", email: "email", phone: "phone", language: "language" });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const change = (value: string) => { setCsv(value); setPreview(null); setReceipt(null); setError(null); setBatchKey(createUuid()); };
  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > CONTACT_IMPORT_MAX_BYTES) { setError(t("contactImport.sizeError", { defaultValue: "El archivo supera 128 KiB." })); return; }
    try { const value = await file.text(); if (alive.current) change(value); }
    catch { if (alive.current) setError(t("contactImport.readError", { defaultValue: "No se pudo leer el archivo." })); }
  }
  async function review() {
    setBusy(true); setError(null); setReceipt(null);
    try { const result = contactImportPreviewSchema.parse(await api.post(`/companies/${companyId}/productization/imports/contacts/preview`, { csv, mapping })); if (alive.current) setPreview(result); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : t("contactImport.previewError", { defaultValue: "No se pudo preparar la vista previa." })); }
    finally { if (alive.current) setBusy(false); }
  }
  async function commit() {
    if (!preview || busy) return;
    setBusy(true); setError(null);
    try {
      const result = contactImportReceiptSchema.parse(await api.post(`/companies/${companyId}/productization/imports/contacts/commit`, { csv, mapping, previewHash: preview.previewHash, idempotencyKey: batchKey }));
      if (alive.current) { setReceipt(result); await queryClient.invalidateQueries({ queryKey: ["contacts", companyId] }); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : t("contactImport.commitError", { defaultValue: "No se pudo confirmar. Puedes reintentar el mismo lote sin duplicarlo." })); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="flex flex-col gap-6">
    <Card><CardHeader><CardTitle>{t("contactImport.title", { defaultValue: "Importar contactos" })}</CardTitle><CardDescription>{t("contactImport.description", { defaultValue: "Revisa hasta 100 filas por lote. Los contactos existentes se conservan y la importación no concede consentimiento para enviarles mensajes." })}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("contactImport.format", { defaultValue: "CSV con cabecera displayName,email,phone,language. Incluye email o teléfono. El idioma es un código de dos letras; los campos opcionales pueden quedar vacíos." })}</p>
        <div className="flex flex-col gap-2"><Label htmlFor="contacts-csv-file">{t("contactImport.file", { defaultValue: "Archivo CSV" })}</Label><Input id="contacts-csv-file" type="file" accept=".csv,text/csv" disabled={busy || Boolean(receipt)} onChange={event => void loadFile(event.target.files?.[0])} /></div>
        <details className="text-sm"><summary>{t("contactImport.template", { defaultValue: "Ver plantilla" })}</summary><pre className="mt-2 overflow-auto rounded-md border p-3">{SAMPLE}</pre></details>
        <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 text-sm font-medium">{t("contactImport.mapping", { defaultValue: "Nombre de las columnas; deja vacíos los campos opcionales que no existan." })}</legend>{(["displayName", "email", "phone", "language"] as const).map(field => <div key={field} className="flex flex-col gap-2"><Label htmlFor={`contact-column-${field}`}>{t(`contactImport.columns.${field}`, { defaultValue: field === "displayName" ? "Nombre" : field === "email" ? "Email" : field === "phone" ? "Teléfono" : "Idioma" })}</Label><Input id={`contact-column-${field}`} disabled={busy || Boolean(receipt)} value={mapping[field]} onChange={event => { setMapping(current => ({ ...current, [field]: event.target.value })); setPreview(null); setBatchKey(createUuid()); setError(null); }} /></div>)}</fieldset>
        <div className="flex flex-col gap-2"><Label htmlFor="contacts-csv-text">{t("contactImport.text", { defaultValue: "Contenido CSV" })}</Label><Textarea id="contacts-csv-text" value={csv} disabled={busy || Boolean(receipt)} onChange={event => change(event.target.value)} rows={8} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {receipt ? <div role="status" className="flex flex-col gap-2"><p>{t("contactImport.completed", { defaultValue: "Importación guardada: {{count}} contactos creados.", count: receipt.created.length })}</p><p className="text-sm text-muted-foreground">{t("contactImport.skipped", { defaultValue: "Se conservaron {{existing}} existentes y se omitieron {{duplicates}} filas repetidas.", existing: receipt.skippedExisting, duplicates: receipt.skippedInFile })}</p><Link className="text-primary underline" to="/customers/contacts">{t("contactImport.openContacts", { defaultValue: "Ver contactos" })}</Link></div> : preview && <div className="flex flex-col gap-3">
          <p className="text-sm">{t("contactImport.summary", { defaultValue: "Crear: {{create}} · existentes: {{existing}} · repetidos: {{duplicate}} · inválidos: {{invalid}}", create: preview.counts.create, existing: preview.counts.existing, duplicate: preview.counts.duplicate_in_file, invalid: preview.counts.invalid })}</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">{t("contactImport.row", { defaultValue: "Fila" })}</th><th className="p-2">{t("contactImport.contact", { defaultValue: "Contacto" })}</th><th className="p-2">{t("contactImport.result", { defaultValue: "Resultado" })}</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.row} className="border-t"><td className="p-2">{row.row}</td><td className="p-2">{row.displayName}<p className="text-muted-foreground">{row.email ?? row.phone}</p></td><td className="p-2">{t(`contactImport.states.${row.status}`, { defaultValue: row.status === "create" ? "Se creará" : row.status === "existing" ? "Ya existe" : row.status === "duplicate_in_file" ? "Repetido" : "Inválido" })}{row.reason && <p className="text-muted-foreground">{row.reason}</p>}</td></tr>)}</tbody></table></div>
        </div>}
        <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={busy} onClick={() => change("")}>{t("contactImport.clear", { defaultValue: "Nuevo lote" })}</Button>{!receipt && (preview ? <Button disabled={busy || preview.counts.invalid > 0} onClick={() => void commit()}>{t("contactImport.confirm", { defaultValue: "Confirmar importación" })}</Button> : <Button disabled={busy || !csv.trim()} onClick={() => void review()}>{t("contactImport.preview", { defaultValue: "Revisar antes de importar" })}</Button>)}</div>
      </CardContent></Card>
  </section>;
}
