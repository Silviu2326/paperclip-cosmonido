import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SALES_STAGE_KEYS, type Opportunity, type SalesStageKey } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { crmApi } from "../../api/crm";
import { queryKeys } from "../../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Invalidation prefix for per-customer opportunity lists (see CustomerOpportunitiesTab). */
export const CUSTOMER_OPPORTUNITIES_KEY = "crm-customer-opportunities";

/**
 * Creates an opportunity. The idempotency key is generated when the form opens and kept
 * across retries of the same submit, so a double click or a retry after a network error
 * cannot create two rows. Closing the dialog starts a new form with a new key.
 */
export function OpportunityCreateDialog({
  open,
  onOpenChange,
  companyId,
  customerId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** When set, the customer is preselected and the customer picker is hidden. */
  customerId?: string;
  onCreated?: (opportunity: Opportunity) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pickedCustomerId, setPickedCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [stageKey, setStageKey] = useState<SalesStageKey>("new");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [nextAction, setNextAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const effectiveCustomerId = customerId ?? pickedCustomerId;

  const customersQuery = useQuery({
    queryKey: ["crm-opportunity-customer-options", companyId],
    queryFn: () => crmApi.customers.list(companyId, { status: "active", limit: 100 }),
    enabled: open && !customerId && Boolean(companyId),
  });
  const customerOptions = customersQuery.data?.items ?? [];

  function reset() {
    setPickedCustomerId("");
    setTitle("");
    setStageKey("new");
    setAmount("");
    setCurrency("EUR");
    setNextAction("");
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  const amountText = amount.trim();
  const amountValue = amountText === "" ? null : Number(amountText.replace(",", "."));
  const amountValid = amountValue === null || (Number.isFinite(amountValue) && amountValue >= 0);

  const create = useMutation({
    mutationFn: () =>
      crmApi.opportunities.create(companyId, {
        customerId: effectiveCustomerId,
        title: title.trim(),
        stageKey,
        amountCents: amountValue === null ? null : Math.round(amountValue * 100),
        currency: amountValue === null ? null : currency.trim().toUpperCase() || "EUR",
        nextAction: nextAction.trim() || null,
        idempotencyKey,
      }),
    onSuccess: (opportunity) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.list(companyId) });
      void queryClient.invalidateQueries({ queryKey: [CUSTOMER_OPPORTUNITIES_KEY] });
      close();
      onCreated?.(opportunity);
    },
    onError: () => setError(t("crm.opportunities.create.error")),
  });

  const canSubmit = Boolean(effectiveCustomerId) && title.trim().length > 0 && amountValid && !create.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    create.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-medium">{t("crm.opportunities.create.title")}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4 px-4 py-4" onSubmit={submit}>
          {!customerId && (
            <div className="space-y-1.5">
              <Label htmlFor="opportunity-create-customer">{t("crm.opportunities.create.customer")}</Label>
              <NativeSelect
                id="opportunity-create-customer"
                value={pickedCustomerId}
                onChange={(event) => setPickedCustomerId(event.target.value)}
                disabled={customerOptions.length === 0}
              >
                <option value="">{t("crm.opportunities.create.chooseCustomer")}</option>
                {customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </NativeSelect>
              {!customersQuery.isLoading && customerOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("crm.opportunities.create.noCustomers")}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="opportunity-create-title">{t("crm.opportunities.create.fieldTitle")}</Label>
            <Input
              id="opportunity-create-title"
              value={title}
              autoFocus
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="opportunity-create-stage">{t("crm.opportunities.create.fieldStage")}</Label>
              <NativeSelect
                id="opportunity-create-stage"
                value={stageKey}
                onChange={(event) => setStageKey(event.target.value as SalesStageKey)}
              >
                {SALES_STAGE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(`crm.opportunities.stages.${key}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opportunity-create-amount">{t("crm.opportunities.create.fieldAmount")}</Label>
              <div className="flex gap-2">
                <Input
                  id="opportunity-create-amount"
                  inputMode="decimal"
                  value={amount}
                  maxLength={20}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={!amountValid}
                />
                <Input
                  className="w-20"
                  aria-label={t("crm.opportunities.create.fieldCurrency")}
                  value={currency}
                  maxLength={3}
                  onChange={(event) => setCurrency(event.target.value)}
                />
              </div>
              {!amountValid && <p className="text-xs text-destructive">{t("crm.opportunities.create.amountInvalid")}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opportunity-create-next-action">{t("crm.opportunities.create.fieldNextAction")}</Label>
            <Input
              id="opportunity-create-next-action"
              value={nextAction}
              maxLength={500}
              onChange={(event) => setNextAction(event.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" size="sm" onClick={close}>
              {t("crm.opportunities.create.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {create.isPending ? t("crm.opportunities.create.submitting") : t("crm.opportunities.create.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
