import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentsProposal } from "../../../product-map/agents/AgentsProposal";
import { DEMO_TEAM } from "../../../product-map/agents/demo-data";

const meta = {
  id: "product-map-agents",
  title: "Overview/Mapa de producto/Agentes",
  component: AgentsProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Equipo page (cards, list and org chart, agent side panel, hire popup) with demo data; it does not render the production Agents page.",
      notes: "Data in storybook/product-map/agents/demo-data.ts, shaped like Agent plus run and task aggregates the page would join.",
    },
  },
} satisfies Meta<typeof AgentsProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Five agents. Click one to open its panel, change its autonomy, pause it, or hire a new one. */
export const Propuesta: Story = { args: { agents: DEMO_TEAM } };

/** A company with no agents yet. */
export const SinAgentes: Story = { args: { agents: [] } };

/** Phone width. */
export const Movil: Story = { args: { agents: DEMO_TEAM }, globals: { viewport: { value: "mobile1", isRotated: false } } };
