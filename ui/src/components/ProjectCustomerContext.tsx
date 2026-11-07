import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { crmApi } from "@/api/crm";
import type { Customer } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";

type ProjectCustomerContextProps = {
  companyId: string;
  customerId: string | null;
  disabled: boolean;
  onChange: (customerId: string | null) => void;
};

export function filterProjectCustomerOptions(customers: Customer[], companyId: string) {
  return customers.filter(customer => customer.companyId === companyId && customer.status === "active");
}

export function ProjectCustomerContext({ companyId, customerId, disabled, onChange }: ProjectCustomerContextProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const customers = useInfiniteQuery({
    queryKey: ["project-customer-picker", companyId, query],
    queryFn: ({ pageParam }) => crmApi.customers.list(companyId, {
      q: query || undefined,
      status: "active",
      limit: 25,
      cursor: pageParam,
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: open,
  });
  const currentCustomer = useQuery({
    queryKey: queryKeys.customers.detail(customerId ?? "__none__"),
    queryFn: () => crmApi.customers.get(customerId!),
    enabled: Boolean(customerId),
  });

  const options = filterProjectCustomerOptions(customers.data?.pages.flatMap(page => page.items) ?? [], companyId);
  const selectedCustomer = currentCustomer.data?.companyId === companyId ? currentCustomer.data : null;
  const choose = (customerId: string | null) => {
    onChange(customerId);
    setOpen(false);
    setSearch("");
  };
  const displayName = selectedCustomer?.name
    ?? (customerId ? currentCustomer.isLoading
      ? t("uxProject.loadingCustomer", { defaultValue: "Loading linked customer…" })
      : t("uxProject.unavailableCustomer", { defaultValue: "Linked customer" })
      : t("uxProject.noCustomer", { defaultValue: "No customer linked" }));

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch(""); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={t("uxProject.selectCustomer", { defaultValue: "Select project customer" })} disabled={disabled} className="min-w-48 max-w-full justify-between">
            <span className="truncate">{displayName}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={search} onValueChange={setSearch} placeholder={t("uxProject.searchCustomers", { defaultValue: "Search customers by name or domain" })} />
            <CommandList className="overscroll-contain">
              {customers.isLoading ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("uxProject.loadingCustomers", { defaultValue: "Loading customers…" })}</div> : null}
              {customers.isError ? <div role="alert" className="px-3 py-3 text-sm text-destructive">{customers.error.message}</div> : null}
              {!customers.isLoading && !customers.isError && options.length === 0 ? <CommandEmpty>{t("uxProject.noCustomersFound", { defaultValue: "No active customers found." })}</CommandEmpty> : null}
              {options.length > 0 ? <CommandGroup>
                <CommandItem value="__no_customer__" onSelect={() => choose(null)}>
                  <span>{t("uxProject.noCustomer", { defaultValue: "No customer linked" })}</span>
                  {!customerId ? <Check className="ml-auto size-4" /> : null}
                </CommandItem>
                {options.map(customer => <CommandItem key={customer.id} value={customer.id} onSelect={() => choose(customer.id)}>
                  <span className="min-w-0 truncate">{customer.name}{customer.domain ? <span className="ml-2 text-muted-foreground">{customer.domain}</span> : null}</span>
                  {customer.id === customerId ? <Check className="ml-auto size-4" /> : null}
                </CommandItem>)}
              </CommandGroup> : null}
              {customers.hasNextPage ? <div className="border-t border-border p-2"><Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => void customers.fetchNextPage()} disabled={customers.isFetchingNextPage}>{customers.isFetchingNextPage ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}{t("uxProject.loadMoreCustomers", { defaultValue: "Load more customers" })}</Button></div> : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedCustomer ? <Link to={`/customers/${selectedCustomer.id}`} className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
        {t("uxProject.openCustomer", { defaultValue: "Open customer" })}<ArrowUpRight className="size-3.5" />
      </Link> : null}
      {customerId ? <Button type="button" variant="ghost" size="sm" onClick={() => choose(null)} disabled={disabled}>{t("uxProject.removeCustomer", { defaultValue: "Remove" })}</Button> : null}
    </div>
  );
}
