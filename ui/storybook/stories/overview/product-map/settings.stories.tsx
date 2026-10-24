import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantFrames } from "../../../product-map/activity/VariantFrames";
import { SettingsProposal } from "../../../product-map/settings/SettingsProposal";

const meta = {
  id: "product-map-settings",
  title: "Overview/Mapa de producto/Ajustes",
  component: SettingsProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed single Ajustes page grouped by who owns each setting (user, company, commercial account, instance) in three design variants and many states, with demo data; it does not render the production settings pages.",
      notes: "Data and scenarios in storybook/product-map/settings (demo-data.ts, scenarios.ts). Variant a: grouped navigation; b: one long page with search and inline editing; c: task assistant. Ownership follows doc/plans/2026-10-22-revision-paginas-reducir-sin-empeorar.md.",
    },
  },
} satisfies Meta<typeof SettingsProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/* ── Variante A: grupos por dueño del ajuste (la propuesta original) ─────────────────────── */

/** Variant A. All groups for an administrator. Change a setting to see the save bar; try the danger actions. */
export const Propuesta: Story = { args: { variant: "a", isAdmin: true, startGroup: "profile" } };

/** A member who is not an administrator: no instance group. */
export const Miembro: Story = { args: { variant: "a", isAdmin: false, startGroup: "profile" } };

/** Phone width: the group list becomes a scrollable row. */
export const Movil: Story = { args: { variant: "a", isAdmin: true, startGroup: "account" }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/* ── Más propuestas ─────────────────────────────────────────────────────────────────────────── */

/** Variant B. One long page: index on the left, a search that filters every setting and inline editing that saves on the spot with undo. */
export const VarianteB: Story = { args: { variant: "b", isAdmin: true } };

/** Variant C. Task assistant: "¿Qué quieres hacer?" with a card per task; each opens a small form that does it directly. */
export const VarianteC: Story = { args: { variant: "c", isAdmin: true } };

/** Variant B on a phone. */
export const VarianteBMovil: Story = { args: { variant: "b", isAdmin: true }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** Variant C on a phone. */
export const VarianteCMovil: Story = { args: { variant: "c", isAdmin: true }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** The three variants stacked, each with the one thing it prioritises. */
export const CompararVariantes: Story = {
  render: () => (
    <VariantFrames
      frames={[
        { id: "A", title: "Grupos por dueño", summary: "Prioriza saber a quién afecta cada ajuste (tú, la empresa, la cuenta, la instalación) y guardar todo junto con una barra visible.", node: <SettingsProposal variant="a" isAdmin /> },
        { id: "B", title: "Una página larga", summary: "Prioriza encontrarlo y cambiarlo sin saltar de sitio: índice lateral, búsqueda que filtra cada ajuste y edición en línea que se guarda al instante, con deshacer.", node: <SettingsProposal variant="b" isAdmin /> },
        { id: "C", title: "Asistente por tareas", summary: "Prioriza el objetivo de quien llega con una idea («quiero invitar a alguien») sin que tenga que conocer la estructura: cada tarea abre un formulario mínimo que la hace.", node: <SettingsProposal variant="c" isAdmin /> },
      ]}
    />
  ),
};

/* ── Más estados ────────────────────────────────────────────────────────────────────────────── */

/** Skeletons while the settings load. */
export const Cargando: Story = { args: { variant: "a", scenario: "loading" } };

/** The settings could not be loaded: clear message and retry. */
export const ErrorDeCarga: Story = { args: { variant: "a", scenario: "error" } };

/** 120 members, 40 secrets, 12 API keys, 36 invoices and 25 sessions: lists show a few and load more. Open Empresa and Cuenta comercial. */
export const MuchisimosDatos: Story = { args: { variant: "a", scenario: "many", startGroup: "company" } };

/** The same volume in the long page: members, secrets and invoices stay folded until opened. */
export const MuchisimosDatosPaginaLarga: Story = { args: { variant: "b", scenario: "many" } };

/** Very long names, e-mails, plugin names and descriptions, emoji, CJK and right-to-left text must wrap or truncate, never overflow. */
export const TextosLargos: Story = { args: { variant: "a", scenario: "long-text", startGroup: "company" } };

/** Long text in the long page. */
export const TextosLargosPaginaLarga: Story = { args: { variant: "b", scenario: "long-text" } };

/** A guest cannot open the company, account or instance groups: lock icons and a request-access screen instead of a dead end. */
export const SinPermisos: Story = { args: { variant: "a", scenario: "no-permission" } };

/** Saving failed: fields marked, a red dot on each group with errors and "Ir al primer error". Press Guardar again to see it. */
export const ErrorAlGuardar: Story = { args: { variant: "a", scenario: "save-error" } };

/** The same errors in the long page, shown inline on the field that is wrong. */
export const ErrorAlGuardarPaginaLarga: Story = { args: { variant: "b", scenario: "save-error" } };

/** Leaving Ajustes with unsaved changes: the confirmation dialog is already open. */
export const CambiosSinGuardarAlSalir: Story = { args: { variant: "a", scenario: "unsaved-leave" } };

/** The instance administrator fixed four settings: they show locked, with who decided. */
export const BloqueadoPorAdministrador: Story = { args: { variant: "a", scenario: "locked-by-admin" } };

/** The same locks in the task assistant. */
export const BloqueadoPorAdministradorAsistente: Story = { args: { variant: "c", scenario: "locked-by-admin" } };

/** The session expired: a dialog that cannot be dismissed asks to sign in again and keeps the unsaved changes. */
export const SesionCaducada: Story = { args: { variant: "a", scenario: "session-expired" } };

/** Turning on two-step verification, step by step. In this demo the code is 123456. */
export const DosPasos: Story = { args: { variant: "a", scenario: "two-factor" } };
