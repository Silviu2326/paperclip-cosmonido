import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsProposal } from "../../../product-map/settings/SettingsProposal";

const meta = {
  id: "product-map-settings",
  title: "Overview/Mapa de producto/Ajustes",
  component: SettingsProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed single Ajustes page grouped by who owns each setting (user, company, commercial account, instance) with demo data; it does not render the production settings pages.",
      notes: "Data in storybook/product-map/settings/demo-data.ts. Ownership follows doc/plans/2026-10-22-revision-paginas-reducir-sin-empeorar.md.",
    },
  },
} satisfies Meta<typeof SettingsProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** All groups for an administrator. Change a setting to see the save bar; try the danger actions. */
export const Propuesta: Story = { args: { isAdmin: true, startGroup: "profile" } };

/** A member who is not an administrator: no instance group. */
export const Miembro: Story = { args: { isAdmin: false, startGroup: "profile" } };

/** Phone width: the group list becomes a scrollable row. */
export const Movil: Story = { args: { isAdmin: true, startGroup: "account" }, globals: { viewport: { value: "mobile1", isRotated: false } } };
