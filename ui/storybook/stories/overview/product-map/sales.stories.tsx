import type { Meta, StoryObj } from "@storybook/react-vite";
import { SalesProposal } from "../../../product-map/sales/SalesProposal";
import { DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PROPOSALS } from "../../../product-map/sales/demo-data";

const meta = {
  id: "product-map-sales",
  title: "Overview/Mapa de producto/Ventas",
  component: SalesProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed single Ventas page (pipeline board, leads, proposals and lead forms together) with demo data; it does not render the production CRM pages.",
      notes: "Data in storybook/product-map/sales/demo-data.ts; customers and amounts match customers/demo-data.ts.",
    },
  },
} satisfies Meta<typeof SalesProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

const full = { opportunities: DEMO_OPPORTUNITIES, leads: DEMO_LEADS, proposals: DEMO_PROPOSALS };

/** Forecast, pipeline board, leads to qualify (convert with or without an opportunity), proposals and forms. */
export const Propuesta: Story = { args: full };

/** No leads, opportunities or proposals yet. */
export const Vacio: Story = { args: { opportunities: [], leads: [], proposals: [] } };

/** Phone width: the board scrolls sideways. */
export const Movil: Story = { args: full, globals: { viewport: { value: "mobile1", isRotated: false } } };
