import type { Meta, StoryObj } from "@storybook/react-vite";
import { CustomersProposal } from "../../../product-map/customers/CustomersProposal";
import { DEMO_CUSTOMERS } from "../../../product-map/customers/demo-data";

const meta = {
  id: "product-map-customers",
  title: "Overview/Mapa de producto/Clientes",
  component: CustomersProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed single Customers page (customers, people and services in one view) with demo data; it does not render the production page.",
      notes: "Data in storybook/product-map/customers/demo-data.ts; aggregates come from APIs that today live on separate pages.",
    },
  },
} satisfies Meta<typeof CustomersProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Customers with their people, services, proposals and work together. Click a customer to open its panel. */
export const Propuesta: Story = { args: { customers: DEMO_CUSTOMERS } };

/** First visit: what to do before there are customers. */
export const SinClientes: Story = { args: { customers: [] } };

/** Phone width. */
export const Movil: Story = {
  args: { customers: DEMO_CUSTOMERS },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
