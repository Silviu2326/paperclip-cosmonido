import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatProposal } from "../../../product-map/chat/ChatProposal";
import { DEMO_AGENTS, DEMO_CONVERSATIONS } from "../../../product-map/chat/demo-data";
import { ChatBoard, ChatCompare } from "../../../product-map/chat/ChatBoard";

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

// ── More states (the base ones above stay as they were) ────────────────────

/** Skeletons while the conversations load. */
export const Cargando: StoryObj = { render: () => <ChatBoard scenario="cargando" /> };

/** The chat failed to load: "Reintentar" goes through loading and then shows the content. */
export const ErrorDeCarga: StoryObj = { render: () => <ChatBoard scenario="error" /> };

/** Role without access to the chat. */
export const SinPermisos: StoryObj = { render: () => <ChatBoard scenario="sin-permisos" /> };

/** About 155 agents and a 130-message conversation: "Cargar más" in the roster and "Cargar mensajes anteriores" in the thread. */
export const MuchisimosDatos: StoryObj = { render: () => <ChatBoard scenario="muchos" /> };

/** Very long names and messages, emoji, CJK and right-to-left text, and an unbreakable URL. */
export const TextosLargos: StoryObj = { render: () => <ChatBoard scenario="textos-largos" /> };

/** Connection lost: banner with a countdown to the automatic retry, composer blocked until it is back. */
export const ConexionPerdida: StoryObj = { render: () => <ChatBoard scenario="conexion-perdida" /> };

/** The agent is answering right now: text appears word by word, with "Detener respuesta". */
export const RespuestaEnStreaming: StoryObj = { render: () => <ChatBoard scenario="respuesta-en-streaming" /> };

/** The last message did not go out: "Reenviar" sends it again. */
export const MensajeFallido: StoryObj = { render: () => <ChatBoard scenario="mensaje-fallido" /> };

/** The agent asks for access to something: allow once, always or not at all. */
export const AgentePidiendoPermiso: StoryObj = { render: () => <ChatBoard scenario="agente-pidiendo-permiso" /> };

// ── More proposals ──────────────────────────────────────────────────────────

/** B · Floating assistant: available from any page and aware of what you are looking at. */
export const VarianteB: StoryObj = { render: () => <ChatBoard variant="b" /> };

/** C · Thread as a document: clean reading, the agent's actions folded into one line. */
export const VarianteC: StoryObj = { render: () => <ChatBoard variant="c" /> };

/** The three layouts one under the other, each with a sentence about what it prioritises. */
export const CompararVariantes: StoryObj = { render: () => <ChatCompare /> };
