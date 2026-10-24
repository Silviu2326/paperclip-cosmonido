import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectsProposal } from "../../../product-map/projects/ProjectsProposal";
import { DEMO_PROJECTS } from "../../../product-map/projects/demo-data";

const meta = {
  id: "product-map-projects",
  title: "Overview/Mapa de producto/Proyectos",
  component: ProjectsProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Proyectos page (cards with progress, detail with tasks by state) with demo data; it does not render the production Projects page.",
      notes: "Data comes from storybook/product-map/tasks/demo-data.ts so projects, tasks and customers match the other proposals.",
    },
  },
} satisfies Meta<typeof ProjectsProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Six projects. Open one to see its tasks by state. */
export const Propuesta: Story = { args: { projects: DEMO_PROJECTS } };

/** First visit: projects are optional. */
export const Vacio: Story = { args: { projects: [] } };

/** Phone width. */
export const Movil: Story = { args: { projects: DEMO_PROJECTS }, globals: { viewport: { value: "mobile1", isRotated: false } } };
