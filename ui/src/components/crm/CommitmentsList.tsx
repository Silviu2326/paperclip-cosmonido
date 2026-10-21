import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Commitment } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { crmApi } from "../../api/crm";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "../PageSkeleton";

const RESOLUTIONS = ["kept", "missed", "cancelled"] as const;

/** Commitments of an opportunity or customer, with resolve actions for the open ones. */
export function CommitmentsList({
  companyId,
  opportunityId,
  customerId,
}: {
  companyId: string;
  opportunityId?: string;
  customerId?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ["crm", "commitments", companyId, opportunityId ?? null, customerId ?? null];
  const query = useQuery({
    queryKey,
    queryFn: () => crmApi.commitments.list(companyId, { opportunityId, customerId, limit: 50 }),
    enabled: Boolean(companyId),
  });
  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: (typeof RESOLUTIONS)[number] }) =>
      crmApi.commitments.resolve(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "commitments"] }),
  });

  if (query.isLoading) return <PageSkeleton variant="list" />;
  if (query.error) return <p className="text-sm text-destructive">{t("crm.commitments.loadError")}</p>;
  const items = query.data?.items ?? [];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("crm.commitments.empty")}</p>;

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item: Commitment) => (
        <li key={item.id} className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">{item.what}</span>
            <span className="text-xs text-muted-foreground">
              {t(`crm.commitments.who.${item.who}`)} · {t(`crm.commitments.status.${item.status}`)}
              {item.dueAt ? ` · ${new Date(item.dueAt).toLocaleDateString()}` : ""}
            </span>
          </div>
          {(item.status === "open" || item.status === "proposed") && (
            <div className="flex flex-wrap gap-2">
              {RESOLUTIONS.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant="outline"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ id: item.id, status })}
                >
                  {t(`crm.commitments.resolve.${status}`)}
                </Button>
              ))}
            </div>
          )}
        </li>
      ))}
      {resolve.error && <p className="text-sm text-destructive">{t("crm.commitments.resolveError")}</p>}
    </ul>
  );
}
