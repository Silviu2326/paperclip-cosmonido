import { MoreHorizontal, Pencil, FileText, UserPlus, Archive, RotateCcw } from "lucide-react";
import type { Customer } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function CustomersActionsMenu({ customer, onEdit, onProposal, onAddContact, onArchive, onRestore, busy = false }: {
  customer: Customer;
  onEdit: () => void;
  onProposal: () => void;
  onAddContact: () => void;
  onArchive: () => void;
  onRestore: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const archived = customer.status === "archived";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" onClick={(event) => event.stopPropagation()} aria-label={t("uxCrm.customers.moreActions", { name: customer.name, defaultValue: "More actions for {{name}}" })}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={onEdit}><Pencil />{t("uxCrm.customers.edit", { defaultValue: "Edit customer" })}</DropdownMenuItem>
        {!archived && <>
          <DropdownMenuItem onSelect={onProposal}><FileText />{t("uxCrm.customers.newProposal", { defaultValue: "New proposal" })}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onAddContact}><UserPlus />{t("uxCrm.customers.addPerson", { defaultValue: "Add person" })}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={busy} onSelect={onArchive}><Archive />{t("uxCrm.customers.archive", { defaultValue: "Archive customer" })}</DropdownMenuItem>
        </>}
        {archived && <DropdownMenuItem disabled={busy} onSelect={onRestore}><RotateCcw />{t("crm.customers.restore")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
