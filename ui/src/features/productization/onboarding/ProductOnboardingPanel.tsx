import * as React from "react";
import { Check, ExternalLink, LoaderCircle } from "lucide-react";
import {
  getOnboardingProgress,
  isValidOnboardingTimestamp,
  ONBOARDING_CONNECTION_EVIDENCE_MAX_AGE_MS,
  type OnboardingConnection,
  type OnboardingEvent,
  type OnboardingEventResult,
  type OnboardingJourney,
  type OnboardingPath,
  type OnboardingStep,
} from "@paperclipai/shared/productization/onboarding-journey";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@/lib/router";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductOnboardingAgent, ProductOnboardingGoal } from "./api";
import { useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";

export type BusinessConfirmationInput = { businessName: string; offer: string };
export type ContextConfirmationInput = { audience: string; desiredOutcome: string; constraints?: string };

export type ProductOnboardingPanelProps = {
  /** Journey loaded and scoped by the host service; never create scope in the browser. */
  journey: OnboardingJourney;
  /** Canonical clock value supplied by the host, preferably server time. */
  nowISOString: string;
  /** Submit an intention only. The host must create and return authoritative evidence. */
  onSubmitEvent: (event: OnboardingEvent) => Promise<OnboardingEventResult>;
  /** Confirmation callbacks return a journey persisted/validated by the host. */
  onConfirmBusiness: (input: BusinessConfirmationInput) => Promise<OnboardingJourney>;
  onConfirmContext: (input: ContextConfirmationInput) => Promise<OnboardingJourney>;
  availableAgents: ProductOnboardingAgent[];
  availableAgentsTruncated: boolean;
  eligibleGoals: ProductOnboardingGoal[];
  eligibleGoalsTruncated: boolean;
  onSelectTeam: (agentIds: string[]) => Promise<OnboardingJourney>;
  onActivateTeam: () => Promise<OnboardingJourney>;
  onLinkFirstJob: (goalId: string) => Promise<OnboardingJourney>;
  onConfigureConnection: (connectionId: string) => void;
  connectionLabels?: Readonly<Record<string, string>>;
  onBack?: () => void;
  onCancel?: () => void;
};

const PATH_LABELS: Record<OnboardingPath, string> = {
  entrepreneur: "Emprendedor",
  agency: "Agencia",
  commercial: "Comercial",
};

const STEP_ORDER: OnboardingStep[] = ["business", "context", "connections", "team", "activation", "first_job", "complete"];
const NO_GOAL = "__no_goal__";
const STEP_LABELS: Record<OnboardingStep, string> = {
  business: "Negocio y oferta", context: "Contexto", connections: "Conexiones", team: "Equipo instalado",
  activation: "Activación", first_job: "Primera tarea", complete: "Recorrido completado",
};

/**
 * Step label for the visible UI. The persisted step id stays `first_job`; only
 * its copy says "task" now, so locale keys for the other steps keep applying.
 */
export function useOnboardingStepLabel() {
  const { t } = useTranslation();
  return (step: OnboardingStep): string => step === "first_job"
    ? t("uxTeam.onboarding.stepFirstTask", { defaultValue: "Primera tarea" })
    : t(`productOnboarding.steps.${step}`, { defaultValue: STEP_LABELS[step] });
}

function connectionStatus(connection: OnboardingConnection, now: string): "available" | "connected" | "authorized" | "checked" | "stale" | "revoked" {
  if (connection.invalidatedAt) {
    const checkedAt = connection.checkEvidence?.at;
    if (!checkedAt || !isValidOnboardingTimestamp(checkedAt) || !isValidOnboardingTimestamp(connection.invalidatedAt.at) ||
        Date.parse(checkedAt) < Date.parse(connection.invalidatedAt.at)) return "revoked";
  }
  if (connection.stage === "checked") {
    const checkedAt = connection.checkEvidence?.at;
    if (!checkedAt || !isValidOnboardingTimestamp(checkedAt) || !isValidOnboardingTimestamp(now) ||
        Date.parse(checkedAt) > Date.parse(now)) return "stale";
    return Date.parse(now) - Date.parse(checkedAt) > ONBOARDING_CONNECTION_EVIDENCE_MAX_AGE_MS ? "stale" : "checked";
  }
  return connection.stage;
}

function sameJourneyScope(left: OnboardingJourney, right: OnboardingJourney): boolean {
  return left.id === right.id && left.accountId === right.accountId && left.companyId === right.companyId && left.version === right.version;
}

function journeyIdentity(journey: OnboardingJourney): string {
  return `${journey.accountId}:${journey.companyId}:${journey.id}:${journey.version}`;
}

function useJourneyAction(journey: OnboardingJourney, onError: (message: string) => void) {
  const [busy, setBusy] = React.useState(false);
  const [current, setCurrent] = React.useState(journey);
  const generation = React.useRef(0);
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);
  const latestPropJourney = React.useRef(journey);
  const activeIdentity = journeyIdentity(journey);
  const identityRef = React.useRef(activeIdentity);
  latestPropJourney.current = journey;

  React.useEffect(() => {
    identityRef.current = activeIdentity;
  }, [activeIdentity]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  React.useEffect(() => {
    setCurrent(journey);
  }, [journey]);

  const run = React.useCallback(async <T,>(
    action: () => Promise<T>,
    getJourney: (result: T) => OnboardingJourney | undefined,
    rejectedMessage?: (result: T) => string | undefined,
  ) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    const identity = identityRef.current;
    const startingProp = latestPropJourney.current;
    const request = ++generation.current;
    setBusy(true);
    onError("");
    try {
      const result = await action();
      if (!mounted.current || identityRef.current !== identity || generation.current !== request ||
          !sameJourneyScope(startingProp, latestPropJourney.current)) return result;
      const next = getJourney(result);
      if (next && !sameJourneyScope(startingProp, next)) {
        onError("La respuesta corresponde a otro recorrido. Actualiza la página e inténtalo de nuevo.");
        return result;
      }
      if (next) setCurrent(next);
      const rejection = rejectedMessage?.(result);
      if (rejection) onError(rejection);
      return result;
    } catch (error) {
      if (mounted.current && identityRef.current === identity && generation.current === request &&
          sameJourneyScope(startingProp, latestPropJourney.current)) {
        onError("No se pudo guardar. Revisa la conexión e inténtalo otra vez.");
      }
      throw error;
    } finally {
      inFlight.current = false;
      if (mounted.current && identityRef.current === identity && generation.current === request &&
          sameJourneyScope(startingProp, latestPropJourney.current)) setBusy(false);
    }
  }, [onError]);

  return { current, busy, run };
}

export function ProductOnboardingPanel(props: ProductOnboardingPanelProps) {
  return <OnboardingPanelBody key={journeyIdentity(props.journey)} {...props} />;
}

function OnboardingPanelBody({ journey, nowISOString, onSubmitEvent, onConfirmBusiness, onConfirmContext, availableAgents, availableAgentsTruncated, eligibleGoals, eligibleGoalsTruncated, onSelectTeam, onActivateTeam, onLinkFirstJob, onConfigureConnection, connectionLabels, onBack, onCancel }: ProductOnboardingPanelProps) {
  const { t } = useTranslation();
  const stepLabel = useOnboardingStepLabel();
  const [error, setError] = React.useState("");
  const showError = React.useCallback((message: string) => setError(message), []);
  const { current, busy, run } = useJourneyAction(journey, showError);
  const [businessName, setBusinessName] = React.useState(current.business?.confirmedBusinessName ?? "");
  const [offer, setOffer] = React.useState(current.business?.confirmedOffer ?? "");
  const [audience, setAudience] = React.useState(current.context?.audience ?? "");
  const [desiredOutcome, setDesiredOutcome] = React.useState(current.context?.desiredOutcome ?? "");
  const [constraints, setConstraints] = React.useState(current.context?.constraints ?? "");
  const [sourceUrl, setSourceUrl] = React.useState(current.business?.url ?? "");
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<string[]>(journey.team?.agentIds ?? []);
  const [selectedGoalId, setSelectedGoalId] = React.useState(journey.firstJobGoalId ?? "");
  const progress = getOnboardingProgress(current, nowISOString);
  const journeyInvalid = progress.blockedBy.includes("invalid_journey") || progress.blockedBy.includes("invalid_or_out_of_order_evidence");
  const safeConnections = journeyInvalid || !Array.isArray(current.connections) ? [] : current.connections;
  const sourceSummary = current.business?.suggestedOffer || current.business?.suggestedBusinessName;
  const pathLabel = PATH_LABELS[current.path] ?? "Emprendedor";
  const connectionStatuses = safeConnections.map((connection) => connectionStatus(connection, nowISOString));
  const confirmationsLocked = Boolean(current.firstJob);
  const businessDirty = !confirmationsLocked && (businessName.trim() !== (current.business?.confirmedBusinessName ?? "") || offer.trim() !== (current.business?.confirmedOffer ?? ""));
  const contextDirty = !confirmationsLocked && (audience.trim() !== (current.context?.audience ?? "") || desiredOutcome.trim() !== (current.context?.desiredOutcome ?? "") || constraints.trim() !== (current.context?.constraints ?? ""));
  const validUrl = (() => { try { return new URL(sourceUrl).protocol === "https:" || new URL(sourceUrl).protocol === "http:"; } catch { return false; } })();

  React.useEffect(() => {
    setBusinessName(journey.business?.confirmedBusinessName ?? "");
    setOffer(journey.business?.confirmedOffer ?? "");
    setAudience(journey.context?.audience ?? "");
    setDesiredOutcome(journey.context?.desiredOutcome ?? "");
    setConstraints(journey.context?.constraints ?? "");
    setSourceUrl(journey.business?.url ?? "");
  }, [journey.id, journey.business?.confirmedBusinessName, journey.business?.confirmedOffer, journey.business?.suggestedBusinessName, journey.business?.suggestedOffer, journey.business?.url, journey.context?.audience, journey.context?.desiredOutcome, journey.context?.constraints]);

  React.useEffect(() => {
    setSelectedAgentIds((journey.team?.agentIds ?? []).filter((id) => availableAgents.some((agent) => agent.id === id)));
    setSelectedGoalId(journey.firstJobGoalId ?? "");
  }, [journey.id, journey.team?.agentIds, journey.firstJobGoalId, availableAgents]);

  const handleSubmit = async (action: () => Promise<OnboardingJourney>) => {
    try { await run(action, (next) => next); } catch { /* Inline error preserves the entered form values. */ }
  };

  const saveTeam = () => handleSubmit(() => onSelectTeam(selectedAgentIds));
  const confirmTeamUse = () => handleSubmit(onActivateTeam);
  const linkFirstJob = () => handleSubmit(() => onLinkFirstJob(selectedGoalId));

  const submitSource = async () => {
    if (!validUrl || confirmationsLocked || journeyInvalid) return;
    try {
      await run(() => onSubmitEvent({ type: "business_suggestion_recorded", url: sourceUrl.trim() }), (response) => response.accepted ? response.journey : undefined,
        (response) => response.accepted ? undefined : t("productOnboarding.errors.eventRejected", { defaultValue: "No se pudo guardar la página. Inténtalo de nuevo." }));
    } catch { /* Keep the source URL available for retry. */ }
  };

  const submitBusiness = () => handleSubmit(() => onConfirmBusiness({ businessName: businessName.trim(), offer: offer.trim() }));
  const submitContext = () => handleSubmit(() => onConfirmContext({ audience: audience.trim(), desiredOutcome: desiredOutcome.trim(), constraints: constraints.trim() || undefined }));

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6" aria-busy={busy}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t("productOnboarding.path", { defaultValue: "Camino: {{path}}", path: t(`productOnboarding.paths.${current.path}`, { defaultValue: pathLabel }) })}</Badge>
        </div>
        <h1 className="text-2xl font-semibold">{t("uxTeam.onboarding.title", { defaultValue: "Prepara tu primera tarea" })}</h1>
        <p className="text-sm text-muted-foreground">{t("productOnboarding.subtitle", { defaultValue: "Confirma tu oferta, añade el contexto y conecta las herramientas que necesitas para empezar." })}</p>
        <p role="status" className="text-sm">{progress.ready
          ? t("productOnboarding.ready", { defaultValue: "Recorrido listo" })
          : t("productOnboarding.inProgress", { defaultValue: "Recorrido en progreso. Siguiente paso: {{step}}", step: stepLabel(progress.nextStep) })}</p>
      </header>

      {journeyInvalid && <p role="alert" className="text-sm text-destructive">{t("productOnboarding.invalid", { defaultValue: "No se puede continuar porque el estado del recorrido no es válido. Actualiza la página o pide ayuda al administrador." })}</p>}
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("productOnboarding.progress", { defaultValue: "Progreso de incorporación" })}>
        {STEP_ORDER.map((step, index) => {
          const active = step === progress.nextStep;
          const complete = index < STEP_ORDER.indexOf(progress.nextStep) || (step === "complete" && progress.journeyCompleted);
          return <li key={step} className={cn("flex items-center gap-2 rounded-md border p-3 text-sm", active ? "border-primary bg-accent" : "border-border")} aria-current={active ? "step" : undefined}>
            {complete ? <Check aria-hidden="true" className="size-4 text-primary" /> : <span className="text-muted-foreground">{index + 1}.</span>}
            <span>{stepLabel(step)}</span>
          </li>;
        })}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{t("productOnboarding.business.title", { defaultValue: "Confirma negocio y oferta" })}</CardTitle>
          <CardDescription>{t("productOnboarding.business.description", { defaultValue: "Revisa la información del negocio y confirma la oferta que quieres presentar." })}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sourceSummary && <p className="rounded-md bg-muted p-3 text-sm">{t("productOnboarding.business.suggestion", { defaultValue: "Sugerencia por revisar: {{name}} — {{offer}}", name: current.business?.suggestedBusinessName ?? "", offer: current.business?.suggestedOffer ?? "" })}</p>}
          <div className="grid gap-2">
            <Label htmlFor="onboarding-source-url">{t("productOnboarding.business.source", { defaultValue: "Página del negocio (opcional)" })}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="onboarding-source-url" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://" disabled={busy || confirmationsLocked || journeyInvalid} />
              <Button type="button" variant="outline" onClick={submitSource} disabled={busy || confirmationsLocked || journeyInvalid || !validUrl}>
                {busy && <LoaderCircle data-icon aria-hidden="true" className="animate-spin" />}{t("productOnboarding.business.saveSource", { defaultValue: "Guardar página" })}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("productOnboarding.business.sourceNote", { defaultValue: "Añadir una página no confirma la oferta; revisa los datos antes de continuar." })}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="onboarding-business-name">{t("productOnboarding.business.name", { defaultValue: "Nombre del negocio" })}</Label><Input id="onboarding-business-name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} disabled={busy || confirmationsLocked || journeyInvalid} /></div>
            <div className="grid gap-2"><Label htmlFor="onboarding-offer">{t("productOnboarding.business.offer", { defaultValue: "Oferta que quieres vender" })}</Label><Textarea id="onboarding-offer" value={offer} onChange={(event) => setOffer(event.target.value)} disabled={busy || confirmationsLocked || journeyInvalid} /></div>
          </div>
          {current.business?.confirmation && <p className="text-sm text-muted-foreground">{t("productOnboarding.business.confirmed", { defaultValue: "Oferta confirmada por ti el {{date}}", date: formatDate(current.business.confirmation.at) })}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("productOnboarding.context.title", { defaultValue: "Añade contexto" })}</CardTitle><CardDescription>{t("productOnboarding.context.description", { defaultValue: "Indica a quién quieres llegar y qué resultado esperas." })}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="onboarding-audience">{t("productOnboarding.context.audience", { defaultValue: "¿A quién atiendes?" })}</Label><Textarea id="onboarding-audience" value={audience} onChange={(event) => setAudience(event.target.value)} disabled={busy || confirmationsLocked || journeyInvalid || !current.business?.confirmation} /></div>
            <div className="grid gap-2"><Label htmlFor="onboarding-outcome">{t("productOnboarding.context.outcome", { defaultValue: "¿Qué resultado buscas?" })}</Label><Textarea id="onboarding-outcome" value={desiredOutcome} onChange={(event) => setDesiredOutcome(event.target.value)} disabled={busy || confirmationsLocked || journeyInvalid || !current.business?.confirmation} /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="onboarding-constraints">{t("productOnboarding.context.constraints", { defaultValue: "Límites o requisitos (opcional)" })}</Label><Textarea id="onboarding-constraints" value={constraints} onChange={(event) => setConstraints(event.target.value)} disabled={busy || confirmationsLocked || journeyInvalid || !current.business?.confirmation} /></div>
          {current.context?.confirmation && <p className="text-sm text-muted-foreground">{t("productOnboarding.context.confirmed", { defaultValue: "Contexto confirmado el {{date}}", date: formatDate(current.context.confirmation.at) })}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("productOnboarding.connections.title", { defaultValue: "Conecta tus herramientas" })}</CardTitle><CardDescription>{t("productOnboarding.connections.description", { defaultValue: "Conecta las herramientas que usarás en este recorrido y revisa cuáles están listas." })}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {safeConnections.length === 0 ? <p className="text-sm text-muted-foreground">{journeyInvalid ? t("productOnboarding.connections.unavailable", { defaultValue: "No se pueden mostrar las conexiones hasta revisar el estado." }) : t("productOnboarding.connections.none", { defaultValue: "No necesitas conectar herramientas para este recorrido." })}</p> : safeConnections.map((connection, index) => {
            const status = connectionStatuses[index];
            const label = t(`productOnboarding.connectionStates.${status}`, { defaultValue: ({ available: "Disponible", connected: "Conectada", authorized: "Autorizada", checked: "Comprobada", stale: "Comprobación caducada", revoked: "Acceso revocado" } as const)[status] });
            return <div key={connection.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1"><span className="truncate font-medium">{connectionLabels?.[connection.id] ?? t("productOnboarding.connections.defaultName", { defaultValue: "Herramienta {{number}}", number: index + 1 })}</span><div className="flex flex-wrap items-center gap-2"><Badge variant={status === "checked" ? "secondary" : "outline"}>{label}</Badge>{connection.checkEvidence?.at && <span className="text-xs text-muted-foreground">{t("productOnboarding.connections.checkedAt", { defaultValue: "Comprobada el {{date}}", date: formatDate(connection.checkEvidence.at) })}</span>}</div></div>
              <Button type="button" size="sm" variant="outline" onClick={() => onConfigureConnection(connection.id)} disabled={busy || journeyInvalid || !current.context?.confirmation}><ExternalLink data-icon="inline-start" aria-hidden="true" />{t("productOnboarding.connections.configure", { defaultValue: "Conectar" })}</Button>
            </div>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("productOnboarding.milestones.title", { defaultValue: "Equipo y primeros resultados" })}</CardTitle><CardDescription>{t("uxTeam.onboarding.milestonesDescription", { defaultValue: "Aquí verás cuándo el equipo esté instalado y empiece la primera tarea." })}</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <section className="col-span-full flex flex-col gap-3 rounded-md border p-4">
            <div>
              <h3 className="font-medium">{t("productOnboarding.team.chooseTitle", { defaultValue: "Elige el equipo para este recorrido" })}</h3>
              <p className="text-sm text-muted-foreground">{t("productOnboarding.team.chooseDescription", { defaultValue: "Solo aparecen agentes disponibles para esta empresa. El servidor vuelve a validar su estado al guardar." })}</p>
            </div>
            {current.team?.agentIds?.some((id) => !availableAgents.some((agent) => agent.id === id)) && (
              <p role="status" className="text-sm text-muted-foreground">{t("productOnboarding.team.staleSelection", { defaultValue: "Un agente elegido ya no está disponible. Selecciona de nuevo el equipo actual." })}</p>
            )}
            {availableAgentsTruncated && <p className="text-sm text-muted-foreground">{t("productOnboarding.team.truncated", { defaultValue: "Se muestran hasta 100 agentes elegibles. La lista está limitada por el servidor." })}</p>}
            {availableAgents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("productOnboarding.team.noAgents", { defaultValue: "Todavía no hay agentes listos para este recorrido. Contrata un perfil y vuelve aquí." })}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {availableAgents.map((agent) => (
                  <li key={agent.id}>
                    <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                      <Checkbox
                        checked={selectedAgentIds.includes(agent.id)}
                        disabled={busy || journeyInvalid || Boolean(current.team?.activated)}
                        onCheckedChange={(checked) => setSelectedAgentIds((ids) => checked === true
                          ? ids.includes(agent.id) ? ids : [...ids, agent.id]
                          : ids.filter((id) => id !== agent.id))}
                        aria-label={agent.name}
                      />
                      <span className="flex min-w-0 flex-col"><span className="font-medium">{agent.name}</span>{agent.title && <span className="text-muted-foreground">{agent.title}</span>}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {!current.team?.activated && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={saveTeam}
                  disabled={busy || journeyInvalid || !current.context?.confirmation || selectedAgentIds.length === 0 ||
                    selectedAgentIds.slice().sort().join(",") === (current.team?.agentIds ?? []).slice().sort().join(",")}>
                  {t("productOnboarding.team.save", { defaultValue: "Guardar equipo para este recorrido" })}
                </Button>
              </div>
            )}
            {current.team?.installed && !current.team.activated && (
              <div className="flex flex-col gap-2 border-t pt-3">
                <p className="text-sm text-muted-foreground">{t("uxTeam.onboarding.useNote", { defaultValue: "Confirma que quieres usar estos agentes. Esto no inicia agentes ni ejecuta una tarea." })}</p>
                <div className="flex justify-end"><Button type="button" onClick={confirmTeamUse} disabled={busy || journeyInvalid}>{t("productOnboarding.team.use", { defaultValue: "Usar este equipo" })}</Button></div>
              </div>
            )}
            {current.team?.activated && <p role="status" className="text-sm">{t("uxTeam.onboarding.useConfirmed", { defaultValue: "Equipo confirmado para usar. Crea una tarea real en Tareas para continuar." })}</p>}
          </section>

          <section className="col-span-full flex flex-col gap-3 rounded-md border p-4">
            <div>
              <h3 className="font-medium">{t("uxTeam.onboarding.firstTaskTitle", { defaultValue: "Vincula una tarea ya iniciada" })}</h3>
              <p className="text-sm text-muted-foreground">{t("uxTeam.onboarding.firstTaskDescription", { defaultValue: "El servidor solo ofrece trabajos de esta empresa cuya tarea ya tiene un inicio real posterior a la confirmación del equipo." })}</p>
            </div>
            {current.firstJob ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{t("uxTeam.onboarding.firstTaskLinked", { defaultValue: "El recorrido ya está vinculado a una tarea iniciada." })}</span>
                {current.firstJobIssueId && <Link className="text-primary underline" to={`/issues/${encodeURIComponent(current.firstJobIssueId)}`}>{t("uxTeam.onboarding.firstTaskOpen", { defaultValue: "Abrir tarea" })}</Link>}
              </div>
            ) : !current.team?.activated ? (
              <p className="text-sm text-muted-foreground">{t("productOnboarding.firstJob.teamRequired", { defaultValue: "Primero confirma el equipo que vas a usar." })}</p>
            ) : eligibleGoals.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="text-muted-foreground">{t("uxTeam.onboarding.firstTaskNone", { defaultValue: "No hay tareas iniciadas elegibles todavía." })}</p>
                <Link className="text-primary underline" to="/issues">{t("uxTeam.onboarding.openTasks", { defaultValue: "Abrir Tareas" })}</Link>
              </div>
            ) : (
              <>
              {eligibleGoalsTruncated && <p className="text-sm text-muted-foreground">{t("uxTeam.onboarding.firstTaskTruncated", { defaultValue: "Se muestran hasta 100 tareas iniciadas elegibles. La lista está limitada por el servidor." })}</p>}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select value={selectedGoalId || NO_GOAL} onValueChange={(value) => setSelectedGoalId(value === NO_GOAL ? "" : value)} disabled={busy || journeyInvalid}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t("uxTeam.onboarding.firstTaskChoose", { defaultValue: "Selecciona una tarea iniciada" })} /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value={NO_GOAL}>{t("uxTeam.onboarding.firstTaskChoose", { defaultValue: "Selecciona una tarea iniciada" })}</SelectItem>
                    {eligibleGoals.map((goal) => <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
                <Button type="button" onClick={linkFirstJob} disabled={busy || journeyInvalid || !selectedGoalId || !eligibleGoals.some((goal) => goal.id === selectedGoalId)}>
                  {t("uxTeam.onboarding.firstTaskLink", { defaultValue: "Vincular tarea" })}
                </Button>
              </div>
              </>
            )}
          </section>

          <Milestone label={t("productOnboarding.milestones.installed", { defaultValue: "Equipo instalado" })} at={current.team?.installed?.at} />
          <Milestone label={t("productOnboarding.milestones.activated", { defaultValue: "Equipo confirmado para usar" })} at={current.team?.activated?.at} />
          <Milestone label={t("uxTeam.onboarding.milestoneFirstTask", { defaultValue: "Primera tarea iniciada" })} at={current.firstJob?.at} />
          <Milestone label={t("productOnboarding.milestones.accepted", { defaultValue: "Primer entregable aceptado" })} at={current.firstAcceptedDeliverable?.at} />
          {progress.metrics.timeToFirstJobMs !== undefined && <p className="text-sm">{t("uxTeam.onboarding.metricFirstTask", { defaultValue: "Tiempo hasta la primera tarea: {{duration}}", duration: formatDuration(progress.metrics.timeToFirstJobMs) })}</p>}
          {progress.metrics.timeToFirstAcceptedDeliverableMs !== undefined && <p className="text-sm">{t("productOnboarding.metrics.accepted", { defaultValue: "Tiempo hasta el primer entregable aceptado: {{duration}}", duration: formatDuration(progress.metrics.timeToFirstAcceptedDeliverableMs) })}</p>}
        </CardContent>
      </Card>

      <div aria-live="polite" className="flex flex-col gap-2">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {progress.journeyCompleted && <p className="text-sm">{t("productOnboarding.completed", { defaultValue: "Has completado la puesta en marcha." })}</p>}
        {progress.blockedBy.length > 0 && <p className="text-sm text-muted-foreground">{t("productOnboarding.blocked", { defaultValue: "Siguiente paso: {{step}}", step: stepLabel(progress.nextStep) })}</p>}
      </div>
      <footer className="flex items-center justify-between gap-3">
        <div>{(onBack || onCancel) && <Button type="button" variant="ghost" onClick={onBack ?? onCancel} disabled={busy}>{t(onBack ? "productOnboarding.back" : "productOnboarding.cancel", { defaultValue: onBack ? "Atrás" : "Cancelar" })}</Button>}</div>
        {progress.nextStep === "business" || businessDirty ? <Button type="button" onClick={submitBusiness} disabled={busy || confirmationsLocked || journeyInvalid || !businessName.trim() || !offer.trim()}>{busy && <LoaderCircle data-icon="inline-start" aria-hidden="true" className="animate-spin" />}{t(businessDirty && current.business?.confirmation ? "productOnboarding.business.update" : "productOnboarding.business.confirm", { defaultValue: businessDirty && current.business?.confirmation ? "Guardar cambios de oferta" : "Confirmar oferta" })}</Button>
          : progress.nextStep === "context" || contextDirty ? <Button type="button" onClick={submitContext} disabled={busy || confirmationsLocked || journeyInvalid || !audience.trim() || !desiredOutcome.trim()}>{busy && <LoaderCircle data-icon="inline-start" aria-hidden="true" className="animate-spin" />}{t(contextDirty && current.context?.confirmation ? "productOnboarding.context.update" : "productOnboarding.context.confirm", { defaultValue: contextDirty && current.context?.confirmation ? "Guardar cambios de contexto" : "Confirmar contexto" })}</Button>
            : <span className="text-sm text-muted-foreground">{t("productOnboarding.next", { defaultValue: "Siguiente: {{step}}", step: stepLabel(progress.nextStep) })}</span>}
      </footer>
    </section>
  );
}

function Milestone({ label, at }: { label: string; at?: string }) {
  const { t } = useTranslation();
  return <div className="flex items-center justify-between gap-3 rounded-md border p-3"><span className="text-sm">{label}</span>{at ? <Badge variant="secondary">{t("productOnboarding.recorded", { defaultValue: "Registrado {{date}}", date: formatDate(at) })}</Badge> : <Badge variant="outline">{t("productOnboarding.pending", { defaultValue: "Pendiente" })}</Badge>}</div>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : value;
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainder = minutes % 60;
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${remainder} min`;
  return `${remainder} min`;
}
