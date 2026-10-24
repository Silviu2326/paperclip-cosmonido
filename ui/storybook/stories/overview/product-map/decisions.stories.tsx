import type { Meta, StoryObj } from "@storybook/react-vite";
import { DecisionsProposal } from "../../../product-map/decisions/DecisionsProposal";
import { DEMO_DECISIONS } from "../../../product-map/decisions/demo-data";

const meta = {
  id: "product-map-decisions",
  title: "Overview/Mapa de producto/Decisiones",
  component: DecisionsProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Decisiones inbox (urgency groups, inline context and actions, undo) with demo data; it does not render the production WhatNeedsMe page.",
      notes: "Data in storybook/product-map/decisions/demo-data.ts, shaped like AttentionItem.",
    },
  },
} satisfies Meta<typeof DecisionsProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Seven pending decisions. Approve, reject, answer or postpone them; "Deshacer" brings them back. */
export const Propuesta: Story = { args: { decisions: DEMO_DECISIONS } };

/** Nothing pending. */
export const TodoAlDia: Story = { args: { decisions: [] } };

/** Phone width. */
export const Movil: Story = { args: { decisions: DEMO_DECISIONS }, globals: { viewport: { value: "mobile1", isRotated: false } } };
