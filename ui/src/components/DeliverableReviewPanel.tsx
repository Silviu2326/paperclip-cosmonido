import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { deliverableReviewsApi } from "@/api/deliverable-reviews";
import { requestResponse } from "@/api/client";
import { readApiJson } from "@/api/response";
import type { DeliverableReview } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function DeliverableReviewPanel({ goalId, issueId, companyId, targetId, reviewId, cacheScope }: { goalId?: string; issueId?: string; companyId?: string; targetId?: string; reviewId?: string; cacheScope?: string }) {
  const { t } = useTranslation(); const queryClient = useQueryClient(); const id = goalId ?? issueId ?? companyId ?? "";
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null); const [reason, setReason] = useState("");
  const scope = goalId ? "goal" : issueId ? "issue" : "company";
  const queryKey = ["deliverable-reviews", scope, id, ...(cacheScope ? ["principal", cacheScope] : [])];
  const query = useQuery({ queryKey, queryFn: async () => {
    if (cacheScope) {
      const path = goalId ? `/goals/${goalId}/deliverable-reviews` : issueId ? `/issues/${issueId}/deliverable-reviews` : `/companies/${companyId}/deliverable-reviews?state=pending`;
      return readApiJson<DeliverableReview[]>(await requestResponse(path, { cache: "no-store" }));
    }
    return goalId ? deliverableReviewsApi.listByGoal(goalId) : issueId ? deliverableReviewsApi.listByIssue(issueId) : deliverableReviewsApi.listPending(companyId!);
  }, enabled: !!id, staleTime: cacheScope ? 0 : undefined, refetchOnMount: cacheScope ? "always" : undefined });
  const resolve = useMutation({ mutationFn: ({ reviewId, state, reason }: { reviewId: string; state: "accepted" | "changes_requested"; reason?: string }) => { const review = query.data?.find(item => item.id === reviewId); if (!review) throw new Error("Reload the review before resolving it"); return deliverableReviewsApi.resolve(reviewId, { state, reason, expectedRevision: new Date(review.updatedAt).toISOString() }); }, onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey }), queryClient.invalidateQueries({ queryKey: ["assignments"] }), queryClient.invalidateQueries({ queryKey: ["assignment"] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] }), queryClient.invalidateQueries({ queryKey: ["issues", "work-products"] }), queryClient.invalidateQueries({ queryKey: ["assignment-costs-by-goal"] })]); setSelectedReviewId(null); setReason(""); }, onError: async () => { await queryClient.invalidateQueries({ queryKey }); } });
  const reviews = query.data?.filter((review) => (!targetId || review.targetId === targetId) && (!reviewId || review.id === reviewId)) ?? [];
  const selectedReview = reviews.find((review) => review.id === selectedReviewId);
  if (query.isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Cargando…" })}</p>;
  if (query.error) return <p className="text-sm text-destructive">{query.error.message}</p>;
  return <><div className="flex flex-col gap-3">{!reviews.length ? <p className="text-sm text-muted-foreground">{t("deliverables.none", { defaultValue: "No hay entregables para revisar." })}</p> : reviews.map((review) => <div key={review.id} className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{t('deliverables.target.' + review.targetKind, { defaultValue: review.targetKind === 'work_product' ? 'Entregable' : review.targetKind === 'document_revision' ? 'Documento' : 'Archivo' })} · {review.targetVersion}</p>{review.issueId && <Button size="sm" variant="link" asChild><Link to={`/issues/${review.issueId}`}>{t("deliverables.openTask", { defaultValue: "Abrir tarea relacionada" })}</Link></Button>}<p className="text-sm text-muted-foreground">{review.reason ?? (review.evidence?.summary as string | undefined)}</p></div><div className="flex items-center gap-2"><Badge variant="secondary">{t(`deliverables.status.${review.state}`, { defaultValue: review.state === "pending" ? "Pendiente" : review.state === "accepted" ? "Aceptado" : "Cambios solicitados" })}</Badge>{review.state === "pending" && <><Button size="sm" onClick={() => resolve.mutate({ reviewId: review.id, state: "accepted" })} disabled={resolve.isPending}>{t("deliverables.accept", { defaultValue: "Aceptar" })}</Button><Button size="sm" variant="outline" onClick={() => { setSelectedReviewId(review.id); setReason(""); }} disabled={resolve.isPending}>{t("deliverables.requestChanges", { defaultValue: "Pedir cambios" })}</Button></>}</div></div>)}</div>{resolve.error && <p role="alert" className="text-sm text-destructive">{resolve.error.message} {t("deliverables.refreshNotice", { defaultValue: "El estado se ha actualizado. Revisa el resultado antes de volver a intentar." })}</p>}<Dialog open={!!selectedReviewId} onOpenChange={(open) => { if (!open) { setSelectedReviewId(null); setReason(""); } }}><DialogContent><DialogHeader><DialogTitle>{t("deliverables.requestChanges", { defaultValue: "Pedir cambios" })}</DialogTitle><DialogDescription>{t("deliverables.reasonPrompt", { defaultValue: "Indica qué cambios hacen falta." })}</DialogDescription></DialogHeader><div className="flex flex-col gap-2"><Label htmlFor="deliverable-review-reason">{t("deliverables.reason", { defaultValue: "Motivo" })}</Label><Textarea id="deliverable-review-reason" value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={!reason.trim()} /></div><DialogFooter className="flex-row justify-between sm:justify-between"><Button type="button" variant="outline" onClick={() => setSelectedReviewId(null)}>{t("common.cancel", { defaultValue: "Cancelar" })}</Button><Button onClick={() => selectedReview && resolve.mutate({ reviewId: selectedReview.id, state: "changes_requested", reason: reason.trim() })} disabled={!reason.trim() || resolve.isPending}>{t("deliverables.requestChanges", { defaultValue: "Pedir cambios" })}</Button></DialogFooter></DialogContent></Dialog></>;
}
