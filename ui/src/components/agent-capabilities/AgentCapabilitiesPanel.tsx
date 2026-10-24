import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AGENT_CAPABILITY_KEYS,
  AGENT_SPECIALTY_PRESETS,
  type AgentCapabilityAutonomyLevel,
  type UpdateAgentCapabilities,
} from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { ApiError } from "@/api/client";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  AgentCapabilitySwitches,
  AgentSpecialtyCards,
  type AgentPurposeValue,
} from "../new-agent/AgentPurposeSection";
import { autonomyHrefForAgent } from "../team-workspace/TeamWorkspaceLinks";

const AUTONOMY_KEYS = ["message", "email", "call"] as const;
type AutonomyKey = (typeof AUTONOMY_KEYS)[number];

/**
 * Editing panel for what an agent is for and may do. Board users edit; anyone else
 * (or a 403 on save) gets the same view read-only. Approval levels are shown but not edited here.
 */
export function AgentCapabilitiesPanel({
  agentId,
  companyId,
  readOnly = false,
}: {
  agentId: string;
  companyId: string;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ["agents", "capabilities", companyId, agentId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => agentsApi.capabilities(agentId, companyId),
    enabled: Boolean(agentId && companyId),
    retry: false,
  });
  const saved = query.data;
  // Local edits; null means "show what the server has".
  const [draft, setDraft] = useState<AgentPurposeValue | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const current: AgentPurposeValue | null =
    draft ?? (saved ? { specialty: saved.profile?.specialty ?? null, capabilities: saved.capabilities } : null);
  const dirty = Boolean(
    saved &&
      current &&
      (current.specialty !== (saved.profile?.specialty ?? null) ||
        AGENT_CAPABILITY_KEYS.some((key) => current.capabilities[key] !== saved.capabilities[key])),
  );

  const save = useMutation({
    mutationFn: (body: UpdateAgentCapabilities) => agentsApi.updateCapabilities(agentId, body, companyId),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response);
      setDraft(null);
      setJustSaved(true);
    },
  });
  const forbidden = save.error instanceof ApiError && save.error.status === 403;
  const canEdit = !readOnly && !forbidden;
  const busy = save.isPending;

  function edit(next: AgentPurposeValue) {
    setDraft(next);
    setJustSaved(false);
    save.reset();
  }

  function submit() {
    if (!current || !saved || !dirty || !canEdit) return;
    const body: UpdateAgentCapabilities = {
      capabilities: current.capabilities,
      ...(current.specialty
        ? { profile: { specialty: current.specialty, sectors: saved.profile?.sectors ?? [] } }
        : {}),
    };
    save.mutate(body);
  }

  function levelLabel(level: AgentCapabilityAutonomyLevel): string {
    if (level === "send_with_approval") return t("agentCaps.levelSendWithApproval", { defaultValue: "Con aprobación" });
    if (level === "send_direct") return t("agentCaps.levelSendDirect", { defaultValue: "Directo" });
    return t("agentCaps.levelDraftOnly", { defaultValue: "Solo borrador" });
  }

  const autonomyRows: Array<{ key: AutonomyKey; label: string }> = [
    { key: "message", label: t("agentCaps.autonomyMessages", { defaultValue: "Mensajes" }) },
    { key: "email", label: t("agentCaps.autonomyEmail", { defaultValue: "Correo" }) },
    { key: "call", label: t("agentCaps.autonomyCalls", { defaultValue: "Llamadas" }) },
  ];

  return (
    <section className="space-y-5" aria-label={t("agentCaps.panelTitle", { defaultValue: "Capacidades" })} aria-busy={busy}>
      <header className="space-y-1">
        <h3 className="text-sm font-semibold">{t("agentCaps.panelTitle", { defaultValue: "Capacidades" })}</h3>
        <p className="text-xs text-muted-foreground">
          {t("agentCaps.panelHint", { defaultValue: "Para qué sirve este agente y qué puede hacer. Los cambios se aplican desde que guardas." })}
        </p>
      </header>

      {query.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("agentCaps.loading", { defaultValue: "Cargando capacidades…" })}
        </p>
      )}

      {query.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <span>{t("agentCaps.loadError", { defaultValue: "No se pudieron cargar las capacidades de este agente." })}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t("agentCaps.retry", { defaultValue: "Reintentar" })}
          </Button>
        </div>
      )}

      {current && saved && (
        <>
          <AgentSpecialtyCards
            value={current.specialty}
            disabled={!canEdit || busy}
            onSelect={(specialty) =>
              edit({ specialty, capabilities: { ...AGENT_SPECIALTY_PRESETS[specialty].capabilities } })
            }
          />
          <AgentCapabilitySwitches
            value={current.capabilities}
            disabled={!canEdit || busy}
            autonomyNote={false}
            onChange={(capabilities) => edit({ ...current, capabilities })}
          />

          <div className="space-y-2 rounded-xl border border-border p-4" aria-label={t("agentCaps.autonomyTitle", { defaultValue: "Autonomía efectiva" })}>
            <p className="text-sm font-medium">{t("agentCaps.autonomyTitle", { defaultValue: "Autonomía efectiva" })}</p>
            <ul className="space-y-1.5">
              {autonomyRows.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
                  <span>{row.label}</span>
                  <span
                    data-testid={`agent-autonomy-${row.key}`}
                    data-level={saved.autonomy[row.key]}
                    className={cn(
                      "inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium",
                      saved.autonomy[row.key] === "send_direct" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                    )}
                  >
                    {levelLabel(saved.autonomy[row.key])}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("agentCaps.autonomyHint", { defaultValue: "El nivel de aprobación se gana con pruebas y se cambia en Autonomía." })}
            </p>
            <Link
              to={autonomyHrefForAgent(agentId)}
              className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("agentCaps.openAutonomy", { defaultValue: "Abrir Autonomía" })}
            </Link>
          </div>

          {readOnly && (
            <p role="status" className="text-xs text-muted-foreground">
              {t("agentCaps.readOnly", { defaultValue: "Solo lectura: necesitas acceso de tablero para cambiar las capacidades." })}
            </p>
          )}

          {canEdit && (
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="min-w-0 text-sm">
                {save.error && !forbidden && (
                  <p role="alert" className="text-destructive">
                    {save.error instanceof Error
                      ? save.error.message
                      : t("agentCaps.saveError", { defaultValue: "No se pudieron guardar las capacidades." })}
                  </p>
                )}
                {justSaved && !save.error && (
                  <p role="status" className="text-muted-foreground">
                    {t("agentCaps.saved", { defaultValue: "Capacidades guardadas." })}
                  </p>
                )}
              </div>
              <Button type="button" disabled={!dirty || busy} onClick={submit}>
                {busy
                  ? t("agentCaps.saving", { defaultValue: "Guardando…" })
                  : t("agentCaps.save", { defaultValue: "Guardar capacidades" })}
              </Button>
            </footer>
          )}
          {forbidden && (
            <p role="alert" className="text-sm text-destructive">
              {t("agentCaps.forbidden", { defaultValue: "No tienes permiso para cambiar las capacidades de este agente." })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
