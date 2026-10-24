import type { Customer, CustomerHealth } from "@paperclipai/shared";

export type CustomerSortKey = "name" | "health" | "created";
/** null keeps the order the server returned. */
export type CustomerSort = { key: CustomerSortKey; direction: "asc" | "desc" } | null;
export type CustomerListFilter = "all" | "attention" | "new" | "archived";

const HEALTH_ORDER: Record<CustomerHealth, number> = { risk: 0, watch: 1, good: 2 };
const UNRATED_ORDER = 3;
const NEW_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

/** Customers whose health is low or worth watching. Unrated customers do not count. */
export function needsAttention(customer: Pick<Customer, "health">): boolean {
  return customer.health === "watch" || customer.health === "risk";
}

/** Created in the last 30 days. */
export function isNewCustomer(customer: Pick<Customer, "createdAt">, now: Date = new Date()): boolean {
  const created = new Date(customer.createdAt).getTime();
  return Number.isFinite(created) && now.getTime() - created <= NEW_WINDOW_DAYS * DAY_MS;
}

export function filterCustomers(customers: Customer[], filter: CustomerListFilter, now: Date = new Date()): Customer[] {
  if (filter === "attention") return customers.filter(needsAttention);
  if (filter === "new") return customers.filter((customer) => isNewCustomer(customer, now));
  return customers;
}

const SORTERS: Record<CustomerSortKey, (a: Customer, b: Customer) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  health: (a, b) => (a.health ? HEALTH_ORDER[a.health] : UNRATED_ORDER) - (b.health ? HEALTH_ORDER[b.health] : UNRATED_ORDER),
  created: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
};

export function sortCustomers(customers: Customer[], sort: CustomerSort): Customer[] {
  if (!sort) return customers;
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...customers].sort((a, b) => sign * SORTERS[sort.key](a, b));
}

/** Click cycle: first click is the natural direction (newest first for dates), the second reverses it, the third clears. */
export function nextCustomerSort(current: CustomerSort, key: CustomerSortKey): CustomerSort {
  const first = key === "created" ? "desc" : "asc";
  if (!current || current.key !== key) return { key, direction: first };
  return current.direction === first ? { key, direction: first === "asc" ? "desc" : "asc" } : null;
}
