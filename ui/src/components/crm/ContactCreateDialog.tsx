import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Contact } from "@paperclipai/shared";
import { crmApi } from "../../api/crm";
import { queryKeys } from "../../lib/queryKeys";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerDuplicateNotice, duplicateCandidatesFromError } from "./CustomerDuplicateNotice";
import { SalesCustomerPicker } from "./SalesCustomerPicker";

interface ContactCandidate {
  record: Contact;
  reasons: string[];
}

export function ContactCreateDialog({
  open,
  onOpenChange,
  companyId,
  customerId,
  contact,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** When set, the new contact is linked to this customer by the server. */
  customerId?: string;
  contact?: Contact;
  onCreated?: (contact: Contact) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [chosenCustomerId, setChosenCustomerId] = useState("");
  const linkedCustomerId = customerId ?? chosenCustomerId;
  const [candidates, setCandidates] = useState<ContactCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(contact?.displayName ?? "");
    setEmail(contact?.primaryEmail ?? "");
    setPhone(contact?.primaryPhone ?? "");
    setTitle(contact?.title ?? "");
    setCandidates([]);
    setError(null);
  }, [open, contact]);

  function reset() {
    setDisplayName("");
    setEmail("");
    setPhone("");
    setTitle("");
    setChosenCustomerId("");
    setCandidates([]);
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  const save = useMutation({
    mutationFn: (force: boolean) => contact
      ? crmApi.contacts.update(contact.id, {
        displayName: displayName.trim(),
        primaryEmail: email.trim() || null,
        primaryPhone: phone.trim() || null,
        title: title.trim() || null,
      })
      :
      crmApi.contacts.create(companyId, {
        displayName: displayName.trim(),
        primaryEmail: email.trim() || null,
        primaryPhone: phone.trim() || null,
        title: title.trim() || null,
        consents: {},
        ...(linkedCustomerId ? { customerId: linkedCustomerId } : {}),
        force,
      }),
    onSuccess: (savedContact) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.list(companyId) });
      if (linkedCustomerId) {
        void queryClient.invalidateQueries({ queryKey: ["crm-customer-contacts", linkedCustomerId] });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(savedContact.id) });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.contacts.detail(savedContact.id), "customers"] });
      close();
      onCreated?.(savedContact);
    },
    onError: (err) => {
      const found = duplicateCandidatesFromError(err);
      if (found.length > 0) {
        setCandidates(found as ContactCandidate[]);
        setError(null);
        return;
      }
      setError(t(contact ? "uxCrm.people.editError" : "crm.contacts.createError", { defaultValue: contact ? "Could not save this person." : undefined }));
    },
  });

  const forceCreate = candidates.length > 0;
  const canSubmit = displayName.trim().length > 0 && !save.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-dvh overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-medium">{contact ? t("uxCrm.people.editTitle", { defaultValue: "Edit person" }) : t("crm.contacts.createTitle")}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4 px-4 py-4"
          onSubmit={(event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            if (canSubmit) save.mutate(forceCreate);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="contact-create-name">{t("crm.contacts.fieldDisplayName")}</Label>
            <Input
              id="contact-create-name"
              value={displayName}
              autoFocus
              maxLength={200}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setCandidates([]);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contact-create-email">{t("crm.contacts.fieldEmail")}</Label>
              <Input
                id="contact-create-email"
                type="email"
                value={email}
                maxLength={320}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setCandidates([]);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-create-phone">{t("crm.contacts.fieldPhone")}</Label>
              <Input
                id="contact-create-phone"
                value={phone}
                maxLength={32}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setCandidates([]);
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-create-title">{t("crm.contacts.fieldTitle")}</Label>
            <Input
              id="contact-create-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          {!contact && !customerId && open && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("crm.contacts.customerOptional")}</p>
              <SalesCustomerPicker companyId={companyId} value={chosenCustomerId} onChange={setChosenCustomerId} />
              <p className="text-xs text-muted-foreground">{t("crm.contacts.customerHint")}</p>
            </div>
          )}

          <CustomerDuplicateNotice
            title={t("crm.contacts.duplicatesTitle")}
            hint={t("crm.contacts.duplicatesHint")}
            items={candidates.map((candidate) => ({
              id: candidate.record.id,
              label: candidate.record.displayName,
              reasons: candidate.reasons,
            }))}
            reasonLabel={(reason) =>
              reason.startsWith("phone:") ? t("crm.contacts.reasonPhone") : t("crm.contacts.reasonEmail")
            }
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" size="sm" onClick={close}>
              {t("crm.contacts.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {save.isPending
                ? t("crm.contacts.creating")
                : contact
                  ? t("uxCrm.people.save", { defaultValue: "Save changes" })
                : forceCreate
                  ? t("crm.contacts.createAnyway")
                  : t("crm.contacts.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
