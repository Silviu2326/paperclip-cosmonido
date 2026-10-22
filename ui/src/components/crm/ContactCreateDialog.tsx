import { useState } from "react";
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

interface ContactCandidate {
  record: Contact;
  reasons: string[];
}

export function ContactCreateDialog({
  open,
  onOpenChange,
  companyId,
  customerId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** When set, the new contact is linked to this customer by the server. */
  customerId?: string;
  onCreated?: (contact: Contact) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [candidates, setCandidates] = useState<ContactCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDisplayName("");
    setEmail("");
    setPhone("");
    setTitle("");
    setCandidates([]);
    setError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  const create = useMutation({
    mutationFn: (force: boolean) =>
      crmApi.contacts.create(companyId, {
        displayName: displayName.trim(),
        primaryEmail: email.trim() || null,
        primaryPhone: phone.trim() || null,
        title: title.trim() || null,
        consents: {},
        ...(customerId ? { customerId } : {}),
        force,
      }),
    onSuccess: (contact) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.list(companyId) });
      if (customerId) {
        void queryClient.invalidateQueries({ queryKey: ["crm-customer-contacts", customerId] });
      }
      close();
      onCreated?.(contact);
    },
    onError: (err) => {
      const found = duplicateCandidatesFromError(err);
      if (found.length > 0) {
        setCandidates(found as ContactCandidate[]);
        setError(null);
        return;
      }
      setError(t("crm.contacts.createError"));
    },
  });

  const forceCreate = candidates.length > 0;
  const canSubmit = displayName.trim().length > 0 && !create.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-medium">{t("crm.contacts.createTitle")}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) create.mutate(forceCreate);
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
              {create.isPending
                ? t("crm.contacts.creating")
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
