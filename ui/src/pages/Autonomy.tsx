import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { EXTERNAL_ACTION_TYPES, type AutonomyLevel, type AutonomyMatrixCell, type ExternalActionType } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { useSearchParams } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { autonomyApi } from "@/api/autonomy";
import { agentsApi } from "@/api/agents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { AUTONOMY_AGENT_PARAM, BackToTeamLink } from "@/components/team-workspace/TeamWorkspaceLinks";

const LEVEL_LABELS: Record<AutonomyLevel, string> = {
  draft_only: "Solo borrador",
  send_with_approval: "Envío con aprobación",
  send_direct: "Envío directo",
};

const ACTION_LABELS: Record<ExternalActionType, string> = {
  email: "Correo",
  message: "Mensaje",
  booking: "Reserva",
  stage_change: "Cambio de etapa",
  proposal: "Propuesta",
  publish: "Publicación",
  call: "Llamada",
  review_link: "Enlace de revisión",
};

const DIMENSION_LABELS: Record<string, string> = {
  appropriateness: "Adecuación",
  tone: "Tono",
  facts: "Hechos",
  proposed_action: "Acción propuesta",
};

const BENCH_STATUS_LABELS: Record<string, string> = {
  running: "en curso",
  done: "completado",
  failed: "fallido",
  cancelled: "cancelado",
};

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)} %`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type CellRef = { agentId: string; actionType: ExternalActionType };

export function Autonomy() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const agentFilterId = searchParams.get(AUTONOMY_AGENT_PARAM);
  const [panel, setPanel] = useState<CellRef | null>(null);
  const [raiseCell, setRaiseCell] = useState<AutonomyMatrixCell | null>(null);
  const [revokeCell, setRevokeCell] = useState<AutonomyMatrixCell | null>(null);

  useEffect(() => { setBreadcrumbs([{ label: t("nav.autonomy", { defaultValue: "Autonomía" }) }]); }, [setBreadcrumbs, t]);

  const matrix = useQuery({
    queryKey: ["autonomy", selectedCompanyId],
    queryFn: () => autonomyApi.matrix(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const agents = useQuery({
    queryKey: ["agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const benchMutation = useMutation({
    mutationFn: (cell: CellRef) => autonomyApi.runBench(selectedCompanyId!, { agentId: cell.agentId, actionType: cell.actionType }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["autonomy", selectedCompanyId] }),
  });

  const rows = useMemo(() => {
    const byAgent = new Map<string, AutonomyMatrixCell[]>();
    for (const cell of matrix.data ?? []) byAgent.set(cell.agentId, [...(byAgent.get(cell.agentId) ?? []), cell]);
    return [...byAgent.entries()];
  }, [matrix.data]);

  if (!selectedCompanyId) return <EmptyState icon={ShieldCheck} message={t("goals.selectOrg", { defaultValue: "Selecciona una empresa." })} />;
  if (matrix.isLoading) return <PageSkeleton variant="list" />;
  if (matrix.error) return <p role="alert" className="text-sm text-destructive">{errorMessage(matrix.error)}</p>;

  const agentName = (agentId: string) => agents.data?.find((agent) => agent.id === agentId)?.name ?? agentId;
  const panelCell = panel ? matrix.data?.find((cell) => cell.agentId === panel.agentId && cell.actionType === panel.actionType) ?? null : null;

  if (rows.length === 0) {
    return <EmptyState icon={ShieldCheck} message={t("autonomy.empty", { defaultValue: "Aún no hay agentes en esta empresa." })} />;
  }

  // The `agent` query parameter is a real filter: only that agent's row is shown,
  // and an unknown id falls back to the full matrix with an explicit notice.
  const filteredRows = agentFilterId ? rows.filter(([agentId]) => agentId === agentFilterId) : rows;
  const filterMissing = Boolean(agentFilterId) && filteredRows.length === 0;
  const visibleRows = filterMissing ? rows : filteredRows;
  const clearAgentFilter = () => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.delete(AUTONOMY_AGENT_PARAM);
    return next;
  }, { replace: true });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("autonomy.intro", { defaultValue: "La autonomía de cada agente por tipo de acción se gana con el modo sombra y el banco de pruebas. Subir un nivel requiere un banco aprobado; revocar es inmediato." })}
        </p>
        <BackToTeamLink />
      </div>
      {agentFilterId && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm" role="status">
          <span className="text-muted-foreground">
            {filterMissing
              ? t("uxTeam.autonomy.filterMissing", { defaultValue: "Ese agente no tiene autonomía que mostrar. Se muestran todos los agentes." })
              : t("uxTeam.autonomy.filtered", { defaultValue: "Mostrando solo {{name}}.", name: agentName(agentFilterId) })}
          </span>
          <Button size="sm" variant="outline" onClick={clearAgentFilter}>
            {t("uxTeam.autonomy.showAll", { defaultValue: "Ver todos los agentes" })}
          </Button>
        </div>
      )}
      {agents.error && <p role="alert" className="text-sm text-destructive">{errorMessage(agents.error)}</p>}
      {benchMutation.error && <p role="alert" className="text-sm text-destructive">{errorMessage(benchMutation.error)}</p>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th scope="col" className="p-2 font-medium">{t("autonomy.agent", { defaultValue: "Agente" })}</th>
              {EXTERNAL_ACTION_TYPES.map((actionType) => (
                <th scope="col" className="p-2 font-medium" key={actionType}>
                  {t(`autonomy.action.${actionType}`, { defaultValue: ACTION_LABELS[actionType] })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(([agentId, cells]) => (
              <tr className="border-t align-top" key={agentId}>
                <th scope="row" className="p-2 text-left font-medium">{agentName(agentId)}</th>
                {EXTERNAL_ACTION_TYPES.map((actionType) => {
                  const cell = cells.find((item) => item.actionType === actionType);
                  if (!cell) return <td className="p-2" key={actionType} />;
                  return (
                    <td className="p-2" key={actionType}>
                      <CellView
                        cell={cell}
                        onOpen={() => setPanel({ agentId, actionType })}
                        onRaise={() => setRaiseCell(cell)}
                        onRevoke={() => setRevokeCell(cell)}
                        onBench={() => benchMutation.mutate({ agentId, actionType })}
                        benchPending={benchMutation.isPending && benchMutation.variables?.agentId === agentId && benchMutation.variables?.actionType === actionType}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {raiseCell && (
        <RaiseDialog companyId={selectedCompanyId} cell={raiseCell} onClose={() => setRaiseCell(null)} />
      )}
      {revokeCell && (
        <RevokeDialog companyId={selectedCompanyId} cell={revokeCell} onClose={() => setRevokeCell(null)} />
      )}
      <Sheet open={!!panelCell} onOpenChange={(open) => { if (!open) setPanel(null); }}>
        <SheetContent side="right" className="overflow-y-auto">
          {panelCell && (
            <CellPanel
              companyId={selectedCompanyId}
              cell={panelCell}
              agentName={agentName(panelCell.agentId)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CellView({ cell, onOpen, onRaise, onRevoke, onBench, benchPending }: {
  cell: AutonomyMatrixCell;
  onOpen: () => void;
  onRaise: () => void;
  onRevoke: () => void;
  onBench: () => void;
  benchPending: boolean;
}) {
  const { t } = useTranslation();
  const bench = cell.latestBench;
  const levelLabel = t(`autonomy.level.${cell.level}`, { defaultValue: LEVEL_LABELS[cell.level] });
  const { stats } = cell;
  const canRevoke = cell.source === "agent" && cell.policyId !== null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button type="button" className="flex flex-col items-start gap-1 text-left" onClick={onOpen}>
        <Badge variant="secondary">{levelLabel}</Badge>
        <span className="text-xs text-muted-foreground">
          {t("autonomy.stats", { defaultValue: "Borradores {{drafts}} · {{unchanged}} sin cambios · {{edited}} editados · {{rejected}} rechazados", drafts: stats.drafts, unchanged: percent(stats.unchangedRatio), edited: stats.edited, rejected: stats.rejected })}
        </span>
        <span className="text-xs text-muted-foreground">
          {bench
            ? t("autonomy.benchLine", { defaultValue: "Banco: {{score}} · {{status}}", score: bench.score === null ? "—" : percent(bench.score), status: BENCH_STATUS_LABELS[bench.status] ?? bench.status })
            : t("autonomy.noBench", { defaultValue: "Sin banco de pruebas" })}
        </span>
      </button>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onBench} disabled={benchPending}>
          {t("autonomy.runBench", { defaultValue: "Ejecutar banco de pruebas" })}
        </Button>
        <Button size="sm" variant="outline" onClick={onRaise} disabled={!cell.canRaise || !cell.nextLevel}>
          {t("autonomy.raise", { defaultValue: "Subir" })}
        </Button>
        <Button size="sm" variant="ghost" onClick={onRevoke} disabled={!canRevoke}>
          {t("autonomy.revoke", { defaultValue: "Revocar" })}
        </Button>
      </div>
    </div>
  );
}

function RaiseDialog({ companyId, cell, onClose }: { companyId: string; cell: AutonomyMatrixCell; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const nextLevel = cell.nextLevel!;
  const grant = useMutation({
    mutationFn: () => autonomyApi.grant(companyId, {
      agentId: cell.agentId,
      actionType: cell.actionType,
      level: nextLevel,
      reason: reason.trim() || null,
      benchRunId: cell.latestBench?.id ?? null,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["autonomy", companyId] });
      onClose();
    },
  });
  const nextLabel = t(`autonomy.level.${nextLevel}`, { defaultValue: LEVEL_LABELS[nextLevel] });
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("autonomy.raise.title", { defaultValue: "Subir autonomía" })}</DialogTitle>
          <DialogDescription>
            {t("autonomy.raise.description", { defaultValue: "El banco de pruebas aprobado respalda este cambio. Queda registrado en el historial." })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t("autonomy.raise.target", { defaultValue: "Nuevo nivel: {{level}}", level: nextLabel })}</p>
          <Label htmlFor="autonomy-raise-reason">{t("autonomy.reasonOptional", { defaultValue: "Motivo (opcional)" })}</Label>
          <Textarea id="autonomy-raise-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        {grant.error && <p role="alert" className="text-sm text-destructive">{errorMessage(grant.error)}</p>}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={onClose}>{t("common.cancel", { defaultValue: "Cancelar" })}</Button>
          <Button onClick={() => grant.mutate()} disabled={grant.isPending}>
            {t("autonomy.raise.confirm", { defaultValue: "Subir a {{level}}", level: nextLabel })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ companyId, cell, onClose }: { companyId: string; cell: AutonomyMatrixCell; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const revoke = useMutation({
    mutationFn: () => autonomyApi.revoke(companyId, { agentId: cell.agentId, actionType: cell.actionType, reason: reason.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["autonomy", companyId] });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("autonomy.revoke.title", { defaultValue: "Revocar autonomía" })}</DialogTitle>
          <DialogDescription>
            {t("autonomy.revoke.description", { defaultValue: "La revocación es inmediata y cancela el trabajo en cola de este agente para este tipo de acción." })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="autonomy-revoke-reason">{t("autonomy.revoke.reason", { defaultValue: "Motivo (obligatorio)" })}</Label>
          <Textarea id="autonomy-revoke-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        {revoke.error && <p role="alert" className="text-sm text-destructive">{errorMessage(revoke.error)}</p>}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={onClose}>{t("common.cancel", { defaultValue: "Cancelar" })}</Button>
          <Button variant="destructive" onClick={() => revoke.mutate()} disabled={revoke.isPending || reason.trim().length === 0}>
            {t("autonomy.revoke.confirm", { defaultValue: "Revocar" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CellPanel({ companyId, cell, agentName }: { companyId: string; cell: AutonomyMatrixCell; agentName: string }) {
  const { t } = useTranslation();
  const history = useQuery({
    queryKey: ["autonomy-history", companyId, cell.agentId, cell.actionType],
    queryFn: () => autonomyApi.history(companyId, cell.agentId, cell.actionType),
  });
  const failures = cell.latestBench?.failures ?? [];
  const actionLabel = t(`autonomy.action.${cell.actionType}`, { defaultValue: ACTION_LABELS[cell.actionType] });
  return (
    <>
      <SheetHeader>
        <SheetTitle>{agentName} · {actionLabel}</SheetTitle>
        <SheetDescription>
          {t("autonomy.panel.level", { defaultValue: "Nivel vigente: {{level}}", level: t(`autonomy.level.${cell.level}`, { defaultValue: LEVEL_LABELS[cell.level] }) })}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 p-4">
        <Card>
          <CardHeader><CardTitle>{t("autonomy.panel.shadow", { defaultValue: "Modo sombra (14 días)" })}</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p>{t("autonomy.panel.drafts", { defaultValue: "Borradores: {{count}}", count: cell.stats.drafts })}</p>
            <p>{t("autonomy.panel.unchanged", { defaultValue: "Enviados sin cambios: {{value}}", value: percent(cell.stats.unchangedRatio) })}</p>
            <p>{t("autonomy.panel.edited", { defaultValue: "Editados: {{count}}", count: cell.stats.edited })}</p>
            <p>{t("autonomy.panel.rejected", { defaultValue: "Rechazados: {{count}}", count: cell.stats.rejected })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("autonomy.panel.bench", { defaultValue: "Último banco de pruebas" })}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {cell.latestBench ? (
              <>
                <p>
                  {t("autonomy.panel.benchScore", { defaultValue: "Puntuación {{score}} (umbral {{threshold}}) · {{status}}", score: percent(cell.latestBench.score), threshold: percent(cell.latestBench.threshold), status: BENCH_STATUS_LABELS[cell.latestBench.status] ?? cell.latestBench.status })}
                </p>
                {failures.length === 0 ? (
                  <p className="text-muted-foreground">{t("autonomy.panel.noFailures", { defaultValue: "Sin fallos registrados." })}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {failures.map((failure) => (
                      <li className="flex flex-col gap-1" key={`${failure.caseId}-${failure.dimension}`}>
                        <span className="font-medium">
                          {failure.caseId} · {t(`autonomy.dimension.${failure.dimension}`, { defaultValue: DIMENSION_LABELS[failure.dimension] ?? failure.dimension })} · {percent(failure.score)}
                        </span>
                        <span className="text-muted-foreground">{t("autonomy.panel.expected", { defaultValue: "Esperado" })}: {failure.expected}</span>
                        <span className="text-muted-foreground">{t("autonomy.panel.actual", { defaultValue: "Obtenido" })}: {failure.actual}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t("autonomy.noBench", { defaultValue: "Sin banco de pruebas" })}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("autonomy.panel.history", { defaultValue: "Historial" })}</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {history.isLoading ? (
              <p className="text-muted-foreground">{t("common.loading", { defaultValue: "Cargando…" })}</p>
            ) : history.error ? (
              <p role="alert" className="text-destructive">{errorMessage(history.error)}</p>
            ) : !history.data?.length ? (
              <p className="text-muted-foreground">{t("autonomy.panel.noHistory", { defaultValue: "Sin cambios registrados." })}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.data.map((policy) => (
                  <li className="flex flex-col gap-1" key={policy.id}>
                    <span className="font-medium">
                      {t(`autonomy.level.${policy.level}`, { defaultValue: LEVEL_LABELS[policy.level] ?? policy.level })}
                      {" · "}
                      {new Date(policy.grantedAt).toLocaleString()}
                    </span>
                    {policy.reason && <span className="text-muted-foreground">{policy.reason}</span>}
                    <span className="text-muted-foreground">
                      {policy.revokedAt
                        ? t("autonomy.panel.ended", { defaultValue: "Terminado el {{date}}: {{reason}}", date: new Date(policy.revokedAt).toLocaleString(), reason: policy.revokedReason ?? "—" })
                        : t("autonomy.panel.active", { defaultValue: "Vigente" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
