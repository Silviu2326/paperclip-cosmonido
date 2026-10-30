import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Customer, CustomerKind } from "@paperclipai/shared";
import { crmApi } from "../../api/crm";
import { queryKeys } from "../../lib/queryKeys";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerDuplicateNotice, duplicateCandidatesFromError } from "./CustomerDuplicateNotice";
import { CustomerDetailsFields, customerDetailValues } from "./CustomerDetailsFields";

interface CustomerCandidate {
  record: Customer;
  reasons: string[];
}

export function CustomerCreateDialog({
  open,
  onOpenChange,
  companyId,
  onCreated,
  initialName,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onCreated?: (customer: Customer) => void;
  /** Name to start with, e.g. the text that found no match in the list. */
  initialName?: string;
  customer?: Customer;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CustomerKind>("organization");
  const [notes, setNotes] = useState("");
  const [details, setDetails] = useState(() => customerDetailValues());
  const [candidates, setCandidates] = useState<CustomerCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? initialName ?? "");
    setKind(customer?.kind ?? "organization");
    setNotes(customer?.notes ?? "");
    setDetails(customerDetailValues(customer));
    setError(null);
    setCandidates([]);
  }, [open, initialName, customer]);

  function reset() {
    setName("");
    setKind("organization");
    setNotes("");
    setDetails(customerDetailValues());
    setCandidates([]);
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  const create = useMutation({
    mutationFn: (force: boolean) => {
      const data = {
        name: name.trim(),
        kind,
        tags: customer?.tags ?? [],
        notes: notes.trim() || null,
        ...Object.fromEntries(Object.entries(details).map(([key, value]) => [key, value.trim() || null])),
      };
      return customer
        ? crmApi.customers.update(customer.id, data)
        : crmApi.customers.create(companyId, { ...data, force });
    },
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.list(companyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customer.id) });
      close();
      onCreated?.(customer);
    },
    onError: (err) => {
      const found = duplicateCandidatesFromError(err);
      if (found.length > 0) {
        setCandidates(found as CustomerCandidate[]);
        setError(null);
        return;
      }
      setError(t(customer ? "crm.customers.updateError" : "crm.customers.createError"));
    },
  });

  const forceCreate = candidates.length > 0;
  const canSubmit = name.trim().length > 0 && !create.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-dvh overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-medium">{t(customer ? "crm.customers.editTitle" : "crm.customers.createTitle")}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) create.mutate(forceCreate);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="customer-create-name">{t("crm.customers.fieldName")}</Label>
            <Input
              id="customer-create-name"
              value={name}
              autoFocus
              maxLength={200}
              onChange={(event) => {
                setName(event.target.value);
                setCandidates([]);
              }}
            />
          </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer-create-kind">{t("crm.customers.fieldKind")}</Label>
              <NativeSelect
                id="customer-create-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as CustomerKind)}
              >
                <option value="organization">{t("crm.customers.kindOrganization")}</option>
                <option value="person">{t("crm.customers.kindPerson")}</option>
              </NativeSelect>
            </div>

          <p className="text-xs text-muted-foreground">{t("crm.customers.optionalDetailsHint")}</p>
          <CustomerDetailsFields values={details} onChange={(key, value) => {
            setDetails((current) => ({ ...current, [key]: value }));
            setCandidates([]);
            setError(null);
          }} />

          <div className="space-y-1.5">
            <Label htmlFor="customer-create-notes">{t("crm.customers.fieldNotes")}</Label>
            <Textarea
              id="customer-create-notes"
              value={notes}
              maxLength={20000}
              placeholder={t("crm.customers.fieldNotesPlaceholder")}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <CustomerDuplicateNotice
            title={t("crm.customers.duplicatesTitle")}
            hint={t("crm.customers.duplicatesHint")}
            items={candidates.map((candidate) => ({
              id: candidate.record.id,
              label: candidate.record.name,
              reasons: candidate.reasons,
            }))}
            reasonLabel={(reason) =>
              reason === "domain"
                ? t("crm.customers.reasonDomain")
                : reason === "name"
                  ? t("crm.customers.reasonName")
                  : t("crm.customers.reasonContactEmail")
            }
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" size="sm" onClick={close}>
              {t("crm.customers.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {create.isPending
                ? t(customer ? "crm.customers.saving" : "crm.customers.creating")
                : customer
                  ? t("crm.customers.save")
                : forceCreate
                  ? t("crm.customers.createAnyway")
                  : t("crm.customers.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
