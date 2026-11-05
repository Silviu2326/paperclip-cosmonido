import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowUpRight, Bot, GitBranch, Pause, Play, Plus, Sparkles } from "lucide-react";
import { autopilotConfigSchema, getConnectableAppDefinition, type Agent, type AutopilotConfig, type AutopilotStatus, type Project, type ProjectAutopilot } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { autopilotApi } from "../api/autopilot";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";

const statusLabels: Record<AutopilotStatus, string> = {
  idle: "Preparando el siguiente paso", planning: "Explorando oportunidades", awaiting_selection: "Tres planes para elegir",
  implementing: "Construyendo la mejora", reviewing: "Revisión independiente", verifying: "Comprobando despliegues",
  waiting_capacity: "Esperando disponibilidad", blocked: "Necesita tu atención", completed: "Ciclo completado",
};
const planLabels = { essential: "Esencial", balanced: "Equilibrado", ambitious: "Ambicioso" };
const riskLabels = { low: "Bajo", medium: "Medio", high: "Alto" };
const fieldClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function ProjectAutopilotPanel({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const key = ["project-autopilot", project.companyId, project.id];
  const query = useQuery({ queryKey: key, queryFn: () => autopilotApi.get(project.id), refetchInterval: 15000 });
  const agents = useQuery({ queryKey: queryKeys.agents.list(project.companyId), queryFn: () => agentsApi.list(project.companyId) });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [repositoryUrls, setRepositoryUrls] = useState("");
  const [notice, setNotice] = useState("");
  const mutation = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: key }); void queryClient.invalidateQueries({ queryKey: ["projects", "detail"] }); },
  });
  const row = query.data;
  const state = row?.state;
  const taskLink = state?.activeIssueId ? `/issues/${state.activeIssueId}` : null;
  async function attachRepositories() {
    const urls = repositoryUrls.split(/\s+/).filter(Boolean).map(value => {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.search || url.hash
        || !/^\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(url.pathname)) throw new Error("Introduce URLs de repositorios de GitHub, una por línea.");
      return value.replace(/\/$/, "").replace(/\.git$/, "");
    });
    if (!urls.length) throw new Error("Añade al menos un repositorio.");
    const unique = [...new Set(urls)].filter(url => !project.workspaces.some(workspace => workspace.repoUrl?.replace(/\.git$/, "") === url));
    for (const url of unique) await projectsApi.createWorkspace(project.id, { name: new URL(url).pathname.slice(1), sourceType: "git_repo", repoUrl: url });
    setRepositoryUrls(""); setNotice("Repositorios asociados. Los agentes los prepararán localmente al iniciar el trabajo.");
  }
  if (query.isPending) return <p className="text-sm text-muted-foreground">Cargando el centro de autonomía…</p>;
  if (query.error) return <p role="alert" className="text-sm text-destructive">{query.error.message}</p>;
  return <div className="flex flex-col gap-6">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /><CardTitle>Tu producto sigue avanzando</CardTitle></div>
          <Badge variant="outline">{row?.enabled ? "Autonomía activa" : "Autonomía en pausa"}</Badge>
        </div>
        <CardDescription>Objetivos, propuestas y entregas con pruebas. Codex y Claude trabajan mediante los agentes de tu proyecto.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-lg font-semibold">{state ? statusLabels[state.status] : "Conecta tus repositorios y define hacia dónde avanzar"}</p>
        {state?.summary ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{state.summary}</p> : null}
        {row ? <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>Ciclo {state?.cycle ?? 0}</span><span>{state?.cyclesToday ?? 0} / {row.config.maxCyclesPerDay} ciclos hoy · UTC</span>
          <span>Reserva de uso: {row.config.reservePercent}%</span>
          <span>Próxima comprobación: {new Date(row.nextTickAt).toLocaleString()}</span>
        </div> : null}
        {state?.capacity && !state.capacity.known ? <p className="text-sm text-muted-foreground">La cuota de esta cuenta no está disponible. La ejecución conserva los controles y reintentos del proveedor; la reserva no puede garantizarse sin una lectura válida.</p> : null}
        {state?.status === "waiting_capacity" && state.capacity?.retryAt ? <p className="text-sm text-muted-foreground">Reintento previsto por el proveedor: {new Date(state.capacity.retryAt).toLocaleString()}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSettingsOpen(!settingsOpen)}>{settingsOpen ? "Cerrar configuración" : "Configurar autonomía"}</Button>
          {row ? <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(() => autopilotApi.configure(project.id, { ...row.config, enabled: !row.enabled }, row.revision))}>
            {row.enabled ? <Pause className="size-4" /> : <Play className="size-4" />}{row.enabled ? "Pausar nuevos trabajos" : "Reanudar"}
          </Button> : null}
          {row?.enabled ? <Button disabled={mutation.isPending || !!state?.activeIssueId} onClick={() => mutation.mutate(() => autopilotApi.discover(project.id))}><Sparkles className="size-4" />Preparar tres planes</Button> : null}
          {taskLink ? <Button asChild variant="secondary"><Link to={taskLink}>Ver tarea en curso <ArrowUpRight className="size-4" /></Link></Button> : null}
        </div>
        {row && !row.enabled && state?.activeIssueId ? <p className="text-sm text-muted-foreground">La tarea actual puede terminar y entregar su informe. Usa Detener en la tarea para interrumpirla.</p> : null}
      </CardContent>
    </Card>
    {mutation.error ? <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p> : null}
    {(settingsOpen || !row) ? <AutopilotSettings key={project.id} project={project} row={row ?? null} agents={agents.data ?? []}
      onSave={async config => { await autopilotApi.configure(project.id, config, row?.revision); await queryClient.invalidateQueries({ queryKey: key }); setSettingsOpen(false); }} /> : null}
    <div className="grid gap-4 lg:grid-cols-3">
      {state?.plans.map(plan => <Card key={plan.id}>
        <CardHeader><div className="flex flex-wrap gap-2"><Badge variant="outline">{planLabels[plan.id]}</Badge>
          {state.recommendedPlanId === plan.id ? <Badge>Recomendado</Badge> : null}
          {state.selectedPlanId === plan.id ? <Badge variant="secondary">Seleccionado</Badge> : null}</div><CardTitle>{plan.title}</CardTitle><CardDescription>{plan.problem}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div><p className="font-medium">Qué podrías ganar</p><p className="text-muted-foreground whitespace-pre-wrap">{plan.benefit}</p></div>
          <div><p className="font-medium">Esfuerzo y riesgo</p><p className="text-muted-foreground">{plan.effort} · Riesgo {riskLabels[plan.risk]}</p></div>
          <div><p className="font-medium">Observaciones</p><ul className="list-disc pl-5 text-muted-foreground">{plan.evidence.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          <div><p className="font-medium">Cómo sabremos que funciona</p><ul className="list-disc pl-5 text-muted-foreground">{plan.acceptanceCriteria.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          <details><summary className="cursor-pointer font-medium">Pasos y supuestos</summary><ol className="list-decimal pl-5">{plan.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
            <ul className="list-disc pl-5 text-muted-foreground">{plan.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul></details>
          <Button disabled={mutation.isPending || state.status !== "awaiting_selection" || !row?.enabled} onClick={() => mutation.mutate(() => autopilotApi.select(project.id, plan.id))}>Elegir este plan</Button>
        </CardContent>
      </Card>)}
    </div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="size-4" />Repositorios del producto</CardTitle><CardDescription>Un mismo objetivo puede coordinar el frontend y el backend en repositorios diferentes.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {project.workspaces.filter(workspace => workspace.repoUrl).map(workspace => <div key={workspace.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <a href={workspace.repoUrl!} target="_blank" rel="noreferrer" className="text-primary underline">{workspace.name}</a><span className="text-muted-foreground">{workspace.repoRef || workspace.defaultRef || "Rama predeterminada"}</span>
        </div>)}
        <label className="flex flex-col gap-2 text-sm">Añadir repositorios de GitHub<Textarea value={repositoryUrls} onChange={event => setRepositoryUrls(event.target.value)} placeholder={"https://github.com/tu-cuenta/frontend\nhttps://github.com/tu-cuenta/backend"} /></label>
        <div><Button variant="outline" disabled={mutation.isPending || !repositoryUrls.trim()} onClick={() => mutation.mutate(attachRepositories)}><Plus className="size-4" />Asociar repositorios</Button></div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
        <p className="text-sm text-muted-foreground">Las credenciales y los permisos se gestionan en <Link className="text-primary underline" to="/apps">Apps</Link>. Los repositorios privados necesitan una conexión de GitHub autorizada.</p>
      </CardContent></Card>
    {state?.reports.length ? <Card><CardHeader><CardTitle>Entregas y verificaciones</CardTitle><CardDescription>Informes de los agentes con su evidencia. Cada etapa conserva su tarea e historial.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">{[...state.reports].reverse().map(report => <div key={report.issueId} className="flex flex-col gap-2 border-b border-border pb-4 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{report.outcome === "passed" ? "Etapa superada" : report.outcome === "blocked" ? "Bloqueo" : "Correcciones"}</Badge><Link className="text-primary underline" to={`/issues/${report.issueId}`}>Abrir tarea</Link><span className="text-muted-foreground">{new Date(report.at).toLocaleString()}</span></div>
        <p>{report.summary}</p>{report.evidence.map((item, i) => <p key={i} className="text-muted-foreground"><strong>{item.label}:</strong> {item.detail} {item.url ? <a className="text-primary underline" href={item.url} target="_blank" rel="noreferrer">Ver evidencia</a> : null}</p>)}
        {report.commits.map(commit => <p key={commit.workspaceId} className="font-mono text-xs break-all">{commit.branch} · {commit.sha}</p>)}
        {report.deployments.map(deployment => <a key={`${deployment.provider}:${deployment.deploymentRef}`} href={deployment.url} target="_blank" rel="noreferrer" className="text-primary underline">{deployment.provider} · {deployment.environment} · {deployment.status} · Salud: {deployment.health}</a>)}
      </div>)}</CardContent></Card> : null}
    {row ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-4" />Dale dirección</CardTitle><CardDescription>Guarda preferencias y aprendizajes para los próximos trabajos. Para cambiar una tarea activa, escribe en su conversación.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3"><Textarea aria-label="Preferencias del producto" value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Prioriza mejoras que ahorren tiempo al personal. Conserva el estilo actual…" />
        <div><Button variant="outline" disabled={mutation.isPending || !feedback.trim()} onClick={() => mutation.mutate(async () => { await autopilotApi.feedback(project.id, feedback); setFeedback(""); })}>Guardar dirección</Button></div>
        {state?.feedback.slice(-3).map(item => <p key={item.at} className="text-sm text-muted-foreground">{item.text}</p>)}
      </CardContent></Card> : null}
    {state?.events.length ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4" />Qué ha ocurrido</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
      {[...state.events].reverse().slice(0, 20).map((event, i) => <div key={`${event.at}:${i}`} className="flex flex-col gap-1 text-sm"><span>{event.message}</span><span className="text-xs text-muted-foreground">{new Date(event.at).toLocaleString()} {event.issueId ? <Link className="text-primary underline" to={`/issues/${event.issueId}`}>Ver tarea</Link> : null}</span></div>)}
    </CardContent></Card> : null}
  </div>;
}

function AutopilotSettings({ project, row, agents, onSave }: { project: Project; row: ProjectAutopilot | null; agents: Agent[]; onSave: (config: AutopilotConfig) => Promise<void> }) {
  const [config, setConfig] = useState<AutopilotConfig>(() => row?.config ?? {
    enabled: true, objective: project.description || "Mejorar este producto con cambios útiles, comprobados y coherentes.", productContext: "",
    plannerAgentId: project.leadAgentId || "", builderAgentId: project.leadAgentId || "", reviewerAgentId: "", fallbackAgentId: null,
    selectionMode: "automatic", automaticMaxRisk: "low", allowPush: true, allowProductionDeploy: false, reservePercent: 15,
    intervalMinutes: 360, maxCyclesPerDay: 3, maxRevisionAttempts: 2, deploymentTargets: [],
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const patch = <K extends keyof AutopilotConfig,>(key: K, value: AutopilotConfig[K]) => setConfig(current => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    try { const parsed = autopilotConfigSchema.safeParse(config); if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Revisa la configuración"); await onSave(parsed.data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setSaving(false); }
  }
  return <Card><CardHeader><CardTitle>Configura el trabajo autónomo</CardTitle><CardDescription>Los agentes conservan sus modelos, conexiones, presupuestos y controles actuales.</CardDescription></CardHeader>
    <CardContent><form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">Objetivo del producto<Textarea required value={config.objective} onChange={event => patch("objective", event.target.value)} /></label>
      <label className="flex flex-col gap-2 text-sm">Usuarios, estilo y límites<Textarea value={config.productContext} onChange={event => patch("productContext", event.target.value)} placeholder="Para quién es, qué valor aporta y qué debe conservar…" /></label>
      <div className="grid gap-4 md:grid-cols-2">{([ ["plannerAgentId", "Explora y propone"], ["builderAgentId", "Implementa"], ["reviewerAgentId", "Revisa y verifica"], ["fallbackAgentId", "Alternativa para nuevos trabajos"] ] as const).map(([key, label]) =>
        <label key={key} className="flex flex-col gap-2 text-sm">{label}<select className={fieldClass} value={config[key] ?? ""} onChange={event => patch(key, event.target.value || null as never)} required={key !== "fallbackAgentId"}>
          <option value="">{key === "fallbackAgentId" ? "Sin alternativa" : "Selecciona un agente"}</option>{agents.filter(agent => !["terminated", "pending_approval"].includes(agent.status)).map(agent => <option key={agent.id} value={agent.id}>{agent.name} · {agent.adapterType}</option>)}
        </select></label>)}
        <label className="flex flex-col gap-2 text-sm">Selección de planes<select className={fieldClass} value={config.selectionMode} onChange={event => patch("selectionMode", event.target.value as AutopilotConfig["selectionMode"])}><option value="automatic">Automática dentro del riesgo permitido</option><option value="manual">Quiero elegir cada plan</option></select></label>
        <label className="flex flex-col gap-2 text-sm">Riesgo máximo automático<select className={fieldClass} value={config.automaticMaxRisk} onChange={event => patch("automaticMaxRisk", event.target.value as "low" | "medium")}><option value="low">Bajo</option><option value="medium">Medio</option></select></label>
        {([ ["reservePercent", "Reserva de cuota (%)", 0, 90], ["intervalMinutes", "Tiempo entre ciclos (minutos)", 15, 10080], ["maxCyclesPerDay", "Máximo de ciclos al día", 1, 24], ["maxRevisionAttempts", "Máximo de correcciones", 0, 5] ] as const).map(([key, label, min, max]) =>
          <label key={key} className="flex flex-col gap-2 text-sm">{label}<Input type="number" min={min} max={max} value={config[key]} onChange={event => patch(key, Number(event.target.value))} /></label>)}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.enabled} onChange={event => patch("enabled", event.target.checked)} />Activar trabajo autónomo</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.allowPush} onChange={event => patch("allowPush", event.target.checked)} />Autorizar commits y subida a ramas de trabajo</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.allowProductionDeploy} onChange={event => patch("allowProductionDeploy", event.target.checked)} />Incluir los entornos de producción configurados en el encargo</label>
      <p className="text-sm font-medium">Destinos de despliegue</p>
      <p className="text-sm text-muted-foreground">Conecta Vercel y Railway en Apps e instala sus herramientas para los agentes. Cada destino se verificará contra el commit implementado y una comprobación de salud.</p>
      {(["vercel", "railway"] as const).map(provider => {
        const definition = getConnectableAppDefinition(provider);
        return definition?.availability?.available === false ? <p key={provider} role="status" className="text-sm text-muted-foreground">{definition.name}: {definition.availability.reason} Puedes conservar el destino configurado; la verificación quedará bloqueada mientras no exista una conexión autorizada disponible.</p> : null;
      })}
      {config.deploymentTargets.map((target, index) => {
        const update = (value: Partial<typeof target>) => patch("deploymentTargets", config.deploymentTargets.map((item, i) => i === index ? { ...item, ...value } : item));
        return <div key={index} className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">Proveedor<select className={fieldClass} value={target.provider} onChange={event => update({ provider: event.target.value as "vercel" | "railway" })}><option value="vercel">Vercel</option><option value="railway">Railway</option></select></label>
          <label className="flex flex-col gap-2 text-sm">Repositorio<select required className={fieldClass} value={target.projectWorkspaceId} onChange={event => update({ projectWorkspaceId: event.target.value })}><option value="">Selecciona un repositorio</option>{project.workspaces.filter(workspace => workspace.repoUrl).map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
          <label className="flex flex-col gap-2 text-sm">Proyecto en el proveedor<Input required value={target.projectRef} onChange={event => update({ projectRef: event.target.value })} /></label>
          <label className="flex flex-col gap-2 text-sm">Entorno<Input required value={target.environment} onChange={event => update({ environment: event.target.value })} /></label>
          <label className="flex flex-col gap-2 text-sm">Servicio de Railway (si corresponde)<Input value={target.serviceRef} onChange={event => update({ serviceRef: event.target.value })} /></label>
          <label className="flex flex-col gap-2 text-sm">URL de salud opcional<Input type="url" value={target.healthUrl ?? ""} onChange={event => update({ healthUrl: event.target.value || undefined })} /></label>
          <Button type="button" variant="ghost" onClick={() => patch("deploymentTargets", config.deploymentTargets.filter((_, i) => i !== index))}>Quitar destino</Button>
        </div>;
      })}
      <div><Button type="button" variant="outline" onClick={() => patch("deploymentTargets", [...config.deploymentTargets, { provider: "vercel", projectWorkspaceId: project.workspaces[0]?.id || "", projectRef: "", environment: "preview", serviceRef: "" }])}><Plus className="size-4" />Añadir destino</Button></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between gap-3"><Link to="/apps" className="text-sm text-primary underline">Configurar conexiones</Link><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar autonomía"}</Button></div>
    </form></CardContent>
  </Card>;
}
