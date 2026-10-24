import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActivityProposal } from "../../../product-map/activity/ActivityProposal";
import { VariantFrames } from "../../../product-map/activity/VariantFrames";

const meta = {
  id: "product-map-activity",
  title: "Overview/Mapa de producto/Actividad",
  component: ActivityProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed single Actividad page (feed, runs, costs, budgets and timeline) in three design variants and many states, with demo data; it does not render the production AuditHub or Costs pages.",
      notes: "Data and scenarios in storybook/product-map/activity (demo-data.ts, scenarios.ts). Variant a: tabs; b: control panel; c: audit log.",
    },
  },
} satisfies Meta<typeof ActivityProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/* ── Variante A: pestañas (la propuesta original) ───────────────────────────────────────────── */

/** Variant A. Five tabs in one page: Actividad, Ejecuciones, Costes, Presupuestos and Cronología. */
export const Propuesta: Story = { args: { variant: "a", scenario: "normal" } };

/** Phone width. */
export const Movil: Story = { args: { variant: "a", scenario: "normal" }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/* ── Más propuestas ─────────────────────────────────────────────────────────────────────────── */

/** Variant B. Control panel: figures with a trend, what needs attention and who is working; the long lists open on demand. */
export const VarianteB: Story = { args: { variant: "b", scenario: "normal" } };

/** Variant C. Audit log: one dense, filterable table with saved views, expandable rows, pagination and export. */
export const VarianteC: Story = { args: { variant: "c", scenario: "normal" } };

/** Variant B on a phone. */
export const VarianteBMovil: Story = { args: { variant: "b", scenario: "normal" }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** Variant C on a phone: the table becomes stacked rows. */
export const VarianteCMovil: Story = { args: { variant: "c", scenario: "normal" }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** The three variants stacked, each with the one thing it prioritises. */
export const CompararVariantes: Story = {
  render: () => (
    <VariantFrames
      frames={[
        { id: "A", title: "Pestañas", summary: "Prioriza que cada cosa (actividad, ejecuciones, costes, presupuestos, cronología) tenga su sitio y se llegue con un clic.", node: <ActivityProposal variant="a" scenario="normal" /> },
        { id: "B", title: "Panel de control", summary: "Prioriza responder «¿va todo bien?» de un vistazo: cifras con tendencia y lo que necesita atención; el detalle se abre solo si lo pides.", node: <ActivityProposal variant="b" scenario="normal" /> },
        { id: "C", title: "Registro de auditoría", summary: "Prioriza encontrar «quién hizo qué y cuándo»: una tabla densa con filtros, vistas guardadas, detalle por fila y exportación.", node: <ActivityProposal variant="c" scenario="normal" /> },
      ]}
    />
  ),
};

/* ── Más estados ────────────────────────────────────────────────────────────────────────────── */

/** A company where nothing has happened yet. */
export const Vacia: Story = { args: { variant: "a", scenario: "empty" } };

/** Skeletons while the data loads. */
export const Cargando: Story = { args: { variant: "a", scenario: "loading" } };

/** The request failed: clear message, retry and service status. */
export const ErrorDeCarga: Story = { args: { variant: "a", scenario: "error" } };

/** 180 events, 150 runs and a 12,000-row history: lists load by page. Open the Actividad tab and press "Mostrar 40 más". */
export const MuchisimosDatos: Story = { args: { variant: "a", scenario: "many" } };

/** The same huge history in the audit log: 25 rows per page. */
export const MuchisimosDatosAuditoria: Story = { args: { variant: "c", scenario: "many" } };

/** Very long names, URLs, emoji, CJK and right-to-left text must truncate or wrap, never overflow. */
export const TextosLargos: Story = { args: { variant: "a", scenario: "long-text" } };

/** Very long text in the audit table. */
export const TextosLargosAuditoria: Story = { args: { variant: "c", scenario: "long-text" } };

/** The user may not see the company's activity: offers to request access. */
export const SinPermisos: Story = { args: { variant: "a", scenario: "no-permission" } };

/** The monthly budget ran out: agents are paused, runs wait and a banner explains what to do. */
export const PresupuestoAgotado: Story = { args: { variant: "a", scenario: "budget-exhausted" } };

/** The control panel when the budget is exhausted. */
export const PresupuestoAgotadoPanel: Story = { args: { variant: "b", scenario: "budget-exhausted" } };

/** Fourteen runs failed in an hour: grouped by cause with a one-click retry. Open the Ejecuciones tab. */
export const PicoDeFallos: Story = { args: { variant: "a", scenario: "failure-spike" } };

/** The chosen date range has no data: explains why and offers a wider range. */
export const RangoSinDatos: Story = { args: { variant: "a", scenario: "no-data-range" } };

/** A CSV export is running with a progress bar; it can be cancelled and then downloaded. */
export const ExportacionEnCurso: Story = { args: { variant: "a", scenario: "exporting" } };
