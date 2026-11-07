import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productizationSecurityApi } from "@/api/productization-security";
import { useTranslation } from "@/i18n";

const CONFIRMATION_PHRASE = "DELETE COMMERCIAL ACCOUNT";

/**
 * Danger zone of one commercial account the user owns. The account is the one
 * whose card hosts this component, so the target of the destructive action is
 * always visible next to it. Nothing is fetched until the section is opened.
 */
export function AccountDeletionZone({ userId, accountId, accountName }: { userId: string; accountId: string; accountName: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const statusKey = ["productization", "account-deletion", userId, accountId] as const;
  const statusQuery = useQuery({
    queryKey: statusKey,
    queryFn: () => productizationSecurityApi.accountDeletion(accountId),
    enabled: open,
  });
  useEffect(() => () => {
    queryClient.removeQueries({ queryKey: ["productization", "account-deletion", userId, accountId] });
  }, [queryClient, userId, accountId]);

  const requestMutation = useMutation({
    mutationFn: () => productizationSecurityApi.requestAccountDeletion(accountId, confirmation),
    onSuccess: async () => {
      setConfirmation("");
      setNotice(t("securitySettings.deletionRequested"));
      await queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: () => productizationSecurityApi.cancelAccountDeletion(statusQuery.data!.id),
    onSuccess: async () => {
      setNotice(t("securitySettings.deletionCancelled"));
      await queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });
  const stateLabels = {
    cooling: t("securitySettings.deletionStates.cooling"),
    running: t("securitySettings.deletionStates.running"),
    blocked: t("securitySettings.deletionStates.blocked"),
    completed: t("securitySettings.deletionStates.completed"),
    cancelled: t("securitySettings.deletionStates.cancelled"),
  };
  const error = [requestMutation.error, cancelMutation.error].find(Boolean);
  const status = statusQuery.data;
  const inputId = `deletion-confirmation-${accountId}`;

  return (
    <details className="rounded-md border border-destructive p-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-destructive">
        {t("uxAccounts.dangerZone", { defaultValue: "Eliminar esta cuenta comercial" })}
      </summary>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t("uxAccounts.deleteScope", { defaultValue: "Afecta solo a la cuenta comercial «{{name}}», no a tu usuario ni a una empresa concreta.", name: accountName })}
          </p>
          <p className="text-sm text-muted-foreground">{t("securitySettings.deleteDescription")}</p>
          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
          {error instanceof Error && <p role="alert" className="text-sm text-destructive">{t("securitySettings.actionError")}</p>}
          {statusQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("securitySettings.loadingDeletion")}</p>
          ) : statusQuery.error ? (
            <p role="alert" className="text-sm text-destructive">{t("securitySettings.deletionStatusError")}</p>
          ) : status ? (
            <p className="text-sm">
              {t("securitySettings.status")}: {stateLabels[status.status]}
              {status.blockerCode ? ` · ${t("securitySettings.blocker")}` : ""}
              {status.status === "cooling" ? ` · ${t("securitySettings.cancellableUntil", { date: new Date(status.coolingEndsAt).toLocaleString() })}` : ""}
            </p>
          ) : null}
          {status?.status === "cooling" ? (
            <Button variant="outline" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              {t("securitySettings.cancelDeletion")}
            </Button>
          ) : status?.status !== "completed" && (
            <>
              <label className="flex flex-col gap-2 text-sm" htmlFor={inputId}>
                {t("securitySettings.typeConfirmation")}
                <Input id={inputId} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
              </label>
              <Button
                variant="destructive"
                onClick={() => requestMutation.mutate()}
                disabled={confirmation !== CONFIRMATION_PHRASE || requestMutation.isPending || ["running", "blocked"].includes(status?.status ?? "")}
              >
                {requestMutation.isPending ? t("securitySettings.submitDeletion") : t("securitySettings.requestDeletion")}
              </Button>
            </>
          )}
        </div>
      )}
    </details>
  );
}
