import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { crmApi, type CustomerLinkedContact } from "../../api/crm";
import { ApiError } from "@/api/client";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ContactCreateDialog } from "./ContactCreateDialog";

export function CustomerContactsTab({ companyId, customerId }: { companyId: string; customerId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [chosenContactId, setChosenContactId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const linkedKey = ["crm-customer-contacts", customerId] as const;

  const linkedQuery = useQuery({
    queryKey: linkedKey,
    queryFn: () => crmApi.customers.listContacts(customerId),
  });

  const allContactsQuery = useQuery({
    queryKey: ["crm-contact-options", companyId],
    queryFn: () => crmApi.contacts.list(companyId, { status: "active", limit: 100 }),
  });

  const linked: CustomerLinkedContact[] = linkedQuery.data ?? [];
  const linkedIds = new Set(linked.map((row) => row.contact.id));
  const options = (allContactsQuery.data?.items ?? []).filter((contact) => !linkedIds.has(contact.id));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: linkedKey });
  };

  const link = useMutation({
    mutationFn: (contactId: string) =>
      crmApi.customers.linkContact(customerId, { contactId, isPrimary: linked.length === 0 }),
    onSuccess: () => {
      setChosenContactId("");
      refresh();
    },
  });

  const unlink = useMutation({
    mutationFn: (contactId: string) => crmApi.customers.unlinkContact(customerId, contactId),
    onSuccess: refresh,
  });

  const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label={t("crm.customers.chooseContact")}
          className="w-auto min-w-48"
          value={chosenContactId}
          onChange={(event) => setChosenContactId(event.target.value)}
          disabled={options.length === 0}
        >
          <option value="">{t("crm.customers.chooseContact")}</option>
          {options.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.displayName}
            </option>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          variant="outline"
          disabled={!chosenContactId || link.isPending}
          onClick={() => link.mutate(chosenContactId)}
        >
          {t("crm.customers.link")}
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          {t("crm.customers.newContact")}
        </Button>
      </div>

      {link.error && <p className="text-sm text-destructive">{errorMessage(link.error, t("crm.customers.linkError"))}</p>}
      {unlink.error && <p className="text-sm text-destructive">{errorMessage(unlink.error, t("crm.customers.linkError"))}</p>}

      {linkedQuery.isLoading && <p className="text-sm text-muted-foreground">{t("crm.contacts.loading")}</p>}
      {linkedQuery.error && <p className="text-sm text-destructive">{t("crm.contacts.loadError")}</p>}
      {linkedQuery.data && linked.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("crm.customers.contactsEmpty")}</p>
      )}

      {linked.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {linked.map((row) => (
            <li key={row.contact.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link to={`/customers/contacts/${row.contact.id}`} className="truncate font-medium hover:underline">{row.contact.displayName}</Link>
                  {row.isPrimary && <Badge variant="secondary">{t("crm.customers.primaryContact")}</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {row.contact.primaryEmail ?? t("crm.contacts.noEmail")}
                  {" · "}
                  {row.contact.primaryPhone ?? t("crm.contacts.noPhone")}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={unlink.isPending}
                onClick={() => unlink.mutate(row.contact.id)}
              >
                {t("crm.customers.unlink")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ContactCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        customerId={customerId}
      />
    </div>
  );
}
