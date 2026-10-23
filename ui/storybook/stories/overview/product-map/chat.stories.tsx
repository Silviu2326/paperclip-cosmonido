import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatProposal } from "../../../product-map/chat/ChatProposal";
import { DEMO_AGENTS, DEMO_CONVERSATIONS } from "../../../product-map/chat/demo-data";

const meta = {
  id: "product-map-chat",
  title: "Overview/Mapa de producto/Chat con agentes",
  component: ChatProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Chat with agents page (roster, one conversation with inline work cards, side panel of tasks and files) with demo data; it does not render the production page.",
      notes: "Data in storybook/product-map/chat/demo-data.ts; inline cards (task, deliverable, approval) come from activity that today lives in the task thread.",
    },
  },
} satisfies Meta<typeof ChatProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A conversation with a task created, a deliverable and a pending approval. Try approving it or sending a message. */
export const Propuesta: Story = { args: { agents: DEMO_AGENTS, conversations: DEMO_CONVERSATIONS, initialAgentId: "a-ceo" } };

/** Agent in the middle of a job: live steps inside the thread. */
export const AgenteTrabajando: Story = { args: { agents: DEMO_AGENTS, conversations: DEMO_CONVERSATIONS, initialAgentId: "a-content" } };

/** First conversation with an agent that has no history yet. */
export const PrimeraConversacion: Story = { args: { agents: DEMO_AGENTS, conversations: DEMO_CONVERSATIONS, initialAgentId: "a-research" } };

/** Landing with nobody selected. */
export const SinSeleccion: Story = { args: { agents: DEMO_AGENTS, conversations: DEMO_CONVERSATIONS } };

/** Company with no agents yet. */
export const SinAgentes: Story = { args: { agents: [], conversations: {} } };

/** Phone width: roster first, tap an agent to open the chat. */
export const Movil: Story = {
  args: { agents: DEMO_AGENTS, conversations: DEMO_CONVERSATIONS },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
