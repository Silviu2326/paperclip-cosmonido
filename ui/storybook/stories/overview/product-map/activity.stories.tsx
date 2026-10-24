import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActivityProposal } from "../../../product-map/activity/ActivityProposal";

const meta = {
  id: "product-map-activity",
  title: "Overview/Mapa de producto/Actividad",
  component: ActivityProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed single Actividad page (feed, runs, costs, budgets and timeline as tabs) with demo data; it does not render the production AuditHub or Costs pages.",
      notes: "Data in storybook/product-map/activity/demo-data.ts, consistent with the home and customers demo data.",
    },
  },
} satisfies Meta<typeof ActivityProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Five tabs in one page: Actividad, Ejecuciones, Costes, Presupuestos and Cronología. */
export const Propuesta: Story = { args: { variant: "active" } };

/** A company where nothing has happened yet. */
export const Vacia: Story = { args: { variant: "empty" } };

/** Phone width. */
export const Movil: Story = { args: { variant: "active" }, globals: { viewport: { value: "mobile1", isRotated: false } } };
