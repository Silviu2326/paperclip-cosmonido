import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomePage, HomeVariants } from "../../../product-map/home/HomePage";

const meta = {
  id: "product-map-home",
  title: "Overview/Mapa de producto/Inicio",
  component: HomePage,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Inicio (what needs you, team now, business results, today) with demo data, its states and three design variants; it does not render the production Dashboard.",
      notes: "Data in storybook/product-map/home/demo-data.ts and home-data.ts; reuses the customers and decisions demo data.",
    },
  },
} satisfies Meta<typeof HomePage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A normal working day. */
export const Propuesta: Story = { args: { state: "normal" } };

/** A brand-new company: first steps instead of empty charts. */
export const EmpresaNueva: Story = { args: { state: "nueva" } };

/** Phone width. */
export const Movil: Story = { args: { state: "normal" }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** Loading: skeletons with the shape of the page. Stays until the story is changed. */
export const Cargando: Story = { args: { state: "cargando" } };

/** Some sections did not load. "Reintentar" loads them after a moment. */
export const ErrorDeCarga: Story = { args: { state: "error" } };

/** 40 agents, 120 decisions, 150 events: lists show a few rows and "Cargar más" reveals the rest. */
export const MuchisimosDatos: Story = { args: { state: "muchos" } };

/** Very long names, roles, tasks and customer names; emoji, Arabic text and a stack trace. */
export const TextosLargos: Story = { args: { state: "textos-largos" } };

/** A member: sees the team, decisions and agenda; spend, income and business results are locked. */
export const SinPermisos: Story = { args: { state: "sin-permisos" } };

/** The month's budget is spent: the team is paused and the banner says how to fix it. */
export const PresupuestoAgotado: Story = { args: { state: "presupuesto-agotado" } };

/** An agent lost its connection: a banner explains what is blocked and offers the fix. */
export const AgenteCaido: Story = { args: { state: "agente-caido" } };

/** Agents hired but no customers, decisions or results yet: each section explains itself. */
export const ModoVacioParcial: Story = { args: { state: "parcial" } };

/** Variant B: executive; three big numbers and one list of what happens today. */
export const VarianteB: Story = { args: { variant: "b" } };

/** Variant C: the team as protagonist; a big card per agent. */
export const VarianteC: Story = { args: { variant: "c" } };

/** The three designs in tabs with a sentence about what each favours. */
export const CompararVariantes: Story = { render: () => <HomeVariants /> };

/** Variant C with 40 agents. */
export const VarianteCMuchosAgentes: Story = { args: { variant: "c", state: "muchos" } };

/** Variant B as a member: amounts locked. */
export const VarianteBSinPermisos: Story = { args: { variant: "b", state: "sin-permisos" } };
