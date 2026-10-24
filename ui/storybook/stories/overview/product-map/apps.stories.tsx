import type { Meta, StoryObj } from "@storybook/react-vite";
import { DEMO_APPS } from "../../../product-map/apps/demo-data";
import { AppsProposal } from "../../../product-map/apps/AppsProposal";

const meta = {
  id: "product-map-apps",
  title: "Overview/Mapa de producto/Apps",
  component: AppsProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Apps catalog (states, stepped connect dialog, per-agent permissions, contextual channels) with demo data; it does not render the production Apps pages.",
      notes: "Data in storybook/product-map/apps/demo-data.ts, shaped like ToolConnection.",
    },
  },
} satisfies Meta<typeof AppsProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Catalog with connected, attention and available apps. Connect one, open a connection and change per-agent permissions. */
export const Propuesta: Story = { args: { apps: DEMO_APPS } };

/** Nothing connected yet: the first screen. */
export const SinConexiones: Story = {
  args: { apps: DEMO_APPS.map((app) => ({ ...app, state: "available" as const, account: null, lastCheck: null, attention: null, usedBy: 0 })), hasConnections: false },
};

/** Phone width. */
export const Movil: Story = { args: { apps: DEMO_APPS }, globals: { viewport: { value: "mobile1", isRotated: false } } };
