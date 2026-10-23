import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentRole, CompanySkillListItem, Environment } from "@paperclipai/shared";
import type { PortablePackage } from "@paperclipai/shared/productization/portable-package";
import { AGENT_ROLE_LABELS, AGENT_ROLES } from "@paperclipai/shared";
import type { PortableTeamMemberProfile } from "@paperclipai/shared/productization/profile-hire";
import { agentsApi, type AgentHireResponse } from "@/api/agents";
import { approvalsApi } from "@/api/approvals";
import { adaptersApi, type AdapterInfo } from "@/api/adapters";
import { companySkillsApi } from "@/api/companySkills";
import { environmentsApi } from "@/api/environments";
import { useTranslation } from "@/i18n";
import { createUuid } from "@/lib/uuid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildProfileHireRequest,
  type ProfileHirePendingReason,
} from "@paperclipai/shared/productization/profile-hire";

const ROLE_LABELS: Record<AgentRole, string> = {
  ceo: "CEO",
  cto: "CTO",
  cmo: "CMO",
  cfo: "CFO",
  security: "Seguridad",
  engineer: "Ingeniería",
  designer: "Diseño",
  pm: "Producto",
  qa: "QA",
  devops: "DevOps",
  researcher: "Investigación",
  general: "General",
};

const NO_REPORT = "__no_report__";
const NO_ENVIRONMENT = "__no_environment__";
type HireRequest = Extract<ReturnType<typeof buildProfileHireRequest>, { ok: true }> ["request"];
interface HireVariables {
  companyId: string;
  scopeKey: string;
  request: HireRequest;
  attemptId: string;
  attemptStorageKey: string;
}

export interface ProfileHirePanelProps {
  companyId: string;
  profile: PortableTeamMemberProfile;
  teamId?: string;
  portablePackage?: PortablePackage;
  onCompleted: (result: AgentHireResponse) => void;
  onCancel?: () => void;
}

interface Choice {
  value: string;
  label: string;
}

function readStoredHireAttempt(key: string): { id: string; pending: boolean } | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    return typeof record.id === "string" && /^[0-9a-f-]{36}$/i.test(record.id) &&
      typeof record.pending === "boolean" ? { id: record.id, pending: record.pending } : null;
  } catch { return null; }
}

function storeHireAttempt(key: string, id: string, pending: boolean) {
  try { sessionStorage.setItem(key, JSON.stringify({ id, pending })); } catch { /* in-memory guard remains active */ }
}

function clearStoredHireAttempt(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* best effort */ }
}

function HiringSelect({
  id,
  value,
  options,
  placeholder,
  disabled,
  onValueChange,
}: {
  id: string;
  value: string;
  options: Choice[];
  placeholder: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function pendingReasonCopy(reason: ProfileHirePendingReason): string {
  switch (reason) {
    case "package_reference_unresolved": return "La referencia local no se pudo resolver dentro del paquete.";
    case "skill_inventory_unavailable": return "No se pudo consultar el inventario de skills de esta empresa; queda pendiente.";
    case "skill_not_installed_for_company": return "No hay una versión coincidente instalada en esta empresa; queda pendiente.";
    case "adapter_does_not_support_skills": return "El adaptador elegido no admite skills; queda pendiente.";
  }
}

function responseStatusCopy(result: AgentHireResponse): { label: string; pending: boolean } {
  const pending = result.agent.status === "pending_approval" || result.approval?.status === "pending";
  if (pending) return { label: "Contratación pendiente de aprobación", pending: true };
  if (result.approval?.status === "approved") return { label: "Contratación aprobada", pending: false };
  return { label: `Contratación creada · ${result.agent.status}`, pending: false };
}

function companySkillForResolver(skill: CompanySkillListItem) {
  return {
    companyId: skill.companyId,
    key: skill.key,
    sourceType: skill.sourceType,
    packageVersion: skill.packageVersion,
    currentVersionId: skill.currentVersionId,
  };
}

export function ProfileHirePanel({
  companyId,
  profile,
  teamId,
  portablePackage,
  onCompleted,
  onCancel,
}: ProfileHirePanelProps) {
  const { t } = useTranslation();
  const translate = (key: string, defaultValue: string) => t(`productization.hiring.${key}`, { defaultValue });
  const [name, setName] = useState(profile.title);
  const [role, setRole] = useState<AgentRole>("general");
  const [adapterType, setAdapterType] = useState("");
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [defaultEnvironmentId, setDefaultEnvironmentId] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<AgentHireResponse | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);
  const attemptStorageKey = `paperclip:productization-hire:${companyId}:${portablePackage?.packageKey ?? "direct"}@${portablePackage?.packageVersion ?? ""}:${teamId ?? ""}:${profile.id}`;
  const initialStoredAttempt = readStoredHireAttempt(attemptStorageKey);
  const [uncertainOutcome, setUncertainOutcome] = useState(initialStoredAttempt?.pending ?? false);
  const [pendingSkillsAccepted, setPendingSkillsAccepted] = useState(false);
  const scopeDescriptor = `${companyId}/${teamId ?? ""}/${profile.id}/${JSON.stringify(profile)}/${JSON.stringify(portablePackage ?? null)}`;
  const scopeGenerationRef = useRef({ descriptor: scopeDescriptor, generation: 0 });
  if (scopeGenerationRef.current.descriptor !== scopeDescriptor) {
    scopeGenerationRef.current = {
      descriptor: scopeDescriptor,
      generation: scopeGenerationRef.current.generation + 1,
    };
  }
  const scopeKey = `${scopeDescriptor}/${scopeGenerationRef.current.generation}`;
  const scopeRef = useRef(scopeKey);
  const mountedRef = useRef(false);
  const submissionLockRef = useRef(initialStoredAttempt?.pending ?? false);
  const hireAttemptIdRef = useRef<string | null>(null);
  if (hireAttemptIdRef.current === null) {
    hireAttemptIdRef.current = initialStoredAttempt?.id ?? createUuid();
  }
  scopeRef.current = scopeKey;
  useEffect(() => {
    mountedRef.current = true;
    setName(profile.title);
    setRole("general");
    setAdapterType("");
    setReportsTo(null);
    setDefaultEnvironmentId(null);
    setLastResponse(null);
    setReconcileMessage(null);
    const stored = readStoredHireAttempt(attemptStorageKey);
    hireAttemptIdRef.current = stored?.id ?? createUuid();
    setUncertainOutcome(stored?.pending ?? false);
    setPendingSkillsAccepted(false);
    submissionLockRef.current = stored?.pending ?? false;
    return () => { mountedRef.current = false; };
  }, [scopeKey, attemptStorageKey]);

  const agents = useQuery({
    queryKey: ["productization", "hire", "agents", companyId],
    queryFn: () => agentsApi.list(companyId),
    enabled: Boolean(companyId),
  });
  const adapters = useQuery({
    queryKey: ["productization", "hire", "adapters", companyId],
    queryFn: () => adaptersApi.list({ companyId }),
    enabled: Boolean(companyId),
  });
  const environments = useQuery({
    queryKey: ["productization", "hire", "environments", companyId],
    queryFn: () => environmentsApi.list(companyId),
    enabled: Boolean(companyId),
  });
  const skills = useQuery({
    queryKey: ["productization", "hire", "skills", companyId],
    queryFn: () => companySkillsApi.list(companyId),
    enabled: Boolean(companyId),
  });

  const availableAdapters = (adapters.data ?? []).filter((adapter) => adapter.loaded && !adapter.disabled);
  const selectedAdapter = availableAdapters.find((adapter) => adapter.type === adapterType) ?? null;
  const availableAgents = (agents.data ?? []).filter((agent) =>
    agent.companyId === companyId && agent.status !== "terminated",
  );
  const activeEnvironments = (environments.data ?? []).filter((environment) =>
    environment.status === "active",
  );

  useEffect(() => {
    if (!adapters.data) return;
    if (availableAdapters.some((adapter) => adapter.type === adapterType)) return;
    setAdapterType(availableAdapters[0]?.type ?? "");
  }, [adapterType, adapters.data]);

  useEffect(() => {
    if (agents.data && reportsTo && !availableAgents.some((agent) => agent.id === reportsTo)) {
      setReportsTo(null);
    }
  }, [agents.data, reportsTo]);

  useEffect(() => {
    if (environments.data && defaultEnvironmentId &&
      !activeEnvironments.some((environment) => environment.id === defaultEnvironmentId)) {
      setDefaultEnvironmentId(null);
    }
  }, [defaultEnvironmentId, environments.data]);

  const buildResult = buildProfileHireRequest({
    companyId,
    hireAttemptId: hireAttemptIdRef.current,
    profile,
    teamId,
    portablePackage,
    name,
    role,
    adapterType,
    reportsTo: reportsTo && availableAgents.some((agent) => agent.id === reportsTo) ? reportsTo : null,
    defaultEnvironmentId: defaultEnvironmentId &&
      activeEnvironments.some((environment) => environment.id === defaultEnvironmentId)
      ? defaultEnvironmentId
      : null,
    installedSkills: (skills.data ?? []).map(companySkillForResolver),
    skillInventoryAvailable: Boolean(skills.data) && !skills.isError,
    adapterSupportsSkills: selectedAdapter?.capabilities.supportsSkills ?? false,
  });

  const hire = useMutation<AgentHireResponse, Error, HireVariables>({
    retry: false,
    mutationFn: (variables) => agentsApi.hire(variables.companyId, variables.request),
    onMutate: () => { if (mountedRef.current) setLastResponse(null); },
    onSuccess: (result, variables) => {
      clearStoredHireAttempt(variables.attemptStorageKey);
      if (!mountedRef.current || scopeRef.current !== variables.scopeKey) return;
      setLastResponse(result);
      setUncertainOutcome(false);
      onCompleted(result);
    },
    onError: (_error, variables) => {
      storeHireAttempt(variables.attemptStorageKey, variables.attemptId, true);
      if (!mountedRef.current || scopeRef.current !== variables.scopeKey) return;
      submissionLockRef.current = true;
      setUncertainOutcome(true);
    },
  });

  const reconcileHire = async () => {
    if ((!hire.error && !uncertainOutcome) || reconciling || !submissionLockRef.current) return;
    const attemptId = hireAttemptIdRef.current!;
    setReconciling(true);
    setReconcileMessage(null);
    try {
      const [currentAgents, approvals] = await Promise.all([
        agentsApi.list(companyId),
        approvalsApi.list(companyId),
      ]);
      if (!mountedRef.current || scopeRef.current !== scopeKey) return;
      const candidates = currentAgents.filter((agent) =>
        agent.companyId === companyId &&
        (agent.metadata as Record<string, unknown> | null)?.productizationHireAttemptId === attemptId,
      );
      if (candidates.length === 1) {
        const agent = candidates[0]!;
        const approval = approvals.find((item) => item.companyId === companyId &&
          item.type === "hire_agent" && item.payload.agentId === agent.id) ?? null;
        const result = { agent, approval };
        setLastResponse(result);
        clearStoredHireAttempt(attemptStorageKey);
        setUncertainOutcome(false);
        setReconcileMessage(translate("reconciled", "La contratación se encontró en el estado actual de la empresa."));
        onCompleted(result);
      } else if (candidates.length > 1) {
        setReconcileMessage(translate("multipleMatches", "Hay varias contrataciones con esta referencia. El reintento sigue bloqueado; revisa agentes y aprobaciones."));
      } else {
        setReconcileMessage(translate("noMatch", "Aún no aparece una contratación con esta referencia. La respuesta original sigue siendo incierta y el reintento permanece bloqueado."));
      }
    } catch {
      if (mountedRef.current && scopeRef.current === scopeKey) {
        setReconcileMessage(translate("reconcileFailed", "No se pudo consultar el estado actual. El reintento permanece bloqueado."));
      }
    } finally {
      if (mountedRef.current && scopeRef.current === scopeKey) setReconciling(false);
    }
  };

  const queryLoading = agents.isLoading || adapters.isLoading || environments.isLoading || skills.isLoading;
  const pendingSkillsKey = buildResult.ok ? JSON.stringify(buildResult.pendingSkills) : "invalid";
  useEffect(() => { setPendingSkillsAccepted(false); }, [pendingSkillsKey]);
  useEffect(() => { hire.reset(); }, [scopeKey]);
  const canSubmit = Boolean(companyId) && !queryLoading && !!selectedAdapter &&
    buildResult.ok && !(buildResult.ok && buildResult.pendingSkills.length > 0 && !pendingSkillsAccepted) &&
    profile.deploymentMode !== "assignment_specialist" && !hire.isPending &&
    !lastResponse && !hire.error && !uncertainOutcome && !submissionLockRef.current;
  const resultStatus = lastResponse ? responseStatusCopy(lastResponse) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate("title", "Contratar desde un perfil")}</CardTitle>
        <CardDescription>
          {translate("description", "Revisa las opciones y envía una solicitud de contratación para esta empresa.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="rounded-md border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{profile.title}</h3>
            <Badge variant="outline">{profile.deploymentMode === "persistent"
              ? translate("persistent", "Puesto persistente")
              : translate("specialist", "Especialista por encargo")}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{profile.purpose}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {translate("profileTextNote", "El propósito y los criterios son referencia para tu revisión: no se convierten en instrucciones del agente. El paquete tampoco aporta permisos ni configuración de adaptador.")}
          </p>
          {profile.deploymentMode === "assignment_specialist" && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {translate("specialistUnavailable", "La contratación de especialistas temporales aún no está disponible. El perfil no se enviará al endpoint de contratación.")}
            </p>
          )}
          {profile.deliveryCriteria.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium">{translate("criteria", "Criterios de entrega")}</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {profile.deliveryCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
              </ul>
            </div>
          )}
          {profile.suggestedCostLimit && (
            <p className="mt-3 text-sm text-muted-foreground">
              {translate("suggestedCost", "Coste sugerido de referencia")}: {profile.suggestedCostLimit.amountMinor} {translate("minorUnits", "unidades menores")} {profile.suggestedCostLimit.currency}.
              {" "}{translate("suggestedCostNote", "No se convierte en presupuesto ni autoriza gasto; esos controles requieren una decisión humana separada.")}
            </p>
          )}
        </section>

        {agents.isError && <p role="alert" className="text-sm text-destructive">{translate("agentsLoadError", "No se pudieron cargar los agentes actuales. Conserva el formulario y vuelve a intentarlo.")}</p>}
        {adapters.isError && <p role="alert" className="text-sm text-destructive">{translate("adaptersLoadError", "No se pudieron cargar los adaptadores disponibles; no se puede enviar la contratación.")}</p>}
        {environments.isError && <p role="alert" className="text-sm text-destructive">{translate("environmentsLoadError", "No se pudieron cargar los entornos. Puedes continuar sin asignar uno.")}</p>}
        {skills.isError && <p role="alert" className="text-sm text-destructive">{translate("skillsLoadError", "No se pudo verificar el inventario de skills. Las referencias quedarán pendientes y no se instalará nada.")}</p>}

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit || !buildResult.ok || submissionLockRef.current) return;
            submissionLockRef.current = true;
            storeHireAttempt(attemptStorageKey, hireAttemptIdRef.current!, true);
            hire.mutate({
              companyId,
              scopeKey,
              request: buildResult.request,
              attemptId: hireAttemptIdRef.current!,
              attemptStorageKey,
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-hire-name">{translate("name", "Nombre del agente")}</Label>
            <Input id="profile-hire-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-hire-role">{translate("role", "Rol")}</Label>
              <HiringSelect
                id="profile-hire-role"
                value={role}
                options={AGENT_ROLES.map((value) => ({
                  value,
                  label: t(`agent.roles.${value}`, { defaultValue: ROLE_LABELS[value] ?? AGENT_ROLE_LABELS[value] }),
                }))}
                placeholder={translate("chooseRole", "Elige un rol")}
                onValueChange={(value) => setRole(value as AgentRole)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-hire-adapter">{translate("adapter", "Entorno de ejecución")}</Label>
              <HiringSelect
                id="profile-hire-adapter"
                value={adapterType}
                options={availableAdapters.map((adapter: AdapterInfo) => ({ value: adapter.type, label: adapter.label }))}
                placeholder={translate("chooseAdapter", "Elige un adaptador disponible")}
                disabled={adapters.isLoading || adapters.isError || availableAdapters.length === 0}
                onValueChange={setAdapterType}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-hire-reports-to">{translate("reportsTo", "Responsable")}</Label>
              <HiringSelect
                id="profile-hire-reports-to"
                value={reportsTo ?? NO_REPORT}
                options={[
                  { value: NO_REPORT, label: translate("noManager", "Sin responsable asignado") },
                  ...availableAgents.map((agent) => ({ value: agent.id, label: `${agent.name} · ${agent.role}` })),
                ]}
                placeholder={translate("chooseManager", "Elige un responsable")}
                onValueChange={(value) => setReportsTo(value === NO_REPORT ? null : value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-hire-environment">{translate("environment", "Entorno")}</Label>
              <HiringSelect
                id="profile-hire-environment"
                value={defaultEnvironmentId ?? NO_ENVIRONMENT}
                options={[
                  { value: NO_ENVIRONMENT, label: translate("noEnvironment", "Sin entorno predeterminado") },
                  ...activeEnvironments.map((environment: Environment) => ({ value: environment.id, label: environment.name })),
                ]}
                placeholder={translate("chooseEnvironment", "Elige un entorno")}
                onValueChange={(value) => setDefaultEnvironmentId(value === NO_ENVIRONMENT ? null : value)}
              />
            </div>
          </div>

          {buildResult.ok && buildResult.pendingSkills.length > 0 && (
            <section aria-label={translate("pendingSkills", "Skills pendientes")} className="flex flex-col gap-2 rounded-md border p-3">
              <p className="text-sm font-medium">{translate("pendingSkills", "Skills pendientes")}</p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {buildResult.pendingSkills.map((skill, index) => (
                  <li key={`${skill.reference}-${index}`}>
                    <code>{skill.reference}</code>: {pendingReasonCopy(skill.reason)}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">{translate("pendingSkillsNote", "No se importan ni instalan skills desde este panel.")}</p>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={pendingSkillsAccepted}
                  onCheckedChange={(checked) => setPendingSkillsAccepted(checked === true)}
                  aria-label={translate("acceptPendingSkills", "Acepto enviar la solicitud sin estas skills, que quedan pendientes de resolución.")}
                />
                <span>{translate("acceptPendingSkills", "Acepto enviar la solicitud sin estas skills, que quedan pendientes de resolución.")}</span>
              </label>
            </section>
          )}

          <p className="text-sm text-muted-foreground">
            {translate("approvalPolicy", "La aprobación sigue la política de esta empresa. Esta pantalla no inicia un encargo.")}
          </p>
          <p className="text-sm text-muted-foreground">
            {translate("lifecycleSetup", "Al confirmar, el endpoint existente crea el agente y puede programar la preparación de su lifecycle. No envía un heartbeat ni crea un encargo. Revisa los campos antes de confirmar.")}
          </p>

          <details>
            <summary className="cursor-pointer text-sm font-medium">{translate("requestPreview", "Vista previa de la solicitud")}</summary>
            {buildResult.ok ? (
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(buildResult.request, null, 2)}</pre>
            ) : (
              <p role="alert" className="mt-2 text-sm text-destructive">{translate(buildResult.code, "El perfil o la solicitud no superan la validación.")}</p>
            )}
          </details>

          {uncertainOutcome && <p role="alert" className="text-sm text-destructive">{translate("hireUnknownOutcome", "La solicitud puede haberse creado sin que llegara su respuesta. No se reenvía automáticamente; consulta el estado antes de cualquier otro intento.")} {hire.error?.message}</p>}
          {uncertainOutcome && <Button type="button" variant="outline" onClick={() => void reconcileHire()} disabled={reconciling}>
            {reconciling ? translate("checking", "Consultando estado…") : translate("checkStatus", "Consultar agentes y aprobaciones")}
          </Button>}
          {reconcileMessage && <p role="status" className="text-sm text-muted-foreground">{reconcileMessage}</p>}
          {lastResponse && resultStatus && (
            <div role="status" className="flex flex-wrap items-center gap-2">
              <Badge variant={resultStatus.pending ? "secondary" : "default"}>{resultStatus.label}</Badge>
              <span className="text-sm text-muted-foreground">{lastResponse.agent.name} · {lastResponse.agent.status}</span>
              {lastResponse.approval && <span className="text-sm text-muted-foreground">({lastResponse.approval.status})</span>}
            </div>
          )}

          <CardFooter className="justify-between px-0">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel}>{translate("back", "Volver al catálogo")}</Button>
            ) : <span />}
            {lastResponse ? (
              <Button type="button" onClick={() => {
                setLastResponse(null);
                setPendingSkillsAccepted(false);
                submissionLockRef.current = false;
                setUncertainOutcome(false);
                setReconcileMessage(null);
                hire.reset();
                hireAttemptIdRef.current = createUuid();
                clearStoredHireAttempt(attemptStorageKey);
              }}>{translate("prepareAnother", "Preparar otra contratación")}</Button>
            ) : (
              <Button type="submit" disabled={!canSubmit || profile.deploymentMode === "assignment_specialist" || !!hire.error}>
                {hire.isPending
                  ? translate("submitting", "Enviando solicitud…")
                  : hire.error
                    ? translate("reconcile", "Revisar estado antes de reintentar")
                    : translate("submit", "Enviar solicitud de contratación")}
              </Button>
            )}
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}

export type { AgentHireResponse };
