import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, UserPlus, ClipboardPlus } from "lucide-react";
import type { Contact, Customer } from "@paperclipai/shared";
import { crmApi, type CustomerLinkedContact } from "@/api/crm";
import { useDialogActions } from "@/context/DialogContext";
import { useActiveCompanyPrefix } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";

export type CrmActionTarget =
  | { kind: "customer"; customer: Customer }
  | { kind: "contact"; contact: Contact };

interface CrmQuickActionsProps {
  target: CrmActionTarget;
  onEdit: () => void;
  onAddContact?: () => void;
}

function contactName(contact: Contact) {
  return contact.displayName || [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

export function CrmQuickActions({ target, onEdit, onAddContact }: CrmQuickActionsProps) {
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const { t } = useTranslation();
  const companyPrefix = useActiveCompanyPrefix();
  const { openNewIssue } = useDialogActions();
  const customer = target.kind === "customer" ? target.customer : undefined;
  const contacts = useQuery({
    queryKey: ["crm-customer-contacts", customer?.id],
    queryFn: () => crmApi.customers.listContacts(customer!.id),
    enabled: contactDialogOpen && Boolean(customer),
  });
  const name = target.kind === "contact" ? contactName(target.contact) : customer!.name;
  const entries = target.kind === "contact"
    ? [{ key: target.contact.id, label: contactName(target.contact), email: target.contact.primaryEmail, phone: target.contact.primaryPhone }]
    : [
        ...(contacts.data ?? []).map((entry: CustomerLinkedContact) => ({
          key: entry.contact.id,
          label: `${contactName(entry.contact)}${entry.isPrimary ? ` (${t("crmQuick.primary")})` : ""}`,
          email: entry.contact.primaryEmail,
          phone: entry.contact.primaryPhone,
        })),
        ...(customer!.contactEmail || customer!.phone ? [{ key: customer!.id, label: t("crmQuick.customerDetails"), email: customer!.contactEmail, phone: customer!.phone }] : []),
      ];
  const availableEntries = entries.filter((entry) => entry.email || entry.phone);

  const startTask = () => {
    const route = target.kind === "customer" ? `/customers/${target.customer.id}` : `/customers/contacts/${target.contact.id}`;
    const entityUrl = companyPrefix ? `/${companyPrefix}${route}` : route;
    const detail = target.kind === "customer"
      ? `Customer: ${target.customer.name}`
      : `Person: ${contactName(target.contact)}`;
    openNewIssue({
      title: t("crmQuick.taskTitle", { name }),
      description: `${detail}\n${t("crmQuick.crmRecordLabel")}: ${window.location.origin}${entityUrl}`,
      navigateOnCreate: true,
    });
  };

  return (
    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <Button type="button" variant="outline" size="sm" onClick={() => setContactDialogOpen(true)}>
        <Mail data-icon="inline-start" />{t("crmQuick.contact")}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={startTask}>
        <ClipboardPlus data-icon="inline-start" />{t("crmQuick.assignAgent")}
      </Button>
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent>
          <DialogTitle>{t("crmQuick.contactTitle", { name })}</DialogTitle>
          <DialogDescription>{t("crmQuick.contactDescription")}</DialogDescription>
          {customer && contacts.isLoading ? <p>{t("crmQuick.loadingContacts")}</p> : null}
          {customer && contacts.isError ? <p role="alert">{t("crmQuick.contactsError")}</p> : null}
          {availableEntries.length > 0 && !contacts.isLoading && (
            <div className="flex flex-col gap-3">
              {availableEntries.map((entry) => <div key={entry.key} className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-sm font-medium">{entry.label}</span>
                {entry.email && <Button asChild variant="outline"><a href={`mailto:${entry.email}`}><Mail data-icon="inline-start" />{entry.email}</a></Button>}
                {entry.phone && <Button asChild variant="outline"><a href={`tel:${entry.phone}`}><Phone data-icon="inline-start" />{entry.phone}</a></Button>}
              </div>)}
            </div>
          )}
          {availableEntries.length === 0 && !contacts.isLoading && (
            <p>{t("crmQuick.noContactDetails")}</p>
          )}
          {availableEntries.length === 0 && !contacts.isLoading && onAddContact && (
            <Button type="button" variant="outline" onClick={() => { setContactDialogOpen(false); onAddContact(); }}>
              <UserPlus data-icon="inline-start" />{t("crmQuick.addContact")}
            </Button>
          )}
          {availableEntries.length === 0 && !contacts.isLoading && (
            <Button type="button" variant="ghost" onClick={() => { setContactDialogOpen(false); onEdit(); }}>
              {t("crmQuick.editRecord")}
            </Button>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setContactDialogOpen(false)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
