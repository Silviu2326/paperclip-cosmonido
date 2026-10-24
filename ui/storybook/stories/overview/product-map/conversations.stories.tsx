import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConversationsProposal } from "../../../product-map/conversations/ConversationsProposal";
import { DEMO_THREADS } from "../../../product-map/conversations/demo-data";

const meta = {
  id: "product-map-conversations",
  title: "Overview/Mapa de producto/Conversaciones",
  component: ConversationsProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Conversaciones page (thread list, thread with suggested reply, customer context, calls and agenda) with demo data; it does not render the production inbox.",
      notes: "Data in storybook/product-map/conversations/demo-data.ts; customers and contacts match customers/demo-data.ts.",
    },
  },
} satisfies Meta<typeof ConversationsProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Six threads across WhatsApp, email, web chat and calls. Use a suggested reply and send it. */
export const Propuesta: Story = { args: { threads: DEMO_THREADS } };

/** No channels connected yet. */
export const Vacio: Story = { args: { threads: [] } };

/** Phone width: list first, then the thread with a back button. */
export const Movil: Story = { args: { threads: DEMO_THREADS }, globals: { viewport: { value: "mobile1", isRotated: false } } };
