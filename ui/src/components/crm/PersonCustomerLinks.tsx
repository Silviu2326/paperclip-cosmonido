import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi, type ContactLinkedCustomer } from "@/api/crm";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { SalesCustomerPicker } from "./SalesCustomerPicker";

export function PersonCustomerLinks({ companyId, contactId, linked, loading, loadError }: {
  companyId: string;
  contactId: string;
  linked: ContactLinkedCustomer[];
  loading: boolean;
  loadError: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [choosing, setChoosing] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const refresh = async (id: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: [...queryKeys.contacts.detail(contactId), "customers"] }),
      client.invalidateQueries({ queryKey: ["crm-customer-contacts", id] }),
    ]);
  };
  const link = useMutation({
    mutationFn: (id: string) => crmApi.customers.linkContact(id, { contactId }),
    onSuccess: async (_, id) => {
      await refresh(id);
      setChoosing(false);
      setCustomerId("");
    },
  });
  const unlink = useMutation({
    mutationFn: (id: string) => crmApi.customers.unlinkContact(id, contactId),
    onSuccess: (_, id) => refresh(id),
  });
  const pending = link.isPending || unlink.isPending;
  return <div className="flex flex-col gap-3">
    {loading && <p className="text-sm text-muted-foreground">{t("crm.contacts.loading")}</p>}
    {loadError && <p role="alert" className="text-sm text-destructive">{t("crm.contacts.customersLoadError")}</p>}
    {!loading && !loadError && linked.length === 0 && <p className="text-sm text-muted-foreground">{t("crm.contacts.noLinkedCustomers")}</p>}
    {linked.map(({ customer, role }) => (
      <div key={customer.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3">
        <div className="min-w-0">
          <Link to={`/customers/${customer.id}`} className="block truncate text-sm font-medium hover:underline">{customer.name}</Link>
          {role && <p className="truncate text-xs text-muted-foreground">{role}</p>}
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => unlink.mutate(customer.id)}
          aria-label={t("crm.contacts.unlinkCustomerName", { name: customer.name })}>{t("crm.customers.unlink")}</Button>
      </div>
    ))}
    {(link.error || unlink.error) && <p role="alert" className="text-sm text-destructive">{t("crm.contacts.customerLinkError")}</p>}
    {choosing ? <div className="flex flex-col gap-3">
      <SalesCustomerPicker companyId={companyId} value={customerId} onChange={setCustomerId} />
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { setChoosing(false); link.reset(); }}>{t("crm.contacts.cancel")}</Button>
        <Button type="button" size="sm" disabled={pending || loading || loadError || !customerId || linked.some((row) => row.customer.id === customerId)} onClick={() => link.mutate(customerId)}>{t("crm.customers.link")}</Button>
      </div>
    </div> : <Button type="button" variant="outline" size="sm" disabled={pending || loading || loadError} onClick={() => { setChoosing(true); link.reset(); unlink.reset(); }}>{t("crm.contacts.linkCustomer")}</Button>}
  </div>;
}
