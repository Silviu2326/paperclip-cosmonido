import type { Meta, StoryObj } from "@storybook/react-vite";
import { TasksProposal, TasksVariants } from "../../../product-map/tasks/TasksProposal";
import { DEMO_TASKS } from "../../../product-map/tasks/demo-data";

const meta = {
  id: "product-map-tasks",
  title: "Overview/Mapa de producto/Tareas",
  component: TasksProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Tareas page (views, grouping, quick create, detail with conversation and result) with demo data, its extra states and two alternative designs; it does not render the production Issues page.",
      notes: "Data in storybook/product-map/tasks/demo-data.ts; same customers, agents and PAP-xxx tasks as the other proposals. `scenario` picks the state, `variant` the design.",
    },
  },
} satisfies Meta<typeof TasksProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Ten tasks. Switch views, regroup, create one from the top bar, reply or move a task along. */
export const Propuesta: Story = { args: { tasks: DEMO_TASKS } };

/** First visit: ask for the first task. */
export const Vacio: Story = { args: { tasks: [] } };

/** Phone width. */
export const Movil: Story = { args: { tasks: DEMO_TASKS }, globals: { viewport: { value: "mobile1", isRotated: false } } };

// ── Extra states ────────────────────────────────────────────────────────────

/** Skeleton with the shape of the list while the data loads. */
export const Cargando: Story = { args: { tasks: DEMO_TASKS, scenario: "loading" } };

/** The request failed: clear message and "Reintentar" (it goes to loading and then to the normal page). */
export const ErrorDeCarga: Story = { args: { tasks: DEMO_TASKS, scenario: "error" } };

/** About 190 tasks: groups collapse and each shows 8 with "Mostrar 20 más". */
export const MuchisimosDatos: Story = { args: { tasks: DEMO_TASKS, scenario: "many" } };

/** Very long titles and customers, other alphabets, emoji and an unbreakable URL. */
export const TextosLargos: Story = { args: { tasks: DEMO_TASKS, scenario: "long" } };

/** Observer role: everything is visible, nothing can be created or changed. */
export const SinPermisos: Story = { args: { tasks: DEMO_TASKS, scenario: "readonly" } };

/** A blocked task shows what it waits for. */
export const BloqueadaConDependencia: Story = { args: { tasks: DEMO_TASKS, scenario: "bloqueada-con-dependencia" } };

/** An agent asks for approval: checklist of what to verify before approving. */
export const ConRevision: Story = { args: { tasks: DEMO_TASKS, scenario: "con-revision" } };

/** An agent is working now: step, cost and a live log tail. */
export const EnEjecucion: Story = { args: { tasks: DEMO_TASKS, scenario: "en-ejecucion" } };

// ── Alternative designs ─────────────────────────────────────────────────────

/** B · Kanban: drag a card to another column to change its state. */
export const VarianteB: Story = { args: { tasks: DEMO_TASKS, variant: "b" } };

/** C · Command line: type to create in natural language (try «revisar el vídeo de Yoga mañana @leo urgente»), j/k to move. */
export const VarianteC: Story = { args: { tasks: DEMO_TASKS, variant: "c" } };

/** The three designs as tabs, each with one line on what it prioritises. */
export const CompararVariantes: Story = { args: { tasks: DEMO_TASKS }, render: (args) => <TasksVariants tasks={args.tasks} /> };
