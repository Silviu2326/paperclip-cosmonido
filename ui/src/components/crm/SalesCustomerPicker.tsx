import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { crmApi } from "@/api/crm";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { CustomerCreateDialog } from "./CustomerCreateDialog";

export function SalesCustomerPicker({ companyId, value, onChange }: { companyId: string; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["sales-customer-options", companyId, search],
    queryFn: ({ pageParam }) => crmApi.customers.list(companyId, { q: search.trim() || undefined, status: "active", limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!companyId,
  });
  const selected = useQuery({ queryKey: ["sales-customer-option", companyId, value], queryFn: () => crmApi.customers.get(value), enabled: !!value });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return <div className="flex flex-col gap-2">
    <Input aria-label={t("salesWorkspace.searchCustomers")} placeholder={t("salesWorkspace.searchCustomers")} value={search} onChange={(event) => setSearch(event.target.value)} />
    <NativeSelect aria-label={t("salesWorkspace.customer")} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t("crm.opportunities.create.chooseCustomer")}</option>
      {value && !items.some((item) => item.id === value) && <option value={value}>{selected.data?.name ?? t("salesWorkspace.selectedCustomer")}</option>}
      {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </NativeSelect>
    {(query.error || selected.error) && <p role="alert" className="text-sm text-destructive">{t("salesWorkspace.customersError")}</p>}
    <div className="flex flex-wrap gap-2">
      {query.hasNextPage && <Button type="button" size="sm" variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{t("salesWorkspace.loadMore")}</Button>}
      {query.error && <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>{t("salesWorkspace.retry")}</Button>}
      <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(true)}>{t("salesWorkspace.newCustomer")}</Button>
    </div>
    {createOpen && <CustomerCreateDialog open companyId={companyId} initialName={search} onOpenChange={setCreateOpen} onCreated={(customer) => onChange(customer.id)} />}
  </div>;
}
