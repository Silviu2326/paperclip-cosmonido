import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeProposal } from "../../../product-map/home/HomeProposal";

const meta = {
  id: "product-map-home",
  title: "Overview/Mapa de producto/Inicio",
  component: HomeProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Inicio (what needs you, team now, business results, today) with demo data; it does not render the production Dashboard.",
      notes: "Data in storybook/product-map/home/demo-data.ts; reuses the customers and decisions demo data.",
    },
  },
} satisfies Meta<typeof HomeProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A normal working day. */
export const Propuesta: Story = { args: { variant: "active" } };

/** A brand-new company: first steps instead of empty charts. */
export const EmpresaNueva: Story = { args: { variant: "new" } };

/** Phone width. */
export const Movil: Story = { args: { variant: "active" }, globals: { viewport: { value: "mobile1", isRotated: false } } };
