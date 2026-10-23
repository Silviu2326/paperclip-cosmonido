import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OnboardingEvent,
  OnboardingEventResult,
  OnboardingPath,
} from "@paperclipai/shared/productization/onboarding-journey";
import { ApiError } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useLocation, useNavigate } from "@/lib/router";
import { TemplateLibraryNav } from "@/components/team-workspace/TeamWorkspaceLinks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductizationWorkbench } from "@/features/productization/ProductizationWorkbench";
import {
  productOnboardingApi,
  type ProductOnboardingEventResponse,
  type ProductOnboardingMutationResponse,
  type ProductOnboardingSnapshot,
  type ProductOnboardingUserEvent,
} from "@/features/productization/onboarding/api";
import type { ProductOnboardingPanelProps } from "@/features/productization/onboarding/ProductOnboardingPanel";
import type { AgentHireResponse } from "@/api/agents";
import { useTranslation } from "@/i18n";

const PATHS: Array<{ id: OnboardingPath; label: string; description: string }> = [
  { id: "entrepreneur", label: "Emprendedor", description: "Configura una empresa y prepara su primera oferta." },
  { id: "agency", label: "Agencia", description: "Prepara un recorrido para operar para varias empresas cliente." },
  { id: "commercial", label: "Comercial", description: "Prepara un equipo para prospección y seguimiento comercial." },
];

function onboardingKey(companyId: string) {
  return ["productization", "onboarding", companyId] as const;
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function mergeSnapshot(
  current: ProductOnboardingSnapshot | undefined,
  next: ProductOnboardingMutationResponse,
): ProductOnboardingSnapshot {
  if (current && isSnapshotNewer(current, next)) return current;
  return next;
}

function isSnapshotNewer(left: ProductOnboardingSnapshot, right: ProductOnboardingSnapshot): boolean {
  if (left.revision !== right.revision) return left.revision > right.revision;
  return Date.parse(left.serverNow) > Date.parse(right.serverNow);
}

function reasonFromResponse(value: ProductOnboardingEventResponse): OnboardingEventResult["reason"] {
  const reason = value.result.reason;
  if (reason === "invalid_evidence" || reason === "prerequisite_missing" || reason === "out_of_order" ||
      reason === "unknown_connection" || reason === "invalid_transition" || reason === "already_recorded") return reason;
  return value.result.accepted ? undefined : "invalid_transition";
}

export function Productization() {
  const { selectedCompanyId, loading: companyLoading } = useCompany();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // `#team` is the "create a team" entry point; it must work before a journey exists.
  const teamRequested = location.hash === "#team";
  const queryClient = useQueryClient();
  const companyRef = useRef<string | null>(selectedCompanyId);
  companyRef.current = selectedCompanyId;
  const [selectedPath, setSelectedPath] = useState<OnboardingPath | null>(null);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    setSelectedPath(null);
    setPageError("");
  }, [selectedCompanyId]);

  const journeyQuery = useQuery({
    queryKey: onboardingKey(selectedCompanyId ?? "no-company"),
    queryFn: ({ signal }) => {
      if (!selectedCompanyId) throw new Error("Company is required");
      return productOnboardingApi.get(selectedCompanyId, signal).then((snapshot) => {
        if (snapshot.journey.companyId !== selectedCompanyId) throw new Error("El recorrido devuelto no pertenece a la empresa seleccionada.");
        return snapshot;
      });
    },
    structuralSharing: (previous, next) => {
      const previousSnapshot = previous as ProductOnboardingSnapshot | undefined;
      const nextSnapshot = next as ProductOnboardingSnapshot;
      return previousSnapshot && isSnapshotNewer(previousSnapshot, nextSnapshot)
        ? previousSnapshot
        : nextSnapshot;
    },
    enabled: Boolean(selectedCompanyId),
    retry: false,
  });

  const savePath = useMutation({
    retry: false,
    mutationFn: (variables: { companyId: string; path: OnboardingPath; expectedRevision: number }) =>
      productOnboardingApi.selectPath(variables.companyId, {
        expectedRevision: variables.expectedRevision,
        path: variables.path,
      }),
    onSuccess: (result, variables) => {
      if (result.journey.companyId !== variables.companyId) {
        if (companyRef.current === variables.companyId) setPageError("El servidor devolvió un recorrido de otra empresa. Actualiza para revisar el estado.");
        return;
      }
      queryClient.setQueryData<ProductOnboardingSnapshot>(onboardingKey(variables.companyId), (current) =>
        mergeSnapshot(current, result));
      if (companyRef.current === variables.companyId) setSelectedPath(null);
    },
    onError: (error, variables) => {
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: onboardingKey(variables.companyId) });
      }
      if (companyRef.current === variables.companyId) setPageError(error.message);
    },
  });

  const current = journeyQuery.data;
  const notFound = isNotFound(journeyQuery.error);

  async function saveUserEvent(companyId: string, event: ProductOnboardingUserEvent) {
    const latest = queryClient.getQueryData<ProductOnboardingSnapshot>(onboardingKey(companyId));
    if (!latest) throw new Error(t("productOnboarding.errors.noSnapshot", { defaultValue: "Actualiza el recorrido antes de guardar." }));
    try {
      const response = await productOnboardingApi.recordEvent(companyId, {
        expectedRevision: latest.revision,
        event,
      });
      if (response.journey.companyId !== companyId || response.journey.id !== latest.journey.id) throw new Error("La respuesta no corresponde al recorrido actual.");
      const authoritative = queryClient.setQueryData<ProductOnboardingSnapshot>(onboardingKey(companyId), (snapshot) =>
        mergeSnapshot(snapshot ?? latest, response));
      if (!authoritative) throw new Error("No se pudo conservar el estado actualizado del recorrido.");
      return { ...authoritative, result: response.result };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: onboardingKey(companyId) });
      }
      throw error;
    }
  }

  async function saveAction(companyId: string, action: (revision: number) => Promise<ProductOnboardingMutationResponse>) {
    const latest = queryClient.getQueryData<ProductOnboardingSnapshot>(onboardingKey(companyId));
    if (!latest) throw new Error(t("productOnboarding.errors.noSnapshot", { defaultValue: "Actualiza el recorrido antes de guardar." }));
    try {
      const response = await action(latest.revision);
      if (response.journey.companyId !== companyId || response.journey.id !== latest.journey.id) throw new Error("La respuesta no corresponde al recorrido actual.");
      const authoritative = queryClient.setQueryData<ProductOnboardingSnapshot>(onboardingKey(companyId), (snapshot) =>
        mergeSnapshot(snapshot ?? latest, response));
      if (!authoritative) throw new Error("No se pudo conservar el estado actualizado del recorrido.");
      if (response.result?.accepted === false) throw new Error(t("productOnboarding.errors.rejected", { defaultValue: "El servidor no aceptó el cambio. Actualiza el recorrido y revisa el estado actual." }));
      return authoritative.journey;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: onboardingKey(companyId) });
      }
      throw error;
    }
  }

  const onboarding: ProductOnboardingPanelProps | null =
    selectedCompanyId && current && current.journey.companyId === selectedCompanyId ? {
      journey: current.journey,
      nowISOString: current.serverNow,
      availableAgents: current.availableAgents,
      availableAgentsTruncated: current.availableAgentsTruncated,
      eligibleGoals: current.eligibleGoals,
      eligibleGoalsTruncated: current.eligibleGoalsTruncated,
      onSubmitEvent: async (event: OnboardingEvent): Promise<OnboardingEventResult> => {
        if (event.type !== "business_suggestion_recorded") {
          throw new Error(t("productOnboarding.errors.eventNotSupported", { defaultValue: "Este cambio no se puede enviar desde el navegador." }));
        }
        const response = await saveUserEvent(selectedCompanyId, {
          type: event.type,
          ...(event.url ? { url: event.url } : {}),
        });
        return { journey: response.journey, accepted: response.result.accepted, reason: reasonFromResponse(response) };
      },
      onConfirmBusiness: (input) => saveAction(selectedCompanyId, (expectedRevision) =>
        productOnboardingApi.recordEvent(selectedCompanyId, {
          expectedRevision,
          event: { type: "business_confirmed", businessName: input.businessName, offer: input.offer },
        })),
      onConfirmContext: (input) => saveAction(selectedCompanyId, (expectedRevision) =>
        productOnboardingApi.recordEvent(selectedCompanyId, {
          expectedRevision,
          event: {
            type: "context_confirmed",
            audience: input.audience,
            desiredOutcome: input.desiredOutcome,
            ...(input.constraints ? { constraints: input.constraints } : {}),
          },
        })),
      onSelectTeam: (agentIds) => saveAction(selectedCompanyId, (expectedRevision) =>
        productOnboardingApi.selectTeam(selectedCompanyId, { expectedRevision, agentIds })),
      onActivateTeam: () => saveAction(selectedCompanyId, (expectedRevision) =>
        productOnboardingApi.confirmTeamUse(selectedCompanyId, { expectedRevision })),
      onLinkFirstJob: (goalId) => saveAction(selectedCompanyId, (expectedRevision) =>
        productOnboardingApi.linkFirstJob(selectedCompanyId, { expectedRevision, goalId })),
      onConfigureConnection: (connectionId) => navigate(`/apps/${encodeURIComponent(connectionId)}/permissions`),
      onBack: () => navigate("/apps"),
      onCancel: () => navigate("/"),
    } : null;

  const onHireCompleted = (_result: AgentHireResponse) => {
    if (!selectedCompanyId || companyRef.current !== selectedCompanyId) return;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agents", selectedCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["productization", "assignments", selectedCompanyId] }),
      queryClient.invalidateQueries({ queryKey: onboardingKey(selectedCompanyId) }),
    ]);
  };

  if (companyLoading) return <p role="status" className="text-sm text-muted-foreground">{t("productization.loadingCompany", { defaultValue: "Cargando empresa…" })}</p>;
  if (!selectedCompanyId) return <p className="text-sm text-muted-foreground">{t("productization.chooseCompany", { defaultValue: "Selecciona una empresa para continuar." })}</p>;

  if (journeyQuery.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("productization.loading", { defaultValue: "Cargando puesta en marcha…" })}</p>;

  if (notFound && teamRequested) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TemplateLibraryNav current="create" />
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/productization")}>
            {t("uxTeam.productization.chooseJourney", { defaultValue: "Elegir un recorrido de puesta en marcha" })}
          </Button>
        </div>
        <ProductizationWorkbench companyId={selectedCompanyId} onboarding={null} onHireCompleted={onHireCompleted} />
      </div>
    );
  }

  if (notFound) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <TemplateLibraryNav current="create" />
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{t("productization.startTitle", { defaultValue: "Prepara tu puesta en marcha" })}</h1>
          <p className="text-sm text-muted-foreground">{t("productization.startDescription", { defaultValue: "Elige un recorrido para esta empresa. Podrás retomarlo desde el estado guardado en el servidor." })}</p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {PATHS.map((path) => (
            <Card key={path.id} className={selectedPath === path.id ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle>{t(`productization.paths.${path.id}`, { defaultValue: path.label })}</CardTitle>
                <CardDescription>{t(`productization.paths.${path.id}Description`, { defaultValue: path.description })}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" variant={selectedPath === path.id ? "default" : "outline"} aria-pressed={selectedPath === path.id} onClick={() => setSelectedPath(path.id)}>
                  {t(selectedPath === path.id ? "productization.pathSelected" : "productization.choosePath", { defaultValue: selectedPath === path.id ? "Seleccionado" : "Elegir este recorrido" })}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        {pageError && <p role="alert" className="text-sm text-destructive">{pageError}</p>}
        {journeyQuery.error && !isNotFound(journeyQuery.error) && <p role="alert" className="text-sm text-destructive">{journeyQuery.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => void journeyQuery.refetch()} disabled={journeyQuery.isFetching}>{t("productization.refresh", { defaultValue: "Actualizar" })}</Button>
          <Button
            type="button"
            disabled={!selectedPath || savePath.isPending}
            onClick={() => {
              if (!selectedPath || !selectedCompanyId || companyRef.current !== selectedCompanyId) return;
              setPageError("");
              savePath.mutate({ companyId: selectedCompanyId, path: selectedPath, expectedRevision: 0 });
            }}
          >{t(savePath.isPending ? "productization.starting" : "productization.start", { defaultValue: savePath.isPending ? "Guardando recorrido…" : "Empezar recorrido" })}</Button>
        </div>
      </section>
    );
  }

  if (journeyQuery.isError || !current) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("productization.loadErrorTitle", { defaultValue: "No se pudo cargar la puesta en marcha" })}</CardTitle>
          <CardDescription>{journeyQuery.error instanceof Error ? journeyQuery.error.message : t("productization.loadErrorDescription", { defaultValue: "Inténtalo de nuevo para recuperar el recorrido guardado." })}</CardDescription>
        </CardHeader>
        <CardContent><Button type="button" onClick={() => void journeyQuery.refetch()} disabled={journeyQuery.isFetching}>{t("productization.retry", { defaultValue: "Volver a intentar" })}</Button></CardContent>
      </Card>
    );
  }

  return <div className="flex flex-col gap-4">
    <TemplateLibraryNav current="create" />
    <ProductizationWorkbench companyId={selectedCompanyId} onboarding={onboarding} onHireCompleted={onHireCompleted}
      onRefreshOnboarding={() => void journeyQuery.refetch()} refreshingOnboarding={journeyQuery.isFetching} />
  </div>;
}
