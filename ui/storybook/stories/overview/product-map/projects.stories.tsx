import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectsProposal, ProjectsVariants } from "../../../product-map/projects/ProjectsProposal";
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
      exception: "Product decision tool: a proposed Proyectos page (cards with progress and budget, detail with tasks by state) with demo data, its extra states and two alternative designs; it does not render the production Projects page.",
      notes: "Data comes from storybook/product-map/tasks/demo-data.ts so projects, tasks and customers match the other proposals. `scenario` picks the state, `variant` the design.",
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

// ── Extra states ────────────────────────────────────────────────────────────

/** Skeleton with the shape of the cards while the data loads. */
export const Cargando: Story = { args: { projects: DEMO_PROJECTS, scenario: "loading" } };

/** The request failed: clear message and "Reintentar". */
export const ErrorDeCarga: Story = { args: { projects: DEMO_PROJECTS, scenario: "error" } };

/** About 70 projects: search, filters and "Mostrar 12 más". */
export const MuchisimosDatos: Story = { args: { projects: DEMO_PROJECTS, scenario: "many" } };

/** Very long names and customers, other alphabets, emoji and an unbreakable URL. */
export const TextosLargos: Story = { args: { projects: DEMO_PROJECTS, scenario: "long" } };

/** Observer role: everything is visible, nothing can be created, restored or changed. */
export const SinPermisos: Story = { args: { projects: DEMO_PROJECTS, scenario: "readonly" } };

/** Closed projects live under "Archivados" and can be restored. */
export const ProyectoArchivado: Story = { args: { projects: DEMO_PROJECTS, scenario: "archivado" } };

/** Projects created without a customer: a warning explains the consequence and each card offers "Asignar cliente". */
export const ProyectoSinCliente: Story = { args: { projects: DEMO_PROJECTS, scenario: "sin-cliente" } };

/** A project over budget: banner in the list and in the project, with the two decisions that matter. */
export const PresupuestoExcedido: Story = { args: { projects: DEMO_PROJECTS, scenario: "presupuesto-excedido" } };

// ── Alternative designs ─────────────────────────────────────────────────────

/** B · Timeline: one bar per project from start to target date, with progress, today and task due dates. */
export const VarianteB: Story = { args: { projects: DEMO_PROJECTS, variant: "b" } };

/** C · Table: sort by progress, cost or date; the densest view. */
export const VarianteC: Story = { args: { projects: DEMO_PROJECTS, variant: "c" } };

/** The three designs as tabs, each with one line on what it prioritises. */
export const CompararVariantes: Story = { args: { projects: DEMO_PROJECTS }, render: (args) => <ProjectsVariants projects={args.projects} /> };
