import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestPortableCatalogPreview, type PortableCatalogPreviewResponse } from "./api";
import { portablePackageSchema, type PortablePackage } from "@paperclipai/shared/productization/portable-package";

const MAX_PACKAGE_BYTES = 1_048_576;

export interface PortablePackagePreviewPanelProps {
  companyId: string;
  onSelectProfile?: (selection: {
    portablePackage: PortablePackage;
    teamId: string;
    profile: PortablePackage["teams"][number]["members"][number];
  }) => void;
}

function translated(t: TFunction, key: string, value: string) {
  return t(`productization.catalog.${key}`, { defaultValue: value });
}

export function PortablePackagePreviewPanel(props: PortablePackagePreviewPanelProps) {
  return <PortablePackagePreviewPanelContent key={props.companyId} {...props} />;
}

function PortablePackagePreviewPanelContent({ companyId, onSelectProfile }: PortablePackagePreviewPanelProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedPackage, setParsedPackage] = useState<PortablePackage | null>(null);
  const [result, setResult] = useState<PortableCatalogPreviewResponse | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const fileReadVersionRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fileReadVersionRef.current += 1;
      requestRef.current?.abort();
    };
  }, []);

  function updateSource(value: string) {
    fileReadVersionRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setSource(value);
    setLoading(false);
    setError(null);
    setResult(null);
    setParsedPackage(null);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    updateSource("");
    const readVersion = fileReadVersionRef.current;
    if (file.size > MAX_PACKAGE_BYTES) {
      setError(translated(t, "fileTooLarge", "El archivo supera el límite de 1 MiB."));
      return;
    }
    void file.text().then((value) => {
      if (mountedRef.current && fileReadVersionRef.current === readVersion) updateSource(value);
    }).catch(() => {
      if (mountedRef.current && fileReadVersionRef.current === readVersion) {
        setError(translated(t, "fileReadError", "No se pudo leer el archivo."));
      }
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setParsedPackage(null);
    setLoading(false);
    requestRef.current?.abort();
    let json: unknown;
    try {
      if (new TextEncoder().encode(source).byteLength > MAX_PACKAGE_BYTES) throw new Error("size");
      json = JSON.parse(source);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "size"
        ? translated(t, "inputTooLarge", "El JSON del paquete supera el límite de 1 MiB.")
        : translated(t, "invalidJson", "Introduce un paquete JSON válido."));
      return;
    }
    const validated = portablePackageSchema.safeParse(json);
    if (!validated.success) {
      setError(translated(t, "invalidPackage", "Este JSON no cumple el formato de paquete portátil."));
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const preview = await requestPortableCatalogPreview(companyId, validated.data, controller.signal);
      if (controller.signal.aborted || !mountedRef.current) return;
      setParsedPackage(validated.data);
      setResult(preview);
    } catch (cause) {
      if (!controller.signal.aborted && mountedRef.current) setError(cause instanceof Error ? cause.message : translated(t, "requestError", "No se pudo preparar la vista previa."));
    } finally {
      if (!controller.signal.aborted && mountedRef.current) setLoading(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  const profileByKey = new Map((parsedPackage?.teams ?? []).flatMap((team) => team.members.map((profile) => [
    `${team.id}/${profile.id}`,
    { teamId: team.id, profile },
  ] as const)));

  return (
    <Card>
      <CardHeader>
          <CardTitle>{translated(t, "title", "Vista previa del paquete portátil")}</CardTitle>
          <CardDescription>{translated(t, "description", "Revisa el paquete antes de preparar un borrador de importación para esta empresa.")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="portable-package-json">{translated(t, "jsonLabel", "JSON del paquete")}</Label>
            <Textarea id="portable-package-json" value={source} onChange={(event) => updateSource(event.target.value)} rows={8} maxLength={MAX_PACKAGE_BYTES} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="portable-package-file">{translated(t, "fileLabel", "O selecciona un archivo JSON local (máx. 1 MiB)")}</Label>
            <Input id="portable-package-file" type="file" accept="application/json,.json" onChange={onFileChange} />
          </div>
          <p className="text-muted-foreground text-sm" role="note">
            {translated(t, "privacyNote", "Revisa el texto antes de enviarlo y elimina datos sensibles. El esquema no puede garantizar que no haya información sensible.")}
          </p>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => updateSource("")}>{translated(t, "clear", "Borrar")}</Button>
            <Button type="submit" disabled={loading || !source.trim()}>
              {loading ? translated(t, "loading", "Preparando vista previa…") : translated(t, "preview", "Preparar vista previa")}
            </Button>
          </div>
        </form>

        {error && <div className="text-destructive text-sm" role="alert">{error}</div>}

        {result && (
          <section className="grid gap-4" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{result.package.name}</h3>
              <Badge variant={result.compatible ? "secondary" : "outline"}>
                {result.compatible ? translated(t, "compatible", "Subconjunto compatible") : translated(t, "partial", "Compatibilidad parcial")}
              </Badge>
              <span className="text-muted-foreground text-sm">{result.package.packageKey}@{result.package.packageVersion}</span>
            </div>

            {result.incompatibilities.length > 0 && (
              <div className="grid gap-2" role="alert">
                <h4 className="font-medium">{translated(t, "incompatibilities", "Incompatibilidades")}</h4>
                <ul className="list-disc pl-5 text-sm">
                  {result.incompatibilities.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {result.requirements.length > 0 && (
              <div className="grid gap-2">
                <h4 className="font-medium">{translated(t, "skillRequirements", "Requisitos de skills de catálogo (no instalados)")}</h4>
                <ul className="grid gap-1 text-sm">
                  {result.requirements.map((item) => (
                    <li key={`${item.key}@${item.version}`} className="flex flex-wrap items-center gap-2">
                      <span>{item.key}@{item.version}</span>
                      <Badge variant={item.status === "resolved" ? "secondary" : "outline"}>{item.status === "resolved" ? translated(t, "resolved", "resuelto") : translated(t, "unavailable", "no disponible")}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.portabilityPreview && (
              <div className="grid gap-2">
                <h4 className="font-medium">{translated(t, "diff", "Vista previa de importación")}</h4>
                <ul className="grid gap-1 text-sm">
                  {result.portabilityPreview.plan.agentPlans.map((item) => (
                    <li key={item.slug} className="flex flex-wrap items-center gap-2">
                      <span>{item.plannedName}</span>
                      <Badge variant="outline">{item.action}</Badge>
                    </li>
                  ))}
                </ul>
                {result.portabilityPreview.errors.length > 0 && <ul className="text-destructive grid gap-1 text-sm" role="alert">{result.portabilityPreview.errors.map((item) => <li key={item}>{item}</li>)}</ul>}
                {result.portabilityPreview.warnings.length > 0 && <ul className="text-muted-foreground grid gap-1 text-sm">{result.portabilityPreview.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
              </div>
            )}

            {onSelectProfile && parsedPackage && result.portabilityPreview && result.portabilityPreview.errors.length === 0 && result.mapping.map((mapped) => {
              const selected = profileByKey.get(`${mapped.teamId}/${mapped.memberId}`);
              if (!selected) return null;
              return (
                <div key={`${mapped.teamId}/${mapped.memberId}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{mapped.title} · {mapped.role}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => onSelectProfile({ portablePackage: parsedPackage, teamId: selected.teamId, profile: selected.profile })}>
                    {translated(t, "selectProfile", "Seleccionar perfil")}
                  </Button>
                </div>
              );
            })}
            <p className="text-muted-foreground text-sm" role="note">
              {translated(t, "draftOnly", "Esta vista previa no instala ni activa perfiles, no concede permisos y no crea conexiones ni credenciales.")}
            </p>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
