import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentsProposal } from "../../../product-map/agents/AgentsProposal";
import { DEMO_TEAM } from "../../../product-map/agents/demo-data";
import { AgentsBoard, AgentsCompare } from "../../../product-map/agents/AgentsBoard";

const meta = {
  id: "product-map-agents",
  title: "Overview/Mapa de producto/Agentes",
  component: AgentsProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Equipo page (cards, list and org chart, agent side panel, hire popup) with demo data; it does not render the production Agents page.",
      notes: "Data in storybook/product-map/agents/demo-data.ts, shaped like Agent plus run and task aggregates the page would join.",
    },
  },
} satisfies Meta<typeof AgentsProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Five agents. Click one to open its panel, change its autonomy, pause it, or hire a new one. */
export const Propuesta: Story = { args: { agents: DEMO_TEAM } };

/** A company with no agents yet. */
export const SinAgentes: Story = { args: { agents: [] } };

/** Phone width. */
export const Movil: Story = { args: { agents: DEMO_TEAM }, globals: { viewport: { value: "mobile1", isRotated: false } } };

// ── More states ─────────────────────────────────────────────────────────────

/** Skeletons while the team loads. */
export const Cargando: StoryObj = { render: () => <AgentsBoard scenario="cargando" /> };

/** The team failed to load: "Reintentar" goes through loading and then shows the content. */
export const ErrorDeCarga: StoryObj = { render: () => <AgentsBoard scenario="error" /> };

/** Role without access to the team. */
export const SinPermisos: StoryObj = { render: () => <AgentsBoard scenario="sin-permisos" /> };

/** About 165 agents: 24 at a time with "Cargar más". */
export const MuchisimosDatos: StoryObj = { render: () => <AgentsBoard scenario="muchos" /> };

/** Very long names, roles and tasks, emoji, CJK and right-to-left text, and an unbreakable URL. */
export const TextosLargos: StoryObj = { render: () => <AgentsBoard scenario="textos-largos" /> };

/** Marta ran out of monthly budget and paused herself: the panel offers to raise the limit. */
export const AgentePausadoPorPresupuesto: StoryObj = { render: () => <AgentsBoard scenario="pausado-por-presupuesto" /> };

/** Nora failed to send: "Reintentar" puts her back to work. */
export const AgenteConErrorYReintento: StoryObj = { render: () => <AgentsBoard scenario="error-con-reintento" /> };

/** Hiring when the plan has no free seats: the popup explains it and offers an upgrade. */
export const ContratandoConLimiteDePlan: StoryObj = { render: () => <AgentsBoard scenario="limite-de-plan" /> };

// ── More proposals ──────────────────────────────────────────────────────────

/** B · The org chart is the page. Drag an agent onto another to change who manages it. */
export const VarianteB: StoryObj = { render: () => <AgentsBoard variant="b" /> };

/** C · Performance table: compare accuracy, time and cost per task, sortable. */
export const VarianteC: StoryObj = { render: () => <AgentsBoard variant="c" /> };

/** The three layouts one under the other, each with a sentence about what it prioritises. */
export const CompararVariantes: StoryObj = { render: () => <AgentsCompare /> };
