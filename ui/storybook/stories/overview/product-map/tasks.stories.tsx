import type { Meta, StoryObj } from "@storybook/react-vite";
import { TasksProposal } from "../../../product-map/tasks/TasksProposal";
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
      exception: "Product decision tool: a proposed Tareas page (views, grouping, quick create, detail with conversation and result) with demo data; it does not render the production Issues page.",
      notes: "Data in storybook/product-map/tasks/demo-data.ts; same customers, agents and PAP-xxx tasks as the other proposals.",
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
