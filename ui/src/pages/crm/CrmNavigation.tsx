import { PageTabBar, type PageTabItem } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { useTranslation } from "@/i18n";
import { Outlet, useActiveCompanyPrefix, useLocation, useNavigate } from "@/lib/router";

type SectionTab = PageTabItem & { to: string; matches: (pathname: string) => boolean };

function SectionNavigation({ tabs }: { tabs: SectionTab[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const companyPrefix = useActiveCompanyPrefix();
  const pathname = companyPrefix && location.pathname.startsWith(`/${companyPrefix}/`)
    ? location.pathname.slice(companyPrefix.length + 1)
    : location.pathname;
  const active = tabs.find((tab) => tab.matches(pathname)) ?? tabs[0];
  const selectTab = (value: string) => {
    const target = tabs.find((tab) => tab.value === value);
    if (target) navigate(`${target.to}${location.search}${location.hash}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={active.value} onValueChange={selectTab}>
        <PageTabBar items={tabs} value={active.value} onValueChange={selectTab} align="start" />
      </Tabs>
      <Outlet />
    </div>
  );
}

const onOrUnder = (path: string) => (pathname: string) => pathname === path || pathname.startsWith(`${path}/`);

export function CustomersNavigation() {
  const { t } = useTranslation();
  const location = useLocation();
  // Services live in a popup on the customers page; their own page only gets a tab while you are on it.
  const onServices = /\/customers\/services(\/|$)/.test(location.pathname);
  return <SectionNavigation tabs={[
    { value: "customers", to: "/customers", label: t("uxCrm.customers", { defaultValue: "Customers" }), matches: (path) => path === "/customers" || (/^\/customers\/[^/]+$/.test(path) && !path.endsWith("/contacts") && !path.endsWith("/services")) },
    { value: "contacts", to: "/customers/contacts", label: t("uxCrm.list.people", { defaultValue: "Personas" }), matches: onOrUnder("/customers/contacts") },
    ...(onServices ? [{ value: "services", to: "/customers/services", label: t("uxCrm.services", { defaultValue: "Services" }), matches: onOrUnder("/customers/services") }] : []),
  ]} />;
}

export function SalesNavigation() {
  const { t } = useTranslation();
  return <SectionNavigation tabs={[
    { value: "leads", to: "/sales/leads", label: t("uxCrm.leads", { defaultValue: "Leads" }), matches: onOrUnder("/sales/leads") },
    { value: "opportunities", to: "/sales/opportunities", label: t("uxCrm.opportunities", { defaultValue: "Opportunities" }), matches: onOrUnder("/sales/opportunities") },
    { value: "proposals", to: "/sales/proposals", label: t("uxCrm.proposals", { defaultValue: "Proposals" }), matches: onOrUnder("/sales/proposals") },
    { value: "forms", to: "/sales/forms", label: t("uxCrm.forms", { defaultValue: "Lead forms" }), matches: onOrUnder("/sales/forms") },
  ]} />;
}

export function ConversationsNavigation() {
  const { t } = useTranslation();
  return <SectionNavigation tabs={[
    { value: "conversations", to: "/conversations", label: t("uxCrm.conversations", { defaultValue: "Conversations" }), matches: (path) => path === "/conversations" || onOrUnder("/conversations")(path) && !onOrUnder("/conversations/calls")(path) },
    { value: "calls", to: "/conversations/calls", label: t("uxCrm.calls", { defaultValue: "Calls" }), matches: onOrUnder("/conversations/calls") },
    { value: "agenda", to: "/schedule", label: t("uxCrm.agenda", { defaultValue: "Agenda" }), matches: onOrUnder("/schedule") },
  ]} />;
}
