import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { assignmentsApi } from "@/api/assignments";
import { useTranslation } from "@/i18n";
import { useLocation } from "@/lib/router";
import { DeliverableReviewPanel } from "@/components/DeliverableReviewPanel";
import { formatCents } from "@/lib/utils";

function useAssignmentForIssue(issueId: string) {
  return useQuery({
    queryKey: ["assignment", "issue", issueId],
    queryFn: () => assignmentsApi.getForIssue(issueId),
    enabled: !!issueId,
  });
}

/** Compact, common detail disclosure for tasks that have a reviewable result. */
export function TaskOutcomePanel({ issueId }: { issueId: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [outcomeOpen, setOutcomeOpen] = useState(location.hash === "#outcome");
  const [contextOpen, setContextOpen] = useState(false);
  const panelRef = useRef<HTMLDetailsElement>(null);
  const assignment = useAssignmentForIssue(issueId);
  const context = useQuery({
    queryKey: ["assignment-context-usage", assignment.data?.id],
    queryFn: () => assignmentsApi.contextUsage(assignment.data!.id),
    enabled: contextOpen && !!assignment.data?.id,
  });

  useEffect(() => {
    setOutcomeOpen(location.hash === "#outcome" && assignment.data?.rootIssueId === issueId);
  }, [assignment.data?.rootIssueId, issueId, location.hash]);

  useEffect(() => {
    if (outcomeOpen && location.hash === "#outcome" && assignment.data?.rootIssueId === issueId) {
      panelRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [assignment.data?.rootIssueId, issueId, outcomeOpen, location.hash]);

  if (assignment.error) return <p role="alert" className="text-sm text-destructive">{assignment.error.message}</p>;
  if (assignment.isLoading || !assignment.data || assignment.data.rootIssueId !== issueId) return null;

  const outcome = assignment.data;
  return (
    <details
      ref={panelRef}
      id="outcome"
      open={outcomeOpen}
      onToggle={(event) => setOutcomeOpen(event.currentTarget.open)}
      className="rounded-md border border-border/70 px-3 py-2"
      data-testid="task-outcome-review"
    >
      <summary className="cursor-pointer text-sm font-medium">
        {t("uxWork.outcomeReview", { defaultValue: "Resultado y revisión" })}
      </summary>
      <div className="mt-3 flex flex-col gap-3 pb-1">
        <section>
          <h3 className="text-sm font-medium">{t("uxWork.acceptanceCriteria", { defaultValue: "Criterios de aceptación" })}</h3>
          <p className="text-sm text-muted-foreground">{outcome.acceptanceCriteria}</p>
        </section>
        {outcome.expectedDeliverable ? <section>
          <h3 className="text-sm font-medium">{t("uxWork.expectedResult", { defaultValue: "Resultado esperado" })}</h3>
          <p className="text-sm text-muted-foreground">{outcome.expectedDeliverable}</p>
        </section> : null}
        <p className="text-xs text-muted-foreground">
          {t("uxWork.budget", { defaultValue: "Presupuesto" })}: {formatCents(outcome.budgetCents ?? 0)}
          {" · "}{t("uxWork.reviewStatus", { defaultValue: "Revisión" })}: {t(`uxWork.status.${outcome.assignmentStatus}`, { defaultValue: outcome.assignmentStatus })}
        </p>
        <details onToggle={(event) => setContextOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer text-sm">{t("uxWork.contextUsed", { defaultValue: "Contexto utilizado" })}</summary>
          {context.isLoading ? <p className="mt-2 text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Cargando…" })}</p>
            : context.error ? <p role="alert" className="mt-2 text-sm text-destructive">{context.error.message}</p>
              : !context.data?.length ? <p className="mt-2 text-sm text-muted-foreground">{t("uxWork.noContext", { defaultValue: "Aún no se ha registrado contexto." })}</p>
                : <ul className="mt-2 flex flex-col gap-1 text-sm">{context.data.map((file) => <li key={file.fileId}>{file.name} <span className="text-muted-foreground">· {file.contextRole ?? t("uxWork.otherContext", { defaultValue: "otro" })}</span></li>)}</ul>}
        </details>
        {outcomeOpen ? <DeliverableReviewPanel goalId={outcome.id} issueId={issueId} /> : null}
      </div>
    </details>
  );
}

/** Keep legacy activity reviews for ordinary tasks, but suppress them for an assignment root. */
export function TaskStandaloneReviewPanel({ issueId }: { issueId: string }) {
  const assignment = useAssignmentForIssue(issueId);
  if (assignment.isLoading) return null;
  if (assignment.data?.rootIssueId === issueId) return null;
  return <DeliverableReviewPanel issueId={issueId} />;
}
