import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConversationsProposal } from "../../../product-map/conversations/ConversationsProposal";
import { DEMO_THREADS } from "../../../product-map/conversations/demo-data";
import { ConversationsBoard, ConversationsCompare } from "../../../product-map/conversations/ConversationsBoard";

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

// ── More states ─────────────────────────────────────────────────────────────

/** Skeletons while the inbox loads. */
export const Cargando: StoryObj = { render: () => <ConversationsBoard scenario="cargando" /> };

/** The inbox failed to load: "Reintentar" goes through loading and then shows the content. */
export const ErrorDeCarga: StoryObj = { render: () => <ConversationsBoard scenario="error" /> };

/** Role without access to customer conversations. */
export const SinPermisos: StoryObj = { render: () => <ConversationsBoard scenario="sin-permisos" /> };

/** About 190 threads: the list shows 25 and "Cargar más" adds the next page. */
export const MuchisimosDatos: StoryObj = { render: () => <ConversationsBoard scenario="muchos" /> };

/** Very long names and subjects, emoji, right-to-left and CJK text, and an unbreakable URL. */
export const TextosLargos: StoryObj = { render: () => <ConversationsBoard scenario="textos-largos" /> };

/** WhatsApp lost its connection: banner, read-only thread and "Reconectar". */
export const CanalDesconectado: StoryObj = { render: () => <ConversationsBoard scenario="canal-desconectado" /> };

/** Eight threads past their deadline, with a banner to answer the oldest. */
export const FueraDePlazo: StoryObj = { render: () => <ConversationsBoard scenario="fuera-de-plazo" /> };

/** A thread with 70 messages: scroll, anchoring and the latest message in view. */
export const HiloMuyLargo: StoryObj = { render: () => <ConversationsBoard scenario="hilo-largo" /> };

// ── More proposals ──────────────────────────────────────────────────────────

/** B · Two panels. Reading and answering first; the customer context opens in a drawer. */
export const VarianteB: StoryObj = { render: () => <ConversationsBoard variant="b" /> };

/** C · Mailbox grouped by customer. The whole relationship at once, reading pane beside the table. */
export const VarianteC: StoryObj = { render: () => <ConversationsBoard variant="c" /> };

/** The three layouts one under the other, each with a sentence about what it prioritises. */
export const CompararVariantes: StoryObj = { render: () => <ConversationsCompare /> };
