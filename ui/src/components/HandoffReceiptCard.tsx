import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HANDOFF_STEPS, type HandoffReceipt } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { handoffApi } from "@/api/handoff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stepLabels: Record<string, string> = {
  project: "Proyecto",
  assignment: "Encargo",
  team: "Equipo",
  brief: "Brief",
  summary: "Paquete de traspaso",
};

/** Shows the state of a sale → delivery handoff. A partial receipt can be resumed with "Reintentar". */
export function HandoffReceiptCard({ receipt, canRetry = true }: { receipt: HandoffReceipt; canRetry?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => handoffApi.retry(receipt.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["handoffs"] }),
  });
  const done = new Set(receipt.stepsDone);
  const isDone = (step: string) => done.has(step) || done.has(`${step}:skipped`);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-4">
          {t("handoff.title", { defaultValue: "Traspaso a entrega" })}
          <Badge variant={receipt.status === "complete" ? "secondary" : "outline"}>
            {receipt.status === "complete"
              ? t("handoff.complete", { defaultValue: "Completado" })
              : t("handoff.partial", { defaultValue: "Parcial" })}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {HANDOFF_STEPS.map((step) => (
            <li key={step} className="flex items-center justify-between gap-3 text-sm">
              <span>{t(`handoff.step.${step}`, { defaultValue: stepLabels[step] ?? step })}</span>
              <span className="text-muted-foreground">
                {isDone(step)
                  ? done.has(`${step}:skipped`)
                    ? t("handoff.skipped", { defaultValue: "Omitido" })
                    : t("handoff.done", { defaultValue: "Hecho" })
                  : t("handoff.pending", { defaultValue: "Pendiente" })}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {receipt.projectId && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${receipt.projectId}`}>{t("handoff.openProject", { defaultValue: "Abrir proyecto" })}</Link>
            </Button>
          )}
          {receipt.assignmentGoalId && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/assignments/${receipt.assignmentGoalId}`}>{t("handoff.openAssignment", { defaultValue: "Abrir encargo" })}</Link>
            </Button>
          )}
          {receipt.status === "partial" && canRetry && (
            <Button size="sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
              {t("handoff.retry", { defaultValue: "Reintentar" })}
            </Button>
          )}
        </div>
        {receipt.error && <p className="text-sm text-destructive">{receipt.error}</p>}
        {retry.error && <p role="alert" className="text-sm text-destructive">{retry.error.message}</p>}
      </CardContent>
    </Card>
  );
}
