import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, MoreHorizontal, Pencil, RotateCcw, Users } from "lucide-react";
import type { Contact } from "@paperclipai/shared";
import { crmApi } from "@/api/crm";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContactCreateDialog } from "./ContactCreateDialog";
import { PersonCustomerLinks } from "./PersonCustomerLinks";
import { CrmQuickActions } from "./CrmQuickActions";

export function PeopleActionsMenu({ contact }: { contact: Contact }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const archived = contact.status === "archived";
  const customers = useQuery({
    queryKey: [...queryKeys.contacts.detail(contact.id), "customers"],
    queryFn: () => crmApi.contacts.listCustomers(contact.id),
    enabled: linksOpen,
  });
  const status = useMutation({
    mutationFn: () => crmApi.contacts.update(contact.id, { status: archived ? "active" : "archived" }),
    onSuccess: (updated) => {
      client.setQueryData(queryKeys.contacts.detail(contact.id), updated);
      void client.invalidateQueries({ queryKey: queryKeys.contacts.list(contact.companyId) });
    },
  });

  return <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
    {!archived && <CrmQuickActions target={{ kind: "contact", contact }} onEdit={() => setEditOpen(true)} />}
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label={t("uxCrm.people.moreActions", { name: contact.displayName, defaultValue: "More actions for {{name}}" })}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil />{t("uxCrm.people.edit", { defaultValue: "Edit person" })}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLinksOpen(true)}><Users />{t("uxCrm.people.manageCustomers", { defaultValue: "Manage customer links" })}</DropdownMenuItem>
        {archived
          ? <DropdownMenuItem disabled={status.isPending} onSelect={() => status.mutate()}><RotateCcw />{t("crm.customers.restore")}</DropdownMenuItem>
          : <DropdownMenuItem variant="destructive" disabled={status.isPending} onSelect={() => status.mutate()}><Archive />{t("uxCrm.people.archive", { defaultValue: "Archive person" })}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    {status.error && <span role="alert" className="absolute right-2 top-full z-10 max-w-64 rounded-md border border-destructive bg-background p-2 text-xs text-destructive">{t("uxCrm.people.actionError", { defaultValue: "Could not update this person." })}</span>}
    <ContactCreateDialog open={editOpen} onOpenChange={setEditOpen} companyId={contact.companyId} contact={contact} />
    <Dialog open={linksOpen} onOpenChange={setLinksOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("uxCrm.people.manageCustomersTitle", { name: contact.displayName, defaultValue: "Customer links for {{name}}" })}</DialogTitle></DialogHeader>
        <PersonCustomerLinks companyId={contact.companyId} contactId={contact.id} linked={customers.data ?? []} loading={customers.isLoading} loadError={!!customers.error} />
      </DialogContent>
    </Dialog>
  </div>;
}
