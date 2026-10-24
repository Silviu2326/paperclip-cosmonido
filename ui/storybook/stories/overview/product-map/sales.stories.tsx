import type { Meta, StoryObj } from "@storybook/react-vite";
import { SalesProposal, SalesVariants } from "../../../product-map/sales/SalesProposal";
import { DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PROPOSALS } from "../../../product-map/sales/demo-data";

const meta = {
  id: "product-map-sales",
  title: "Overview/Mapa de producto/Ventas",
  component: SalesProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed single Ventas page (pipeline board, leads, proposals and lead forms together) with demo data, its extra states and two alternative designs; it does not render the production CRM pages.",
      notes: "Data in storybook/product-map/sales/demo-data.ts; customers and amounts match customers/demo-data.ts. `scenario` picks the state, `variant` the design.",
    },
  },
} satisfies Meta<typeof SalesProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

const full = { opportunities: DEMO_OPPORTUNITIES, leads: DEMO_LEADS, proposals: DEMO_PROPOSALS };

/** Forecast, pipeline board, leads to qualify (convert with or without an opportunity), proposals and forms. */
export const Propuesta: Story = { args: full };

/** No leads, opportunities or proposals yet. */
export const Vacio: Story = { args: { opportunities: [], leads: [], proposals: [] } };

/** Phone width: the board scrolls sideways. */
export const Movil: Story = { args: full, globals: { viewport: { value: "mobile1", isRotated: false } } };

// ── Extra states ────────────────────────────────────────────────────────────

/** Skeleton with the shape of the board and panels while the data loads. */
export const Cargando: Story = { args: { ...full, scenario: "loading" } };

/** The request failed: clear message and "Reintentar". */
export const ErrorDeCarga: Story = { args: { ...full, scenario: "error" } };

/** 127 opportunities, 84 leads and 28 proposals: each column and list shows a few and "Mostrar más". */
export const MuchisimosDatos: Story = { args: { ...full, scenario: "many" } };

/** Long names and titles, other alphabets, emoji, an unbreakable URL and a huge amount. */
export const TextosLargos: Story = { args: { ...full, scenario: "long" } };

/** Observer role: everything is visible, nothing can be moved, converted or created. */
export const SinPermisos: Story = { args: { ...full, scenario: "readonly" } };

/** The "Propuesta" column is empty while qualified opportunities wait: the page says so. */
export const EmbudoConEtapaVacia: Story = { args: { ...full, scenario: "etapa-vacia" } };

/** Opportunities stalled for 38 and 45 days escalate with "Reactivar" and "Cerrar como perdida". */
export const OportunidadParada: Story = { args: { ...full, scenario: "oportunidad-parada" } };

/** A new lead matches an existing customer: link it instead of creating a duplicate. */
export const LeadDuplicado: Story = { args: { ...full, scenario: "lead-duplicado" } };

// ── Alternative designs ─────────────────────────────────────────────────────

/** B · Table: every opportunity sortable, ordered by weighted forecast. */
export const VarianteB: Story = { args: { ...full, variant: "b" } };

/** C · "Hoy": the next sales actions by urgency, with Hecho and Posponer. */
export const VarianteC: Story = { args: { ...full, variant: "c" } };

/** The three designs as tabs, each with one line on what it prioritises. */
export const CompararVariantes: Story = { args: full, render: (args) => <SalesVariants opportunities={args.opportunities} leads={args.leads} proposals={args.proposals} /> };
