import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { PluginLauncherProvider } from "@/plugins/launchers";
import { businessNavigationKey } from "@/hooks/useBusinessNavigation";
import { setExperimentalFlags } from "../../../fixtures/experimentalFlags";
import { STORYBOOK_COMPANY_ID } from "../../../fixtures/onboardingDraft";
import { storybookAuthSession } from "../../../fixtures/paperclipData";
import { ProposedSidebar } from "../../../product-map/ProposedSidebar";
import { SIDEBAR_PROPOSAL } from "../../../product-map/sidebar-proposal";

interface CurrentSidebarArgs {
  streamlined: boolean;
  combinedInboxTasks: boolean;
  agentChat: boolean;
  goalsLink: boolean;
  business: boolean;
  agenda: boolean;
  office: boolean;
}

/**
 * The real <Sidebar /> under a fresh query client keyed by the controls, so
 * toggling a flag re-reads the experimental settings fixture.
 */
function CurrentSidebar(args: CurrentSidebarArgs) {
  const key = JSON.stringify(args);
  setExperimentalFlags({
    enableStreamlinedUi: args.streamlined,
    enableCombinedInboxTasks: args.combinedInboxTasks,
    enableAgentChat: args.agentChat,
    enableGoalsSidebarLink: args.goalsLink,
  });
  try {
    window.localStorage.setItem(
      businessNavigationKey(STORYBOOK_COMPANY_ID, storybookAuthSession.user.id),
      JSON.stringify({ business: args.business, agenda: args.agenda, office: args.office }),
    );
  } catch { /* storage blocked: the sidebar falls back to its defaults */ }
  const [client] = useState(() => new Map<string, QueryClient>());
  if (!client.has(key)) client.set(key, new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider key={key} client={client.get(key)!}>
      <PluginLauncherProvider>
        <Sidebar />
      </PluginLauncherProvider>
    </QueryClientProvider>
  );
}

function Column({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="max-w-60 text-xs text-muted-foreground">{note}</p>
      </div>
      <div className="overflow-hidden rounded-md border border-border" style={{ height: 720 }}>{children}</div>
    </section>
  );
}

const productionArgs: CurrentSidebarArgs = {
  streamlined: true,
  combinedInboxTasks: false,
  agentChat: false,
  goalsLink: false,
  business: true,
  agenda: false,
  office: false,
};
const ROUTE = "/PAP/dashboard";

const meta = {
  id: "product-map-sidebar",
  title: "Overview/Mapa de producto/Sidebar",
  parameters: {
    layout: "padded",
    paperclip: {
      capabilities: [],
      exception: "Product decision tool comparing the production Sidebar with a proposal; the canonical sidebar capability stories live in navigation-preferences.",
      status: "proposed",
      implementation: "guide",
      boundary: "fixtures",
      notes: "Actual is the production Sidebar with flag and shortcut controls; Propuesta is drawn from storybook/product-map/sidebar-proposal.ts with the real sidebar parts.",
    },
  },
} satisfies Meta;

export default meta;

/** Today's sidebar. Use the Controls panel to switch flags and shortcuts. */
export const Actual: StoryObj<CurrentSidebarArgs> = {
  args: productionArgs,
  parameters: { initialEntries: [ROUTE] },
  render: (args) => (
    <Column title="Sidebar actual" note="El componente real de producción, con datos de prueba.">
      <CurrentSidebar {...args} />
    </Column>
  ),
};

/** The proposal from product-map/sidebar-proposal.ts. Edit that file and save. */
export const Propuesta: StoryObj = {
  parameters: { initialEntries: ["/PAP/dashboard"] },
  render: () => (
    <Column title="Propuesta" note="Se dibuja desde storybook/product-map/sidebar-proposal.ts.">
      <ProposedSidebar sections={SIDEBAR_PROPOSAL} />
    </Column>
  ),
};

/** Current and proposed side by side. */
export const Comparar: StoryObj<CurrentSidebarArgs> = {
  args: productionArgs,
  parameters: { initialEntries: [ROUTE] },
  render: (args) => (
    <div className="flex flex-wrap gap-6">
      <Column title="Actual" note="Producción (sidebar nueva).">
        <CurrentSidebar {...args} />
      </Column>
      <Column title="Propuesta" note="sidebar-proposal.ts">
        <ProposedSidebar sections={SIDEBAR_PROPOSAL} />
      </Column>
    </div>
  ),
};
