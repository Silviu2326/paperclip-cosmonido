import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CommercialDecisionEffect } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { commercialDecisionsApi, type CommercialDecisionView } from "@/api/commercial-decisions";
import { ApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

const typeLabels: Record<string, string> = {
  approve_send: "Aprobar envío",
  approve_proposal: "Aprobar propuesta",
  price_exception: "Excepción de precio",
  discard_lead: "Descartar lead",
  escalate_customer: "Escalar cliente",
  raise_autonomy: "Subir autonomía",
};

/** Plain-language summary of the effect an option applies when chosen. */
export function commercialEffectSummary(effect: CommercialDecisionEffect | undefined): string {
  if (!effect || effect.kind === "none") return "Solo registra la respuesta; no cambia nada fuera de la decisión.";
  switch (effect.kind) {
    case "send_message":
      return "Enviará el mensaje aprobado.";
    case "send_proposal":
      return "Enviará la propuesta al cliente.";
    case "apply_price_exception":
      return `Aplicará un precio de ${formatCents(effect.priceCents)} a la propuesta.`;
    case "discard_lead":
      return "Descartará el lead.";
    case "escalate_customer":
      return "Escalará el cliente para seguimiento humano.";
    case "raise_autonomy":
      return `Subirá la autonomía de ${effect.actionType} a ${effect.level}.`;
    case "advance_playbook":
      return "Avanzará el playbook en curso.";
    default:
      return "Efecto declarado por el agente.";
  }
}

export function CommercialDecisionCard({ decision }: { decision: CommercialDecisionView }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<{ kind: "subject_changed" | "other"; message: string } | null>(null);
  const commercial = decision.commercial;
  const effects = commercial?.effects ?? {};

  const resolve = useMutation({
    mutationFn: (optionId: string) =>
      commercialDecisionsApi.resolve(decision.id, { optionId, subjectVersion: commercial?.subjectVersion }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["commercial-decisions", decision.companyId] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const code = (err.body as { code?: unknown } | null)?.code;
        if (code === "subject_changed") {
          setError({
            kind: "subject_changed",
            message: t("commercialDecisions.subjectChanged", { defaultValue: "El elemento cambió desde que se creó la decisión" }),
          });
          return;
        }
      }
      setError({ kind: "other", message: err instanceof Error ? err.message : String(err) });
    },
  });

  const reload = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["commercial-decisions", decision.companyId] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>{decision.title}</span>
          {commercial && (
            <Badge variant="secondary">
              {t(`commercialDecisions.type.${commercial.type}`, { defaultValue: typeLabels[commercial.type] ?? commercial.type })}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap text-sm">{decision.body}</p>
        {commercial && (
          <p className="text-xs text-muted-foreground">
            {t("commercialDecisions.subject", { defaultValue: "Sujeto" })}: {commercial.subject.kind} · {commercial.subject.id.slice(0, 8)}
            {" · "}
            {t("commercialDecisions.version", { defaultValue: "Versión" })}: {commercial.subjectVersion}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {decision.options.map((option) => {
            const variant = option.style === "primary" ? "default" : option.style === "destructive" ? "destructive" : "outline";
            return (
              <div key={option.id} className="flex flex-col gap-1">
                <div>
                  <Button
                    type="button"
                    variant={variant}
                    size="sm"
                    disabled={resolve.isPending || decision.status !== "open"}
                    onClick={() => resolve.mutate(option.id)}
                  >
                    {option.label}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{commercialEffectSummary(effects[option.id])}</p>
              </div>
            );
          })}
        </div>
        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>{error.message}</span>
            {error.kind === "subject_changed" && (
              <Button type="button" variant="outline" size="sm" onClick={reload}>
                {t("commercialDecisions.reload", { defaultValue: "Recargar" })}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
