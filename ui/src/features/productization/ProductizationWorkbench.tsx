import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Users } from "lucide-react";
import type { Agent, Assignment } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { assignmentsApi } from "@/api/assignments";
import { Link, useLocation, useNavigate } from "@/lib/router";
import { getOnboardingProgress } from "@paperclipai/shared/productization/onboarding-journey";
import type { PortablePackage } from "@paperclipai/shared/productization/portable-package";
import type { AgentHireResponse } from "@/api/agents";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/i18n";
import { PortablePackagePreviewPanel } from "./catalog/PortablePackagePreviewPanel";
import { ProfileHirePanel } from "./hiring";
import {
  ProductOnboardingPanel,
  useOnboardingStepLabel,
  type ProductOnboardingPanelProps,
} from "./onboarding/ProductOnboardingPanel";

type WorkbenchTab = "catalog" | "hiring" | "onboarding" | "team";

/**
 * Maps a location hash to a tab. `#team` is the "create a team" entry point, so
 * it opens the template selection (the first step of select -> review -> hire),
 * not the read-only roster tab. `#current-team` opens that roster tab.
 */
export function workbenchTabFromHash(hash: string): WorkbenchTab | null {
  switch (hash.replace(/^#/, "").toLowerCase()) {
    case "team":
    case "catalog":
      return "catalog";
    case "hiring":
      return "hiring";
    case "onboarding":
      return "onboarding";
    case "current-team":
      return "team";
    default:
      return null;
  }
}

/** Prefer the principal task; fall back to the assignment alias the parent keeps. */
export function assignmentTaskHref(assignment: Pick<Assignment, "id" | "rootIssueId">): string {
  return assignment.rootIssueId
    ? `/issues/${encodeURIComponent(assignment.rootIssueId)}`
    : `/assignments/${encodeURIComponent(assignment.id)}`;
}

type ProfileSelection = {
  portablePackage: PortablePackage;
  profile: PortablePackage["teams"][number]["members"][number];
  teamId: string;
};

export interface ProductizationWorkbenchProps {
  companyId: string;
  /** Real, scoped journey and persistence callbacks supplied by its owner. */
  onboarding: ProductOnboardingPanelProps | null;
  onHireCompleted?: (result: AgentHireResponse) => void;
  onRefreshOnboarding?: () => void;
  refreshingOnboarding?: boolean;
}

/**
 * Composes the three S4 slices without registering a route or making up an
 * account/journey. Its host must mount the preview router and supply actual
 * onboarding persistence. Changing company remounts all draft UI state.
 */
export function ProductizationWorkbench(props: ProductizationWorkbenchProps) {
  return <CompanyWorkbench key={props.companyId} {...props} />;
}

function CompanyWorkbench({ companyId, onboarding, onHireCompleted, onRefreshOnboarding, refreshingOnboarding }: ProductizationWorkbenchProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const stepLabel = useOnboardingStepLabel();
  const [tab, setTab] = useState<string>(() => workbenchTabFromHash(location.hash) ?? "catalog");
  const [selection, setSelection] = useState<ProfileSelection | null>(null);
  const queryClient = useQueryClient();
  const scopedOnboarding = onboarding?.journey.companyId === companyId ? onboarding : null;
  const progress = scopedOnboarding ? getOnboardingProgress(scopedOnboarding.journey, scopedOnboarding.nowISOString) : null;

  useEffect(() => {
    const next = workbenchTabFromHash(location.hash);
    if (next) setTab(next);
  }, [location.hash]);
  const agents = useQuery({
    queryKey: ["agents", companyId],
    queryFn: () => agentsApi.list(companyId),
    enabled: tab === "team",
  });
  const assignments = useQuery({
    queryKey: ["productization", "assignments", companyId],
    queryFn: () => assignmentsApi.list(companyId, { limit: 5 }),
    enabled: tab === "team",
  });

  function handleHireCompleted(result: AgentHireResponse) {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agents", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["productization", "assignments", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["productization", "hire", "agents", companyId] }),
    ]);
    onHireCompleted?.(result);
  }

  function selectProfile(next: ProfileSelection) {
    setSelection(next);
    setTab("hiring");
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {t("uxTeam.workbench.title", { defaultValue: "Crea tu equipo y prepara su primera tarea" })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("uxTeam.workbench.description", {
            defaultValue: "Elige una plantilla de equipo, revisa sus perfiles, contrata los que necesites y confirma el contexto del negocio.",
          })}
        </p>
        {progress && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {progress.journeyCompleted
                ? t("uxTeam.workbench.resumeDone", { defaultValue: "Preparación completada." })
                : t("uxTeam.workbench.resume", { defaultValue: "Preparación en curso. Siguiente paso: {{step}}", step: stepLabel(progress.nextStep) })}
            </span>
            {!progress.journeyCompleted && tab !== "onboarding" && (
              <Button type="button" size="sm" variant="outline" onClick={() => setTab("onboarding")}>
                {t("uxTeam.workbench.resumeAction", { defaultValue: "Continuar preparación" })}
              </Button>
            )}
          </div>
        )}
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap" aria-label={t("productization.workbench.navigation", { defaultValue: "Configuración inicial" })}>
          <TabsTrigger value="catalog">{t("uxTeam.workbench.tabTemplates", { defaultValue: "Plantillas de equipo" })}</TabsTrigger>
          <TabsTrigger value="hiring">{t("uxTeam.workbench.tabHire", { defaultValue: "Contratar" })}</TabsTrigger>
          <TabsTrigger value="onboarding">{t("uxTeam.workbench.tabFirstTask", { defaultValue: "Primera tarea" })}</TabsTrigger>
          <TabsTrigger value="team">{t("uxTeam.workbench.tabTeamTasks", { defaultValue: "Equipo y tareas" })}</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" forceMount hidden={tab !== "catalog"}>
          <PortablePackagePreviewPanel companyId={companyId} onSelectProfile={selectProfile} />
        </TabsContent>
        <TabsContent value="hiring" forceMount hidden={tab !== "hiring"}>
          {selection ? (
            <ProfileHirePanel
              key={`${selection.portablePackage.packageKey}:${selection.portablePackage.packageVersion}:${selection.teamId}:${selection.profile.id}`}
              companyId={companyId}
              portablePackage={selection.portablePackage}
              teamId={selection.teamId}
              profile={selection.profile}
              onCompleted={handleHireCompleted}
              onCancel={() => setTab("catalog")}
            />
          ) : (
            <EmptyState
              icon={Users}
              message={t("uxTeam.workbench.chooseProfile", { defaultValue: "Elige primero un perfil de una plantilla de equipo revisada." })}
              action={t("uxTeam.workbench.browseTemplates", { defaultValue: "Elegir plantilla" })}
              onAction={() => setTab("catalog")}
              hideActionIcon
            />
          )}
        </TabsContent>
        <TabsContent value="onboarding" forceMount hidden={tab !== "onboarding"}>
          {scopedOnboarding ? (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end"><Button type="button" variant="outline" onClick={onRefreshOnboarding} disabled={refreshingOnboarding}>{t("productization.refreshOnboarding", { defaultValue: "Actualizar recorrido" })}</Button></div>
              <ProductOnboardingPanel {...scopedOnboarding} />
            </div>
          ) : (
            <EmptyState
              icon={ClipboardList}
              message={t("productization.workbench.journeyUnavailable", {
                defaultValue: "El recorrido inicial de esta empresa aún no está disponible.",
              })}
              description={t("uxTeam.workbench.journeyUnavailableDescription", {
                defaultValue: "Puedes revisar plantillas de equipo y perfiles mientras se completa la configuración de la cuenta.",
              })}
              action={t("uxTeam.workbench.browseTemplates", { defaultValue: "Elegir plantilla" })}
              onAction={() => setTab("catalog")}
              hideActionIcon
            />
          )}
        </TabsContent>
        <TabsContent value="team" forceMount hidden={tab !== "team"}>
          <TeamAndJobs agents={agents.data ?? []} assignments={assignments.data ?? []} agentsLoading={agents.isLoading} assignmentsLoading={assignments.isLoading}
            agentsError={agents.error} assignmentsError={assignments.error}
            onRefresh={() => void Promise.all([agents.refetch(), assignments.refetch()])} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function TeamAndJobs({
  agents, assignments, agentsLoading, assignmentsLoading, agentsError, assignmentsError, onRefresh,
}: {
  agents: Agent[];
  assignments: Assignment[];
  agentsLoading: boolean;
  assignmentsLoading: boolean;
  agentsError: Error | null;
  assignmentsError: Error | null;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("productization.workbench.teamTitle", { defaultValue: "Equipo de esta empresa" })}</CardTitle>
          <CardDescription>{t("productization.workbench.teamDescription", { defaultValue: "Estado actual de los agentes devuelto por Paperclip." })}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {agentsLoading ? <p role="status" className="text-sm text-muted-foreground">{t("productization.loadingTeam", { defaultValue: "Cargando equipo…" })}</p>
            : agentsError ? <p role="alert" className="text-sm text-destructive">{agentsError.message}</p>
              : agents.length === 0 ? <EmptyState icon={Users} message={t("productization.workbench.noAgents", { defaultValue: "Aún no hay agentes en esta empresa." })} />
                : agents.map((agent) => <div key={agent.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <Link className="min-w-0 truncate font-medium text-primary underline" to={`/agents/${encodeURIComponent(agent.urlKey)}`}>{agent.name}</Link>
                  <Badge variant={agent.status === "pending_approval" ? "outline" : "secondary"}>{agent.status}</Badge>
                </div>)}
          <div className="flex justify-end"><Button type="button" variant="outline" onClick={() => navigate("/agents/all")}>{t("uxTeam.workbench.openTeam", { defaultValue: "Abrir Equipo" })}</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("uxTeam.workbench.tasksTitle", { defaultValue: "Tareas reales" })}</CardTitle>
          <CardDescription>{t("uxTeam.workbench.tasksDescription", { defaultValue: "Actividad existente. El recorrido solo se vincula a una tarea cuando el servidor confirma su inicio." })}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {assignmentsLoading ? <p role="status" className="text-sm text-muted-foreground">{t("uxTeam.workbench.loadingTasks", { defaultValue: "Cargando tareas…" })}</p>
            : assignmentsError ? <p role="alert" className="text-sm text-destructive">{assignmentsError.message}</p>
              : assignments.length === 0 ? <EmptyState icon={ClipboardList} message={t("uxTeam.workbench.noTasks", { defaultValue: "Todavía no hay tareas para mostrar." })} action={t("uxTeam.workbench.openTasks", { defaultValue: "Abrir Tareas" })} onAction={() => navigate("/issues")} hideActionIcon />
                : assignments.map((assignment) => <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <Link className="min-w-0 truncate font-medium text-primary underline" to={assignmentTaskHref(assignment)}>{assignment.title}</Link>
                  <Badge variant="outline">{assignment.assignmentStatus}</Badge>
                </div>)}
          <div className="flex justify-end"><Button type="button" variant="outline" onClick={onRefresh}>{t("productization.refresh", { defaultValue: "Actualizar" })}</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
