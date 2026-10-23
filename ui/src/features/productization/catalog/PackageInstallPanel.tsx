import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENT_ROLES, AGENT_ROLE_LABELS, type AgentRole } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { adaptersApi } from "@/api/adapters";
import { companySkillsApi } from "@/api/companySkills";
import { environmentsApi } from "@/api/environments";
import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PACKAGE_RESOURCE_KIND_LABELS,
  isResourceReview,
  portableCatalogApi,
  type InstallationItem,
  type InstallationItemReview,
  type InstallationItemStatus,
  type InstallPlan,
  type InstallPlanProfile,
  type InstallPlanResource,
  type PackageInstallation,
} from "./api";

const resourceKey = (resource: { kind: string; localId: string }) => `${resource.kind}/${resource.localId}`;

const NO_MANAGER = "__none__";
const NO_ENVIRONMENT = "__no_environment__";

interface ProfileDraft {
  name: string;
  role: string;
  adapterType: string;
  managerMode: "package" | "existing" | "none";
  existingAgentId: string | null;
  environmentId: string | null;
  useInstructions: boolean;
  instructionsText: string;
  acceptPendingSkills: boolean;
}

export interface PackageInstallPanelProps {
  companyId: string;
  packageId: string;
  onBack?: () => void;
}

function Pick({ id, value, options, placeholder, disabled, onChange }: {
  id: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function defaultInstructions(profile: InstallPlanProfile): string {
  const lines = [`# ${profile.title}`, "", profile.purpose];
  if (profile.deliveryCriteria.length > 0) {
    lines.push("", "## Criterios de entrega", ...profile.deliveryCriteria.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

export function PackageInstallPanel(props: PackageInstallPanelProps) {
  return <PackageInstallPanelContent key={`${props.companyId}/${props.packageId}`} {...props} />;
}

function PackageInstallPanelContent({ companyId, packageId, onBack }: PackageInstallPanelProps) {
  const { t } = useTranslation();
  const tr = (key: string, value: string) => t(`productization.catalog.install.${key}`, { defaultValue: value });
  const queryClient = useQueryClient();
  const planKey = ["productization", "catalog", "plan", companyId, packageId] as const;
  const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({});
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const plan = useQuery({
    queryKey: planKey,
    queryFn: () => portableCatalogApi.installPlan(companyId, packageId),
    retry: false,
  });
  const agents = useQuery({
    queryKey: ["productization", "catalog", "agents", companyId],
    queryFn: () => agentsApi.list(companyId),
  });
  const adapters = useQuery({
    queryKey: ["productization", "catalog", "adapters", companyId],
    queryFn: () => adaptersApi.list({ companyId }),
  });
  const environments = useQuery({
    queryKey: ["productization", "catalog", "environments", companyId],
    queryFn: () => environmentsApi.list(companyId),
  });

  const availableAdapters = (adapters.data ?? []).filter((adapter) => adapter.loaded && !adapter.disabled);
  const liveAgents = (agents.data ?? []).filter((agent) => agent.companyId === companyId && agent.status !== "terminated");
  const activeEnvironments = (environments.data ?? []).filter((environment) => environment.status === "active");

  function draftFor(profile: InstallPlanProfile): ProfileDraft {
    const stored = drafts[profile.localKey] ?? {
      name: profile.title,
      role: profile.suggestedRole,
      adapterType: "",
      managerMode: profile.reportsToLocalKey ? "package" : "none",
      existingAgentId: null,
      environmentId: null,
      useInstructions: false,
      instructionsText: defaultInstructions(profile),
      acceptPendingSkills: false,
    } satisfies ProfileDraft;
    // The selector shows the first available adapter until one is chosen, so the submitted value must match it.
    return { ...stored, adapterType: stored.adapterType || (availableAdapters[0]?.type ?? "") };
  }
  function patchDraft(profile: InstallPlanProfile, patch: Partial<ProfileDraft>) {
    setDrafts((current) => ({ ...current, [profile.localKey]: { ...draftFor(profile), ...patch } }));
  }

  const createReceipt = useMutation({
    retry: false,
    mutationFn: (data: NonNullable<typeof plan.data>) => {
      const persistentKeys = new Set(data.profiles.map((profile) => profile.localKey));
      const items: InstallationItemReview[] = data.profiles.map((profile) => {
        const draft = draftFor(profile);
        const usePackageManager = draft.managerMode === "package" && profile.reportsToLocalKey !== null &&
          persistentKeys.has(profile.reportsToLocalKey);
        return {
          teamId: profile.teamId,
          memberId: profile.memberId,
          title: profile.title,
          name: draft.name.trim(),
          role: draft.role,
          adapterType: draft.adapterType,
          reportsToLocalKey: usePackageManager ? profile.reportsToLocalKey : null,
          reportsToExistingAgentId: draft.managerMode === "existing" ? draft.existingAgentId : null,
          defaultEnvironmentId: draft.environmentId,
          instructionsText: draft.useInstructions && draft.instructionsText.trim() ? draft.instructionsText.trim() : null,
          skills: profile.skills.map((skill) => ({ key: skill.key, version: skill.version })),
          acceptPendingSkills: draft.acceptPendingSkills,
        };
      });
      return portableCatalogApi.createInstallation(companyId, packageId, {
        acknowledgeUnsupported: data.unsupported.map((entry) => entry.section).filter((section) => acknowledged.has(section)),
        items,
        resources: data.resources
          .filter((resource) => resource.installable && selectedResources.has(resourceKey(resource)))
          .map((resource) => ({ kind: resource.kind, localId: resource.localId })),
      });
    },
    onSuccess: () => { setError(null); void queryClient.invalidateQueries({ queryKey: planKey }); },
    onError: (cause: Error) => setError(cause.message),
  });

  const installSkill = useMutation({
    retry: false,
    mutationFn: (key: string) => companySkillsApi.installCatalog(companyId, { catalogSkillId: key }),
    onSuccess: () => { setError(null); void queryClient.invalidateQueries({ queryKey: planKey }); },
    onError: (cause: Error) => setError(cause.message),
  });

  if (plan.isLoading) return <p role="status" className="text-sm text-muted-foreground">{tr("loading", "Preparando la instalación…")}</p>;
  if (plan.isError || !plan.data) {
    return (
      <Card>
        <CardHeader><CardTitle>{tr("planError", "No se pudo preparar la instalación")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p role="alert" className="text-sm text-destructive">{plan.error instanceof Error ? plan.error.message : ""}</p>
          <div className="flex justify-between">
            {onBack ? <Button type="button" variant="outline" onClick={onBack}>{tr("back", "Volver al catálogo")}</Button> : <span />}
            <Button type="button" onClick={() => void plan.refetch()}>{tr("retry", "Volver a intentar")}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = plan.data;
  if (data.installation) {
    return (
      <InstallationReceipt
        companyId={companyId}
        installation={data.installation}
        onChanged={() => void queryClient.invalidateQueries({ queryKey: planKey })}
        onBack={onBack}
      />
    );
  }

  const allAcknowledged = data.unsupported.every((entry) => acknowledged.has(entry.section));
  const chosenResources = data.resources.filter((resource) => resource.installable && selectedResources.has(resourceKey(resource)));
  const missingDependencies = chosenResources.flatMap((resource) => resource.dependsOn
    .filter((dep) => !selectedResources.has(resourceKey(dep)))
    .map((dep) => ({ resource, dep })));
  const blocking = missingDependencies.length > 0 || data.profiles.some((profile) => {
    const draft = draftFor(profile);
    const missing = profile.skills.some((skill) => skill.status !== "installed");
    return !draft.name.trim() || !draft.adapterType || (missing && !draft.acceptPendingSkills) ||
      (draft.managerMode === "existing" && !draft.existingAgentId) ||
      (draft.useInstructions && !draft.instructionsText.trim());
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("title", "Instalar paquete")}: {data.package.name}</CardTitle>
        <CardDescription>
          {data.package.packageKey}@{data.package.packageVersion} ·{" "}
          {tr("intro", "Revisa cada perfil y cada recurso. Instalar crea solicitudes de contratación con la configuración que confirmes y borradores de los recursos que marques; la aprobación sigue la política de la empresa y nada se publica, se envía ni se activa por sí solo.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {data.resources.length > 0 && (
          <section className="flex flex-col gap-3 rounded-md border p-4" aria-label={tr("resourcesTitle", "Recursos del paquete")}>
            <p className="text-sm font-medium">{tr("resourcesTitle", "Recursos del paquete (se instalan como borradores)")}</p>
            <p className="text-sm text-muted-foreground">
              {tr("resourcesNote", "Marca los que quieras instalar. Cada uno se crea sin publicar, sin enviar nada y sin conceder autonomía; publicarlo o activarlo es una decisión posterior. Lo que no marques queda registrado como no seleccionado.")}
            </p>
            <ul className="flex flex-col gap-3">
              {data.resources.map((resource) => (
                <ResourceChoice
                  key={resourceKey(resource)}
                  resource={resource}
                  checked={selectedResources.has(resourceKey(resource))}
                  missing={missingDependencies.filter((entry) => resourceKey(entry.resource) === resourceKey(resource)).map((entry) => entry.dep)}
                  tr={tr}
                  onChange={(checked) => setSelectedResources((current) => {
                    const next = new Set(current);
                    if (checked) next.add(resourceKey(resource)); else next.delete(resourceKey(resource));
                    return next;
                  })}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{tr("kindsTitle", "Agentes persistentes y especialistas por encargo")}</p>
          <p className="mt-1">{tr("kindsBody", "Un agente persistente es un puesto contratado que permanece en la empresa y recibe encargos. Un especialista por encargo sería un perfil temporal creado para un encargo concreto: su ejecución todavía no está soportada, así que nunca se contrata ni se simula como agente persistente.")}</p>
        </section>

        {data.specialists.length > 0 && (
          <section className="flex flex-col gap-1">
            <p className="text-sm font-medium">{tr("specialists", "Especialistas por encargo (no se instalan)")}</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {data.specialists.map((item) => <li key={item.localKey}>{item.title} <code>{item.localKey}</code></li>)}
            </ul>
          </section>
        )}

        {data.unsupported.length > 0 && (
          <section className="flex flex-col gap-2 rounded-md border p-4" aria-label={tr("unsupportedTitle", "Secciones no soportadas")}>
            <p className="text-sm font-medium">{tr("unsupportedTitle", "Secciones no soportadas por el instalador actual")}</p>
            {data.unsupported.map((entry) => (
              <label key={entry.section} className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={acknowledged.has(entry.section)}
                  onCheckedChange={(checked) => setAcknowledged((current) => {
                    const next = new Set(current);
                    if (checked === true) next.add(entry.section); else next.delete(entry.section);
                    return next;
                  })}
                  aria-label={entry.section}
                />
                <span><strong>{entry.section}</strong> ({entry.count}): {entry.reason} {tr("acknowledge", "Entiendo que no se instalará.")}</span>
              </label>
            ))}
          </section>
        )}

        {data.profiles.map((profile) => {
          const draft = draftFor(profile);
          const missing = profile.skills.filter((skill) => skill.status !== "installed");
          const id = `install-${profile.localKey.replace("/", "-")}`;
          return (
            <section key={profile.localKey} className="flex flex-col gap-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{profile.title}</h3>
                <Badge variant="outline">{tr("persistent", "Puesto persistente")} · {profile.teamName}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{profile.purpose}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-name`}>{tr("name", "Nombre del agente")}</Label>
                  <Input id={`${id}-name`} value={draft.name} maxLength={120} onChange={(event) => patchDraft(profile, { name: event.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-role`}>{tr("role", "Rol")}</Label>
                  <Pick id={`${id}-role`} value={draft.role} placeholder={tr("chooseRole", "Elige un rol")}
                    options={AGENT_ROLES.map((role) => ({ value: role, label: t(`agent.roles.${role}`, { defaultValue: AGENT_ROLE_LABELS[role as AgentRole] }) }))}
                    onChange={(value) => patchDraft(profile, { role: value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-adapter`}>{tr("adapter", "Entorno de ejecución")}</Label>
                  <Pick id={`${id}-adapter`} value={draft.adapterType || availableAdapters[0]?.type || ""}
                    placeholder={tr("chooseAdapter", "Elige un adaptador disponible")}
                    disabled={availableAdapters.length === 0}
                    options={availableAdapters.map((adapter) => ({ value: adapter.type, label: adapter.label }))}
                    onChange={(value) => patchDraft(profile, { adapterType: value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-manager`}>{tr("manager", "Responsable")}</Label>
                  <Pick id={`${id}-manager`}
                    value={draft.managerMode === "existing" ? draft.existingAgentId ?? NO_MANAGER : draft.managerMode === "package" ? "__package__" : NO_MANAGER}
                    placeholder={tr("chooseManager", "Elige un responsable")}
                    options={[
                      { value: NO_MANAGER, label: tr("noManager", "Sin responsable asignado") },
                      ...(profile.reportsToLocalKey ? [{ value: "__package__", label: tr("packageManager", "El responsable definido en el paquete") }] : []),
                      ...liveAgents.map((agent) => ({ value: agent.id, label: `${agent.name} · ${agent.role}` })),
                    ]}
                    onChange={(value) => patchDraft(profile, value === NO_MANAGER
                      ? { managerMode: "none", existingAgentId: null }
                      : value === "__package__"
                        ? { managerMode: "package", existingAgentId: null }
                        : { managerMode: "existing", existingAgentId: value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-env`}>{tr("environment", "Entorno")}</Label>
                  <Pick id={`${id}-env`} value={draft.environmentId ?? NO_ENVIRONMENT} placeholder={tr("chooseEnvironment", "Elige un entorno")}
                    options={[
                      { value: NO_ENVIRONMENT, label: tr("noEnvironment", "Sin entorno predeterminado") },
                      ...activeEnvironments.map((environment) => ({ value: environment.id, label: environment.name })),
                    ]}
                    onChange={(value) => patchDraft(profile, { environmentId: value === NO_ENVIRONMENT ? null : value })} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={draft.useInstructions} aria-label={tr("useInstructions", "Usar este texto revisado como instrucciones del agente")}
                    onCheckedChange={(checked) => patchDraft(profile, { useInstructions: checked === true })} />
                  <span>{tr("useInstructions", "Usar este texto revisado como instrucciones del agente")}</span>
                </label>
                <p className="text-sm text-muted-foreground">{tr("instructionsNote", "Por defecto el propósito y los criterios son solo referencia. Si lo marcas, el texto revisado se envía por la API de instrucciones existente.")}</p>
                {draft.useInstructions && (
                  <Textarea value={draft.instructionsText} rows={6} maxLength={20_000}
                    aria-label={tr("instructionsText", "Texto de instrucciones revisado")}
                    onChange={(event) => patchDraft(profile, { instructionsText: event.target.value })} />
                )}
              </div>

              {profile.skills.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{tr("skills", "Skills requeridas (versión exacta)")}</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {profile.skills.map((skill) => (
                      <li key={`${skill.key}@${skill.version}`} className="flex flex-wrap items-center gap-2">
                        <code>{skill.key}@{skill.version}</code>
                        <Badge variant={skill.status === "installed" ? "secondary" : "outline"}>
                          {skill.status === "installed" ? tr("installed", "instalada") : skill.status === "missing" ? tr("missing", "falta") : tr("unavailable", "no disponible")}
                        </Badge>
                        {skill.status === "missing" && (
                          <Button type="button" size="sm" variant="outline" disabled={installSkill.isPending} onClick={() => installSkill.mutate(skill.key)}>
                            {tr("installSkill", "Instalar desde el catálogo de skills")}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {missing.length > 0 && (
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox checked={draft.acceptPendingSkills} aria-label={tr("acceptPending", "Acepto contratar sin estas skills; quedan pendientes.")}
                        onCheckedChange={(checked) => patchDraft(profile, { acceptPendingSkills: checked === true })} />
                      <span>{tr("acceptPending", "Acepto contratar sin estas skills; quedan pendientes.")}</span>
                    </label>
                  )}
                </div>
              )}
              {profile.suggestedCostLimit && (
                <p className="text-sm text-muted-foreground">
                  {tr("suggestedCost", "Coste sugerido de referencia")}: {profile.suggestedCostLimit.amountMinor} {profile.suggestedCostLimit.currency}. {tr("suggestedCostNote", "No se convierte en presupuesto ni autoriza gasto.")}
                </p>
              )}
            </section>
          );
        })}

        <p className="text-sm text-muted-foreground">
          {tr("noAuthority", "El paquete no aporta permisos, credenciales, configuración de adaptador ni conexiones. Esas decisiones siguen en sus pantallas y aprobaciones habituales.")}
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {onBack ? <Button type="button" variant="outline" onClick={onBack}>{tr("back", "Volver al catálogo")}</Button> : <span />}
          <Button type="button" disabled={createReceipt.isPending || blocking || !allAcknowledged || data.profiles.length + chosenResources.length === 0}
            onClick={() => { setError(null); createReceipt.mutate(data); }}>
            {createReceipt.isPending ? tr("creating", "Guardando recibo…") : tr("createReceipt", "Guardar revisión e iniciar instalación")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function statusLabel(status: InstallationItemStatus): string {
  switch (status) {
    case "planned": return "Pendiente de enviar";
    case "submitting": return "Reclamado · bloqueado hasta confirmar";
    case "pending_approval": return "Pendiente de aprobación";
    case "hired": return "Contratado";
    case "unknown": return "Bloqueado · resultado sin confirmar";
    case "blocked": return "Bloqueado";
    case "cancelled": return "Cancelado";
    case "creating": return "Creando borrador · reanudable";
    case "created": return "Borrador creado";
    case "conflict": return "Conflicto · no se sobrescribe";
  }
}

function ResourceChoice({ resource, checked, missing, tr, onChange }: {
  resource: InstallPlanResource;
  checked: boolean;
  missing: Array<{ kind: string; localId: string }>;
  tr: (key: string, value: string) => string;
  onChange: (checked: boolean) => void;
}) {
  const id = `resource-${resource.kind}-${resource.localId}`;
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          <Checkbox id={id} checked={checked} disabled={!resource.installable}
            onCheckedChange={(value) => onChange(value === true)} />
          <span>{resource.title}</span>
        </label>
        <Badge variant={resource.installable ? "secondary" : "outline"}>
          {PACKAGE_RESOURCE_KIND_LABELS[resource.kind]}{resource.installable ? "" : ` · ${tr("notInstallable", "no instalable")}`}
        </Badge>
      </div>
      {resource.blockers.length > 0 && (
        <ul role="note" className="list-disc pl-5 text-sm text-destructive">
          {resource.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      )}
      {resource.installable && resource.notRepresented.length > 0 && (
        <div className="text-sm text-muted-foreground">
          <p className="font-medium">{tr("notRepresented", "Qué no se traslada o queda por decidir")}</p>
          <ul className="list-disc pl-5">
            {resource.notRepresented.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      )}
      {resource.dependsOn.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {tr("dependsOn", "Hace referencia a")}: {resource.dependsOn.map((dep) => `${PACKAGE_RESOURCE_KIND_LABELS[dep.kind]} ${dep.localId}`).join(", ")}.
        </p>
      )}
      {checked && missing.length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          {tr("selectDependencies", "Selecciona también los recursos a los que hace referencia")}: {missing.map((dep) => dep.localId).join(", ")}.
        </p>
      )}
    </li>
  );
}

function InstallationReceipt({ companyId, installation, onChanged, onBack }: {
  companyId: string;
  installation: PackageInstallation;
  onChanged: () => void;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const tr = (key: string, value: string) => t(`productization.catalog.install.${key}`, { defaultValue: value });
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const lockRef = useRef(false);

  const byKey = new Map(installation.items.map((item) => [item.localKey, item]));
  const untouched = installation.items.every((item) => item.status === "planned" || item.status === "cancelled");
  const resourceItems = installation.items.filter((item) => item.kind !== "persistent_agent");
  const installable = resourceItems.filter((item) => item.status === "planned" || item.status === "creating");
  const notSelected = (installation.plan.resources ?? []).filter((resource) => resource.outcome !== "selected");

  async function run(item: InstallationItem, action: () => Promise<string | void>) {
    if (lockRef.current) return;
    lockRef.current = true;
    setBusyItem(item.id);
    setMessage(null);
    try {
      const result = await action();
      if (result) setMessage(result);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : tr("actionFailed", "La acción no se pudo completar."));
    } finally {
      lockRef.current = false;
      setBusyItem(null);
      onChanged();
    }
  }

  /**
   * Claim once, POST the claimed body once, then reconcile. Never retries.
   *
   * Scope: `companyId` and `installation.id` are captured when the click happens and are used for the
   * claim, the POST and the reconcile alike, so a company/profile switch while the chain is in flight
   * cannot redirect any step to another scope. The panel is keyed by company and package, so the old
   * instance only finishes its own chain and its late state updates are discarded with it.
   * A claim that fails or whose response is lost sends nothing; the item may then be claimed on the
   * server and stays blocked until reconciliation finds its agent.
   */
  function submit(item: InstallationItem) {
    return run(item, async () => {
      let claim: Awaited<ReturnType<typeof portableCatalogApi.claimItem>>;
      try {
        claim = await portableCatalogApi.claimItem(companyId, installation.id, item.id);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "";
        throw new Error(`${tr("claimFailed", "No se pudo confirmar la reclamación y no se envió ninguna solicitud. Si el servidor llegó a reclamarla, el puesto queda bloqueado hasta que aparezca su agente; consulta el estado.")} ${detail}`.trim());
      }
      if (claim.item.id !== item.id || claim.endpoint !== `/companies/${companyId}/agent-hires`) {
        throw new Error(tr("claimScopeMismatch", "La reclamación no corresponde a esta empresa o puesto; no se envió ninguna solicitud y el puesto queda bloqueado."));
      }
      let hireError: string | null = null;
      try {
        await portableCatalogApi.submitHire(companyId, claim);
      } catch (cause) {
        hireError = cause instanceof Error ? cause.message : "error";
      }
      let reconciled: Awaited<ReturnType<typeof portableCatalogApi.reconcileItem>>;
      try {
        reconciled = await portableCatalogApi.reconcileItem(companyId, installation.id, item.id);
      } catch {
        return `${tr("reconcileFailed", "No se pudo consultar el estado tras enviar. El puesto queda bloqueado y no se reenvía; usa «Consultar estado».")} ${hireError ?? ""}`.trim();
      }
      if (reconciled.found) return tr("hireRecorded", "La solicitud quedó registrada con el estado real de la empresa.");
      return hireError
        ? `${tr("hireUncertain", "La solicitud no se confirmó. El puesto queda bloqueado: no se reenvía ni se puede liberar.")} ${hireError}`
        : tr("hireNotYetVisible", "La solicitud se envió pero aún no aparece; el puesto queda bloqueado hasta que aparezca su agente.");
    });
  }

  const reconcile = (item: InstallationItem) => run(item, async () => {
    const result = await portableCatalogApi.reconcileItem(companyId, installation.id, item.id);
    if (item.kind !== "persistent_agent") {
      return result.found
        ? tr("resourceReconciled", "Borrador localizado y vinculado a este recibo.")
        : tr("resourceNoMatch", "Aún no existe el borrador. Puedes reanudar la creación sin riesgo de duplicarlo.");
    }
    return result.found ? tr("reconciled", "Estado actualizado desde la empresa.") : tr("noMatch", "Aún no aparece un agente con esta referencia; el puesto sigue bloqueado y no se reenvía.");
  });

  const cancel = (item: InstallationItem) => run(item, async () => {
    await portableCatalogApi.cancelItem(companyId, installation.id, item.id);
    return item.kind === "persistent_agent"
      ? tr("cancelled", "Puesto cancelado antes de reclamar; no se generó ninguna solicitud.")
      : tr("resourceCancelled", "Recurso cancelado antes de instalar; no se creó nada.");
  });

  /**
   * Resource installs are server-side and resumable: the server creates the draft under a unique identity,
   * so repeating this after an error or a lost response can only link the same row. Scope ids are captured
   * at click time like the agent chain.
   */
  const installResource = (item: InstallationItem) => run(item, async () => {
    const result = await portableCatalogApi.installResource(companyId, installation.id, item.id);
    switch (result.outcome) {
      case "created": return tr("resourceCreated", "Borrador creado. Sigue sin publicar ni activar.");
      case "adopted": return tr("resourceAdopted", "El borrador ya existía de un intento interrumpido y se ha vinculado; no se duplicó.");
      case "already_created": return tr("resourceAlready", "Este recurso ya estaba instalado.");
      case "conflict": return tr("resourceConflict", "Ya existe algo con esa identidad que no coincide con el paquete. No se sobrescribe; resuélvelo y vuelve a comprobar.");
      default: return tr("resourcePending", "El borrador aún no está confirmado; puedes reanudar sin riesgo de duplicar.");
    }
  });

  /** Sequential, stops at the first item that does not end up created. */
  const installAll = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    setMessage(null);
    let installed = 0;
    try {
      for (const item of installable) {
        setBusyItem(item.id);
        const result = await portableCatalogApi.installResource(companyId, installation.id, item.id);
        if (result.item.status !== "created") {
          setMessage(tr("installStopped", "La instalación se detuvo en un recurso que no quedó creado; revisa su estado."));
          return;
        }
        installed += 1;
      }
      setMessage(`${tr("installedCount", "Borradores instalados")}: ${installed}.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : tr("actionFailed", "La acción no se pudo completar."));
    } finally {
      lockRef.current = false;
      setBusyItem(null);
      onChanged();
    }
  };

  const discard = useMutation({
    retry: false,
    mutationFn: () => portableCatalogApi.discardInstallation(companyId, installation.id),
    onSuccess: onChanged,
    onError: (cause: Error) => setMessage(cause.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr("receiptTitle", "Instalación")}: {installation.packageKey}@{installation.packageVersion}</CardTitle>
        <CardDescription>
          <Badge variant={installation.status === "completed" ? "default" : "secondary"}>{installation.status}</Badge>{" "}
          {tr("receiptNote", "Recibo duradero: repetir la instalación vuelve a este mismo recibo y se reclama cada puesto una sola vez. Un puesto reclamado cuyo resultado no se conoce queda bloqueado hasta que aparezca su agente.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {installation.plan.unsupported.length > 0 && (
          <section className="rounded-md border p-3 text-sm">
            <p className="font-medium">{tr("notInstalled", "No instalado (reconocido al revisar)")}</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {installation.plan.unsupported.map((entry) => <li key={entry.section}>{entry.section} ({entry.count})</li>)}
            </ul>
          </section>
        )}
        {resourceItems.length > 0 && (
          <section className="flex flex-col gap-3" aria-label={tr("resourceItemsTitle", "Recursos")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{tr("resourceItemsTitle", "Recursos instalados como borrador")}</p>
              {installable.length > 0 && (
                <Button type="button" size="sm" disabled={busyItem !== null} onClick={() => void installAll()}>
                  {tr("installAll", "Crear los borradores pendientes")}
                </Button>
              )}
            </div>
            <ul className="flex flex-col gap-3">
              {resourceItems.map((item) => {
                const review = isResourceReview(item.review) ? item.review : null;
                const busy = busyItem === item.id;
                return (
                  <li key={item.id} className="flex flex-col gap-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {review?.title ?? item.localKey}{" "}
                        <span className="text-muted-foreground">· {item.kind !== "persistent_agent" ? PACKAGE_RESOURCE_KIND_LABELS[item.kind] : ""}</span>
                      </span>
                      <Badge variant={item.status === "created" ? "default" : "secondary"}>{statusLabel(item.status)}</Badge>
                    </div>
                    {item.status === "created" && item.result && (
                      <p className="text-sm text-muted-foreground">
                        {item.result.state === "unpublished"
                          ? tr("createdUnpublished", "Creado sin publicar. Publicarlo es una acción aparte en su pantalla.")
                          : tr("createdDraft", "Creado como borrador. Activarlo es una acción aparte en su pantalla.")}
                        {item.result.adopted ? ` ${tr("adoptedNote", "Se vinculó el borrador de un intento interrumpido.")}` : ""}
                      </p>
                    )}
                    {item.status === "creating" && (
                      <p role="note" className="text-sm text-muted-foreground">
                        {tr("creatingNote", "Un intento anterior quedó sin confirmar. Reanudar es seguro: el borrador tiene una identidad única, así que como máximo se vincula el mismo.")}
                      </p>
                    )}
                    {item.status === "conflict" && (
                      <p role="alert" className="text-sm text-destructive">
                        {tr("conflictNote", "Existe un elemento con esta identidad que no coincide con el paquete o no se creó tras la instalación. No se modifica. Si lo retiras o renombras, puedes volver a comprobar.")}
                      </p>
                    )}
                    {item.note && <p className="text-sm text-muted-foreground">{item.note}</p>}
                    {review && review.notRepresented.length > 0 && item.status !== "created" && (
                      <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {review.notRepresented.map((note) => <li key={note}>{note}</li>)}
                      </ul>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {(item.status === "planned" || item.status === "creating" || item.status === "conflict") && (
                        <Button type="button" size="sm" disabled={busy || busyItem !== null} onClick={() => void installResource(item)}>
                          {busy ? tr("creatingDraft", "Creando borrador…")
                            : item.status === "planned" ? tr("createDraft", "Crear borrador")
                              : item.status === "creating" ? tr("resumeDraft", "Reanudar")
                                : tr("recheckDraft", "Volver a comprobar")}
                        </Button>
                      )}
                      {item.status === "creating" && (
                        <Button type="button" size="sm" variant="outline" disabled={busyItem !== null} onClick={() => void reconcile(item)}>
                          {tr("checkStatus", "Consultar estado")}
                        </Button>
                      )}
                      {item.status === "planned" && (
                        <Button type="button" size="sm" variant="ghost" disabled={busyItem !== null} onClick={() => void cancel(item)}>
                          {tr("cancelResource", "Cancelar este recurso")}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {notSelected.length > 0 && (
          <section className="rounded-md border p-3 text-sm">
            <p className="font-medium">{tr("resourcesNotInstalled", "Recursos no instalados")}</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {notSelected.map((resource) => (
                <li key={`${resource.kind}/${resource.localId}`}>
                  {resource.title} · {PACKAGE_RESOURCE_KIND_LABELS[resource.kind]} ·{" "}
                  {resource.outcome === "not_selected" ? tr("notSelected", "no seleccionado") : `${tr("notInstallable", "no instalable")}: ${resource.blockers.join(" ")}`}
                </li>
              ))}
            </ul>
          </section>
        )}
        <ul className="flex flex-col gap-3">
          {installation.items.filter((item) => item.kind === "persistent_agent").map((item) => {
            if (isResourceReview(item.review)) return null;
            const itemReview = item.review;
            const manager = itemReview.reportsToLocalKey ? byKey.get(itemReview.reportsToLocalKey) : null;
            const managerReady = !manager || manager.status === "pending_approval" || manager.status === "hired";
            const blocked = item.status === "submitting" || item.status === "unknown";
            const busy = busyItem === item.id;
            return (
              <li key={item.id} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{itemReview.name} <span className="text-muted-foreground">· {itemReview.role}</span></span>
                  <Badge variant={item.status === "hired" ? "default" : "secondary"}>{statusLabel(item.status)}</Badge>
                </div>
                {item.status === "pending_approval" && (
                  <p className="text-sm text-muted-foreground">{tr("pendingApproval", "El agente existe pero no está activo: espera la decisión en Aprobaciones. Aquí no se activa.")}</p>
                )}
                {blocked && (
                  <p role="note" className="text-sm text-muted-foreground">
                    {tr("blockedNote", "Bloqueado: la solicitud puede haberse creado aunque no se haya visto su respuesta. No se reenvía ni se puede liberar; solo «Consultar estado» puede resolverlo cuando el agente aparezca.")}
                  </p>
                )}
                {item.note && <p className="text-sm text-muted-foreground">{item.note}</p>}
                {item.status === "planned" && !managerReady && (
                  <p className="text-sm text-muted-foreground">{tr("managerFirst", "Contrata primero a su responsable en el paquete.")}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {item.status === "planned" && (
                    <Button type="button" size="sm" disabled={busy || busyItem !== null || !managerReady} onClick={() => void submit(item)}>
                      {busy ? tr("submitting", "Enviando solicitud…") : tr("submit", "Enviar solicitud de contratación")}
                    </Button>
                  )}
                  {(item.status === "submitting" || item.status === "unknown" || item.status === "pending_approval") && (
                    <Button type="button" size="sm" variant="outline" disabled={busyItem !== null} onClick={() => void reconcile(item)}>
                      {busy ? tr("checking", "Consultando estado…") : tr("checkStatus", "Consultar estado")}
                    </Button>
                  )}
                  {item.status === "planned" && (
                    <Button type="button" size="sm" variant="ghost" disabled={busyItem !== null} onClick={() => void cancel(item)}>
                      {tr("cancel", "Cancelar este puesto")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        <div className="flex items-center justify-between gap-2">
          {onBack ? <Button type="button" variant="outline" onClick={onBack}>{tr("back", "Volver al catálogo")}</Button> : <span />}
          {untouched && (
            <Button type="button" variant="outline" disabled={discard.isPending || busyItem !== null} onClick={() => discard.mutate()}>
              {tr("discard", "Descartar y revisar de nuevo")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export type { InstallPlan };
