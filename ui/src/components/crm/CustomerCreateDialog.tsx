import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Customer, CustomerKind } from "@paperclipai/shared";
import { crmApi } from "../../api/crm";
import { queryKeys } from "../../lib/queryKeys";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerDuplicateNotice, duplicateCandidatesFromError } from "./CustomerDuplicateNotice";

interface CustomerCandidate {
  record: Customer;
  reasons: string[];
}

export function CustomerCreateDialog({
  open,
  onOpenChange,
  companyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onCreated?: (customer: Customer) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CustomerKind>("organization");
  const [domain, setDomain] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [candidates, setCandidates] = useState<CustomerCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setKind("organization");
    setDomain("");
    setContactEmail("");
    setCandidates([]);
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  const create = useMutation({
    mutationFn: (force: boolean) =>
      crmApi.customers.create(companyId, {
        name: name.trim(),
        kind,
        tags: [],
        domain: domain.trim() || null,
        contactEmail: contactEmail.trim() || null,
        force,
      }),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.list(companyId) });
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
      setError(t("crm.customers.createError"));
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
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-medium">{t("crm.customers.createTitle")}</DialogTitle>
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

          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <Label htmlFor="customer-create-domain">{t("crm.customers.fieldDomain")}</Label>
              <Input
                id="customer-create-domain"
                value={domain}
                maxLength={253}
                onChange={(event) => {
                  setDomain(event.target.value);
                  setCandidates([]);
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-create-contact-email">{t("crm.customers.fieldContactEmail")}</Label>
            <Input
              id="customer-create-contact-email"
              type="email"
              value={contactEmail}
              maxLength={320}
              onChange={(event) => {
                setContactEmail(event.target.value);
                setCandidates([]);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("crm.customers.fieldContactEmailHint")}</p>
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
                ? t("crm.customers.creating")
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
