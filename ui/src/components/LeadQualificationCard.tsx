import { useQuery } from "@tanstack/react-query";
import type { LeadQualification } from "@paperclipai/shared";
import { leadQualificationApi } from "../api/lead-qualification";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const REQUALIFY_DISABLED_REASON = "Disponible cuando la ficha del lead esté conectada (Sprint 2)";

export interface LeadQualificationCardProps {
  companyId: string;
  leadId: string;
  /** Threshold from the criteria document, when the caller already loaded it. */
  threshold?: number | null;
  /** Lets the lead page enable "Recualificar" once it can trigger a qualification. */
  canRequalify?: boolean;
  onRequalify?: () => void;
  className?: string;
}

function latestQualification(rows: LeadQualification[] | undefined): LeadQualification | null {
  return rows && rows.length > 0 ? rows[0]! : null;
}

export function LeadQualificationCard({ companyId, leadId, threshold, canRequalify = false, onRequalify, className }: LeadQualificationCardProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["leads", companyId, leadId, "qualifications"] as const,
    queryFn: () => leadQualificationApi.qualifications(companyId, leadId),
    enabled: Boolean(companyId && leadId),
  });
  const latest = latestQualification(data);

  const requalifyButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!canRequalify || !onRequalify}
      onClick={onRequalify}
    >
      Recualificar
    </Button>
  );

  return (
    <section className={cn("space-y-3 rounded-md border p-4", className)} aria-labelledby={`lead-qualification-${leadId}`}>
      <header className="flex items-center justify-between gap-2">
        <h3 id={`lead-qualification-${leadId}`} className="text-sm font-semibold">Cualificación</h3>
        {canRequalify && onRequalify ? requalifyButton : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{requalifyButton}</span>
            </TooltipTrigger>
            <TooltipContent>{REQUALIFY_DISABLED_REASON}</TooltipContent>
          </Tooltip>
        )}
      </header>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando cualificación…</p> : null}
      {error ? <p className="text-sm text-destructive">No se pudo cargar la cualificación: {error instanceof Error ? error.message : "error desconocido"}</p> : null}

      {!isLoading && !error && !latest ? (
        <p className="text-sm text-muted-foreground">Este lead aún no está cualificado.</p>
      ) : null}

      {latest ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold">{latest.score}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            {threshold != null ? (
              <span className="text-sm text-muted-foreground">umbral {threshold}</span>
            ) : null}
            <span className={cn("text-sm font-medium", latest.score >= (threshold ?? 0) ? "text-foreground" : "text-muted-foreground")}>
              {threshold == null ? null : latest.score >= threshold ? "Cualificado" : "No cualificado"}
            </span>
            <span className="text-xs text-muted-foreground">criterios {latest.criteriaVersion}</span>
          </div>

          <ul className="space-y-1 text-sm">
            {latest.reasons.map((reason) => (
              <li key={reason.criterion} className="flex items-start gap-2">
                <span className={cn("shrink-0 font-medium", reason.met === true ? "text-foreground" : "text-muted-foreground")}>
                  {reason.met === true ? "Cumple" : reason.met === false ? "No cumple" : "Sin evaluar"}
                </span>
                <span>
                  <span className="font-medium">{reason.criterion}</span>
                  <span className="text-muted-foreground"> · peso {reason.weight}</span>
                  {reason.note ? <span className="block text-muted-foreground">{reason.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>

          {latest.sources.length > 0 ? (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fuentes</h4>
              <ul className="space-y-1 text-sm">
                {latest.sources.map((source, index) => (
                  <li key={`${source.kind}-${source.ref}-${index}`}>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        {source.label ?? source.url}
                      </a>
                    ) : (
                      <span>{source.label ?? source.ref}</span>
                    )}
                    <span className="text-xs text-muted-foreground"> ({source.kind})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
