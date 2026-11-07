import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BuilderSelection } from "@paperclipai/shared/productization/description-builder";
import { toolsApi } from "@/api/tools";
import { productOnboardingApi } from "@/features/productization/onboarding/api";
import { useCompany } from "@/context/CompanyContext";
import { useNavigate } from "@/lib/router";
import { companySkillsApi } from "@/api/companySkills";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/i18n";
import { TEAM_WORKSPACE_PATHS, TemplateLibraryNav } from "@/components/team-workspace/TeamWorkspaceLinks";
import { businessBuilderApi } from "@/features/productization/builder/api";
import { DailySummaryAssistant } from "@/features/productization/builder/DailySummaryAssistant";
import { ConfigCopilot } from "@/features/productization/builder/ConfigCopilot";

const queryKey = (companyId: string) => ["productization", "builder", companyId] as const;

export function BusinessBuilder() {
  const { selectedCompanyId, loading } = useCompany();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [role, setRole] = useState("");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [autonomy, setAutonomy] = useState<BuilderSelection["autonomy"]>("draft_only");
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState("0");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [scrapeAgentId, setScrapeAgentId] = useState("");
  const [scrapeSuggestion, setScrapeSuggestion] = useState("");
  const [scrapeError, setScrapeError] = useState("");
  const [pendingScrape, setPendingScrape] = useState<{ connectionId: string; actionRequestId: string } | null>(null);
  const [compareTarget, setCompareTarget] = useState("");
  const [error, setError] = useState("");

  const onboarding = useQuery({
    queryKey: queryKey(selectedCompanyId ?? "none"),
    queryFn: ({ signal }) => selectedCompanyId ? businessBuilderApi.onboarding(selectedCompanyId, signal) : Promise.reject(new Error("Selecciona una empresa.")),
    enabled: Boolean(selectedCompanyId), retry: false,
  });
  const skills = useQuery({ queryKey: ["company-skills", selectedCompanyId], queryFn: () => selectedCompanyId ? companySkillsApi.list(selectedCompanyId) : Promise.resolve([]), enabled: Boolean(selectedCompanyId) });
  const connections = useQuery({ queryKey: ["productization", "builder", "connections", selectedCompanyId], queryFn: () => selectedCompanyId ? businessBuilderApi.connections(selectedCompanyId) : Promise.resolve({ connections: [], serverNow: "" }), enabled: Boolean(selectedCompanyId) });
  const extraction = useQuery({ queryKey: ["productization", "builder", "extraction", selectedCompanyId], queryFn: () => selectedCompanyId ? businessBuilderApi.extractionAvailability(selectedCompanyId) : Promise.reject(new Error("Selecciona una empresa.")), enabled: Boolean(selectedCompanyId) });
  const firecrawlConnectionId = extraction.data?.connectionId ?? "";
  const firecrawlCatalog = useQuery({ queryKey: ["productization", "builder", "firecrawl-catalog", firecrawlConnectionId], queryFn: () => toolsApi.listCatalog(firecrawlConnectionId), enabled: Boolean(firecrawlConnectionId && extraction.data?.canExtract) });
  const firecrawlAgents = useQuery({ queryKey: ["productization", "builder", "firecrawl-agents", firecrawlConnectionId], queryFn: () => toolsApi.listTestAgents(firecrawlConnectionId), enabled: Boolean(firecrawlConnectionId && extraction.data?.canExtract) });
  const firecrawlScrapeTool = firecrawlCatalog.data?.catalog.find((entry) => entry.entryKind === "tool" && entry.status === "active" && entry.isReadOnly && !entry.isWrite && !entry.isDestructive && /scrape/i.test(entry.toolName) && hasUrlArgument(entry.inputSchema));
  const pendingScrapeQuery = useQuery({
    queryKey: ["productization", "builder", "firecrawl-call", pendingScrape?.connectionId, pendingScrape?.actionRequestId],
    queryFn: () => pendingScrape ? toolsApi.getTestCallStatus(pendingScrape.connectionId, pendingScrape.actionRequestId) : Promise.reject(new Error("No hay una llamada pendiente.")),
    enabled: Boolean(pendingScrape), refetchInterval: (query) => {
      const phase = query.state.data?.phase;
      return phase === "waiting" || phase === "running" ? 2000 : false;
    },
  });
  const snapshot = onboarding.data;
  useEffect(() => {
    setDraftId(null);
    setVersion(1);
    setDescription("");
    setRole("");
    setSkillIds([]);
    setConnectionIds([]);
    setAutonomy("draft_only");
    setMonthlyBudgetUsd("0");
    setSourceUrl("");
    setScrapeAgentId("");
    setPendingScrape(null);
    setScrapeSuggestion("");
    setCompareTarget("");
    setError("");
    setScrapeError("");
  }, [selectedCompanyId]);
  useEffect(() => {
    if (snapshot?.journey.business?.url) setSourceUrl(snapshot.journey.business.url);
  }, [snapshot?.journey.business?.url]);
  const drafts = snapshot?.journey.builderDrafts ?? [];
  const selectedDraft = draftId ? drafts.find((draft) => draft.id === draftId) : undefined;
  const selectedVersion = selectedDraft?.versions.find((entry) => entry.version === version) ?? selectedDraft?.versions.at(-1);
  const versionOptions = useMemo(() => drafts.flatMap((draft) => draft.versions.map((entry) => ({ value: `${draft.id}:${entry.version}`, label: `${draft.id.slice(0, 8)} · v${entry.version}` }))), [drafts]);

  const saveDraft = useMutation({
    mutationFn: () => {
      if (!selectedCompanyId || !snapshot) throw new Error("El recorrido del negocio todavía no está disponible.");
      return businessBuilderApi.save(selectedCompanyId, { expectedRevision: snapshot.revision, ...(draftId ? { draftId } : {}), description, selection: { role, skillIds, connectionIds, autonomy, monthlyBudgetUsd: Number(monthlyBudgetUsd) } });
    },
    onSuccess: (result) => {
      setDraftId(result.draftId);
      setVersion(result.version);
      setError("");
      void queryClient.invalidateQueries({ queryKey: queryKey(selectedCompanyId ?? "none") });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo guardar el borrador."),
  });
  const saveUrl = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !snapshot || !sourceUrl.trim()) throw new Error("Introduce una URL antes de guardarla.");
      const response = await productOnboardingApi.recordEvent(selectedCompanyId, { expectedRevision: snapshot.revision, event: { type: "business_suggestion_recorded", url: sourceUrl.trim() } });
      if (!response.result.accepted) throw new Error("El recorrido ya no admite guardar esta URL. Actualízalo para revisar el estado actual.");
      return response;
    }, onSuccess: () => { setError(""); void queryClient.invalidateQueries({ queryKey: queryKey(selectedCompanyId ?? "none") }); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo guardar la URL."),
  });
  const cloneDraft = useMutation({
    mutationFn: () => {
      if (!selectedCompanyId || !snapshot || !selectedDraft) throw new Error("Elige un borrador para clonar.");
      return businessBuilderApi.clone(selectedCompanyId, selectedDraft.id, { expectedRevision: snapshot.revision, sourceVersion: selectedVersion?.version ?? 1 });
    },
    onSuccess: (result) => { setDraftId(result.draftId); setVersion(1); setDescription(selectedVersion?.description ?? ""); setRole(selectedVersion?.selection.role ?? ""); setSkillIds(selectedVersion?.selection.skillIds ?? []); setConnectionIds(selectedVersion?.selection.connectionIds ?? []); setAutonomy(selectedVersion?.selection.autonomy ?? "draft_only"); setMonthlyBudgetUsd(String(selectedVersion?.selection.monthlyBudgetUsd ?? 0)); void queryClient.invalidateQueries({ queryKey: queryKey(selectedCompanyId ?? "none") }); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo clonar el borrador."),
  });
  const preview = useMutation({
    mutationFn: () => {
      if (!selectedCompanyId || !snapshot || !selectedDraft || !selectedVersion) throw new Error("Guarda primero una versión del borrador.");
      return businessBuilderApi.configurationPreview(selectedCompanyId, { expectedRevision: snapshot.revision, draftId: selectedDraft.id, version: selectedVersion.version });
    }, onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo revisar la configuración."),
  });
  const compare = useMutation({
    mutationFn: () => {
      if (!selectedCompanyId || !selectedDraft || !selectedVersion || !compareTarget) throw new Error("Elige dos versiones para comparar.");
      const [rightDraftId, rawVersion] = compareTarget.split(":");
      return businessBuilderApi.compare(selectedCompanyId, { leftDraftId: selectedDraft.id, leftVersion: selectedVersion.version, rightDraftId: rightDraftId!, rightVersion: Number(rawVersion) });
    }, onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudieron comparar las versiones."),
  });
  const scrape = useMutation({
    mutationFn: async () => {
      if (!firecrawlConnectionId || !extraction.data?.canExtract) throw new Error("Firecrawl aún no está disponible para esta persona.");
      if (!scrapeAgentId) throw new Error("Elige primero un agente que tenga acceso a esta conexión.");
      const parsed = parsePublicUrl(sourceUrl);
      if (!parsed.ok) throw new Error(parsed.message);
      const tool = firecrawlScrapeTool;
      if (!tool) throw new Error("No hay una herramienta Firecrawl de scrape de solo lectura con un parámetro URL registrado. Actualiza el catálogo en Apps.");
      return toolsApi.runTestCall(firecrawlConnectionId, { agentId: scrapeAgentId, toolName: tool.toolName, parameters: { url: parsed.url } });
    },
    onSuccess: (result) => {
      setScrapeError("");
      if (result.decision === "allowed" && result.result !== undefined) setScrapeSuggestion(extractSuggestionText(result.result));
      else if (result.decision === "ask_first" && result.actionRequestId) setPendingScrape({ connectionId: firecrawlConnectionId, actionRequestId: result.actionRequestId });
      else setScrapeError(result.error?.message ?? "La política de herramientas no permitió esta llamada.");
    },
    onError: (cause) => setScrapeError(cause instanceof Error ? cause.message : "No se pudo consultar Firecrawl."),
  });

  useEffect(() => {
    const result = pendingScrapeQuery.data;
    if (!result) return;
    if (result.phase === "done" && result.result !== undefined) {
      setScrapeSuggestion(extractSuggestionText(result.result));
      setPendingScrape(null);
    } else if (result.phase === "done") {
      setScrapeError(result.error?.message ?? "Firecrawl terminó la llamada sin contenido para mostrar.");
      setPendingScrape(null);
    } else if (result.phase === "denied" || result.phase === "cancelled" || result.phase === "expired") {
      setScrapeError(result.error?.message ?? `La solicitud de scrape terminó: ${result.phase}.`);
      setPendingScrape(null);
    }
  }, [pendingScrapeQuery.data]);
  useEffect(() => {
    if (!pendingScrape || !pendingScrapeQuery.error) return;
    setScrapeError(pendingScrapeQuery.error.message);
    setPendingScrape(null);
  }, [pendingScrape, pendingScrapeQuery.error]);

  function toggle(list: string[], setList: (next: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }
  function openVersion(value: string) {
    const [id, rawVersion] = value.split(":");
    const found = drafts.find((item) => item.id === id)?.versions.find((item) => item.version === Number(rawVersion));
    if (!id || !found) return;
    setDraftId(id); setVersion(found.version); setDescription(found.description); setRole(found.selection.role); setSkillIds(found.selection.skillIds); setConnectionIds(found.selection.connectionIds); setAutonomy(found.selection.autonomy); setMonthlyBudgetUsd(String(found.selection.monthlyBudgetUsd));
  }

  if (loading) return <p role="status" className="text-sm text-muted-foreground">{t("productization.loadingCompany", { defaultValue: "Cargando empresa…" })}</p>;
  if (!selectedCompanyId) return <p className="text-sm text-muted-foreground">{t("productization.chooseCompany", { defaultValue: "Selecciona una empresa para continuar." })}</p>;
  if (onboarding.isLoading) return <p role="status" className="text-sm text-muted-foreground">Cargando el recorrido de negocio…</p>;
  if (onboarding.isError) return <Card><CardHeader><CardTitle>Empieza por la puesta en marcha</CardTitle><CardDescription>Este constructor guarda sus versiones en el recorrido existente de la empresa.</CardDescription></CardHeader><CardContent><Button type="button" onClick={() => navigate("/productization")}>Abrir puesta en marcha</Button></CardContent></Card>;

  return <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
    <TemplateLibraryNav current="builder" />
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{t("uxTeam.builder.title", { defaultValue: "Editor de configuración avanzada" })}</h1>
      <p className="text-sm text-muted-foreground">{t("uxTeam.builder.description", { defaultValue: "Describe el trabajo y guarda borradores versionados de la configuración del equipo. Sin un proveedor de generación conectado, el texto y la configuración son aportados por ti." })}</p>
      <p className="text-sm text-muted-foreground">{t("uxTeam.builder.notHiring", { defaultValue: "Este editor solo guarda borradores: no crea agentes ni da permisos. Para elegir una plantilla y contratar, usa la preparación del equipo." })}</p>
    </header>

    {snapshot && <ConfigCopilot companyId={selectedCompanyId} />}
    {snapshot && <DailySummaryAssistant companyId={selectedCompanyId} snapshot={snapshot} />}

    <Card><CardHeader><CardTitle>Descripción y selección humana</CardTitle><CardDescription>Los cambios guardan una nueva versión; guardar no contrata ni otorga permisos.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
      <div className="flex flex-col gap-2"><Label htmlFor="builder-description">¿Qué quieres que haga el negocio?</Label><Textarea id="builder-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={5} placeholder="Describe el cliente, la oferta y el trabajo que necesita tu equipo." /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2"><Label htmlFor="builder-role">Rol</Label><Input id="builder-role" value={role} onChange={(event) => setRole(event.target.value)} maxLength={120} placeholder="Ej. responsable de ventas" /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="builder-budget">Presupuesto mensual solicitado (USD)</Label><Input id="builder-budget" type="number" min="0" max="1000000" step="0.01" value={monthlyBudgetUsd} onChange={(event) => setMonthlyBudgetUsd(event.target.value)} /></div>
      </div>
      <div className="flex flex-col gap-2"><Label htmlFor="builder-autonomy">Autonomía solicitada</Label><select id="builder-autonomy" className="h-9 rounded-md border bg-background px-3 text-sm" value={autonomy} onChange={(event) => setAutonomy(event.target.value as BuilderSelection["autonomy"])}><option value="draft_only">Solo borradores</option><option value="send_with_approval">Enviar con aprobación</option><option value="send_direct">Enviar directamente</option></select><p className="text-sm text-muted-foreground">Se guarda como propuesta. La autorización efectiva conserva las reglas actuales de Paperclip.</p></div>
      <fieldset className="flex flex-col gap-2"><legend className="text-sm font-medium">Skills disponibles para esta empresa</legend>{skills.isLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando skills…</p> : skills.isError ? <p role="alert" className="text-sm text-destructive">No se pudo cargar el catálogo de skills.</p> : skills.data?.length ? skills.data.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={skillIds.includes(skill.id)} onChange={() => toggle(skillIds, setSkillIds, skill.id)} />{skill.name}<span className="text-muted-foreground">({skill.compatibility})</span></label>) : <p className="text-sm text-muted-foreground">No hay skills instaladas para seleccionar.</p>}</fieldset>
      <fieldset className="flex flex-col gap-2"><legend className="text-sm font-medium">Conexiones de la empresa</legend>{connections.isLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando conexiones…</p> : connections.data?.connections.length ? connections.data.connections.map((connection) => <label key={connection.id} className="flex flex-wrap items-center gap-2 text-sm"><input type="checkbox" disabled={connection.stage === "available"} checked={connectionIds.includes(connection.id)} onChange={() => toggle(connectionIds, setConnectionIds, connection.id)} />{connection.applicationName}: {connection.name}<Badge variant={connection.stage === "checked" ? "secondary" : "outline"}>{connection.stage}{connection.checkedAt ? ` · ${new Date(connection.checkedAt).toLocaleString()}` : ""}</Badge>{connection.stage !== "checked" && <button type="button" className="text-primary underline" onClick={() => navigate(connection.reconnectPath)}>Revisar en Apps</button>}</label>) : <p className="text-sm text-muted-foreground">No hay conexiones guardadas en Apps.</p>}</fieldset>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={saveDraft.isPending || !description.trim() || !role.trim() || !Number.isFinite(Number(monthlyBudgetUsd)) || Number(monthlyBudgetUsd) < 0 || Number(monthlyBudgetUsd) > 1_000_000} onClick={() => { setError(""); saveDraft.mutate(); }}>{saveDraft.isPending ? "Guardando…" : draftId ? "Guardar nueva versión" : "Guardar borrador"}</Button>{draftId && <Button type="button" variant="outline" disabled={cloneDraft.isPending} onClick={() => cloneDraft.mutate()}>Clonar versión seleccionada</Button>}{draftId && <Button type="button" variant="outline" disabled={preview.isPending} onClick={() => preview.mutate()}>{preview.isPending ? "Revisando…" : "Revisar configuración"}</Button>}<Button type="button" variant="outline" onClick={() => { setDraftId(null); setVersion(1); setDescription(""); setRole(""); setSkillIds([]); setConnectionIds([]); setAutonomy("draft_only"); setMonthlyBudgetUsd("0"); }}>Nuevo borrador</Button></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent></Card>

    {drafts.length > 0 && <Card><CardHeader><CardTitle>Versiones guardadas</CardTitle><CardDescription>Las versiones conservan el texto y las selecciones humanas con control de revisión del servidor.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><label htmlFor="builder-version" className="text-sm font-medium">Borrador y versión</label><select id="builder-version" className="h-9 rounded-md border bg-background px-3 text-sm" value={selectedDraft && selectedVersion ? `${selectedDraft.id}:${selectedVersion.version}` : ""} onChange={(event) => openVersion(event.target.value)}><option value="">Elige una versión guardada</option>{versionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><div className="flex flex-wrap items-center gap-2">{drafts.map((draft) => <Badge key={draft.id} variant="outline">{draft.id.slice(0, 8)} · {draft.versions.length} versión(es)</Badge>)}</div>{selectedDraft && selectedVersion && versionOptions.length > 1 && <div className="flex flex-wrap items-center gap-2"><label htmlFor="builder-compare" className="text-sm font-medium">Comparar con</label><select id="builder-compare" className="h-9 rounded-md border bg-background px-3 text-sm" value={compareTarget} onChange={(event) => setCompareTarget(event.target.value)}><option value="">Elige otra versión</option>{versionOptions.filter((option) => option.value !== `${selectedDraft.id}:${selectedVersion.version}`).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Button type="button" variant="outline" disabled={!compareTarget || compare.isPending} onClick={() => compare.mutate()}>Comparar versiones</Button></div>}{compare.data && <p role="status" className="text-sm">Cambios: {Object.entries(compare.data.changes).filter(([, changed]) => changed).map(([key]) => key).join(", ") || "sin diferencias"}.</p>}</CardContent></Card>}

    {preview.data && <Card><CardHeader><CardTitle>Vista previa de configuración</CardTitle><CardDescription>Solo validó registros existentes. No se creó un agente, no se aplicaron permisos ni autonomía y no comenzó una ejecución.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2"><p className="text-sm">Conexiones autorizadas: {preview.data.checks.authorizedConnections} de {preview.data.checks.selectedConnections}. Presupuesto solicitado: ${preview.data.checks.requestedMonthlyBudgetUsd}/mes; aún no aplicado.</p><p className="text-sm text-muted-foreground">La prueba real de autonomía se ejecuta por separado sobre datos existentes y casos del banco.</p></CardContent></Card>}

    <Card><CardHeader><CardTitle>URL y sugerencias de negocio</CardTitle><CardDescription>La URL se guarda en el recorrido. La extracción invoca una herramienta Firecrawl de solo lectura seleccionada del catálogo y pasa por la autoridad y política existentes de Tool Gateway.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><Label htmlFor="builder-source-url">Sitio público del negocio</Label><Input id="builder-source-url" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com" /><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={saveUrl.isPending || !sourceUrl.trim()} onClick={() => saveUrl.mutate()}>{saveUrl.isPending ? "Guardando URL…" : "Guardar URL para el recorrido"}</Button><p className="text-sm">Estado Firecrawl: {extraction.data?.status ?? "consultando"}. {extraction.data?.reason}</p></div>{extraction.data?.connectionId && !extraction.data.canExtract && <Button type="button" variant="outline" onClick={() => navigate(`/apps/${encodeURIComponent(extraction.data!.connectionId!)}/permissions`)}>Revisar conexión Firecrawl</Button>}{!extraction.data?.connectionId && <Button type="button" variant="outline" onClick={() => navigate("/apps")}>Abrir Apps</Button>}{extraction.data?.canExtract && <div className="flex flex-col gap-3 rounded-md border p-3"><p className="text-sm">La llamada scrape es una acción aparte: puede pedir aprobación y consumir cuota Firecrawl. Vista previa de configuración nunca ejecuta esta llamada.</p><div className="grid gap-3 md:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="firecrawl-agent">Agente con acceso a Firecrawl</Label><select id="firecrawl-agent" className="h-9 rounded-md border bg-background px-3 text-sm" value={scrapeAgentId} onChange={(event) => setScrapeAgentId(event.target.value)}><option value="">Elige un agente</option>{firecrawlAgents.data?.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.title ? ` · ${agent.title}` : ""}</option>)}</select></div></div><Button type="button" variant="outline" disabled={!scrapeAgentId || !sourceUrl.trim() || !firecrawlScrapeTool || scrape.isPending} onClick={() => scrape.mutate()}>{scrape.isPending ? "Consultando Firecrawl…" : "Extraer sugerencias"}</Button>{firecrawlCatalog.data && !firecrawlScrapeTool && <p className="text-sm text-muted-foreground">No hay una herramienta scrape de solo lectura con argumento URL en el catálogo actual. Actualiza el catálogo en Apps para volver a consultarlo.</p>}{firecrawlAgents.data?.agents.length === 0 && <p className="text-sm text-muted-foreground">No hay agentes con permiso para probar esta conexión bajo el usuario actual.</p>}{scrapeError && <p role="alert" className="text-sm text-destructive">{scrapeError}</p>}{pendingScrape && <div className="flex flex-wrap items-center gap-2"><p role="status" className="text-sm text-muted-foreground">Tool Gateway espera una aprobación en la revisión de herramientas.</p><Button type="button" variant="outline" onClick={() => navigate(`/apps/${encodeURIComponent(pendingScrape.connectionId)}/permissions`)}>Revisar solicitud</Button></div>}{scrapeSuggestion && <div className="flex flex-col gap-2"><p className="text-sm font-medium">Texto devuelto por el sitio, tratado como sugerencia sin verificar</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border p-3 text-sm">{scrapeSuggestion}</pre><Button type="button" variant="outline" onClick={() => { setDescription(scrapeSuggestion.slice(0, 4000)); setScrapeSuggestion(""); }}>Revisar este texto en la descripción</Button></div>}</div>}</CardContent></Card>

    <Card><CardHeader><CardTitle>{t("uxTeam.builder.autonomyTitle", { defaultValue: "Evaluación de autonomía" })}</CardTitle><CardDescription>{t("uxTeam.builder.autonomyMoved", { defaultValue: "El banco de pruebas se ejecuta por agente y tipo de acción en Autonomía, donde también se ven sus resultados y se concede o revoca la autonomía." })}</CardDescription></CardHeader><CardContent><Button type="button" variant="outline" onClick={() => navigate("/autonomy")}>{t("uxTeam.builder.openAutonomy", { defaultValue: "Abrir Autonomía" })}</Button></CardContent></Card>

    <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="ghost" onClick={() => navigate(TEAM_WORKSPACE_PATHS.preparation)}>{t("uxTeam.builder.backToPreparation", { defaultValue: "Volver a la preparación" })}</Button><Button type="button" onClick={() => navigate(TEAM_WORKSPACE_PATHS.createTeam)}>{t("uxTeam.builder.reviewAndHire", { defaultValue: "Elegir plantilla y contratar" })}</Button></div>
  </section>;
}

function parsePublicUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  try {
    const url = new URL(raw.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return { ok: false, message: "Usa una URL HTTP(S) pública sin credenciales." };
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isIpv6 = host.includes(":");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "::1" || host === "::" || (isIpv6 && (/^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host) || /^ff/i.test(host)))) return { ok: false, message: "No se permiten destinos locales o de red privada." };
    const octets = host.split(".").map(Number);
    if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
      const [first, second] = octets;
      if (first === 0 || first === 10 || first === 127 || first >= 224 || (first === 169 && second === 254) || (first === 172 && second! >= 16 && second! <= 31) || (first === 192 && second === 168)) return { ok: false, message: "No se permiten destinos locales o de red privada." };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, message: "Introduce una URL HTTP(S) válida." };
  }
}

function hasUrlArgument(schema: Record<string, unknown> | null): boolean {
  if (!schema || typeof schema !== "object" || !schema.properties || typeof schema.properties !== "object") return false;
  const url = (schema.properties as Record<string, unknown>).url;
  return Boolean(url && typeof url === "object" && (!("type" in url) || (url as { type?: unknown }).type === "string"));
}

function extractSuggestionText(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 8000);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const structured = record.structuredContent && typeof record.structuredContent === "object" && !Array.isArray(record.structuredContent)
      ? record.structuredContent as Record<string, unknown>
      : record;
    for (const key of ["markdown", "content", "text", "description"]) {
      const candidate = structured[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.slice(0, 8000);
    }
    if (Array.isArray(record.content)) {
      const text = record.content.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string" ? [(item as Record<string, string>).text] : []).join("\n");
      if (text.trim()) return text.slice(0, 8000);
    }
  }
  return (JSON.stringify(value, null, 2) ?? String(value)).slice(0, 8000);
}
