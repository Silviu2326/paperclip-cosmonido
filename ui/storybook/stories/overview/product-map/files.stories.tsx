import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilesPage } from "../../../product-map/files/FilesPage";

const meta = {
  id: "product-map-files",
  title: "Overview/Mapa de producto/Archivos",
  component: FilesPage,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Archivos file explorer (Entrada/Salida switch, address bar, folder tree, sortable details, what each agent did, agent context and versions) and its states, with demo data; it does not render the production ArtifactsExplorer.",
      notes: "Data in storybook/product-map/files/demo-data.ts and scenarios.ts, shaped like CompanyFile.",
    },
  },
} satisfies Meta<typeof FilesPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Switch Entrada/Salida, browse like a file explorer, sort, select several, right-click, and see what each agent did. */
export const Propuesta: Story = { args: { scenario: "normal" } };

/** First visit: what to upload first. */
export const Vacio: Story = { args: { scenario: "vacio" } };

/** Phone width. */
export const Movil: Story = { args: { scenario: "normal" }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** Skeletons shaped like the page while the files load. */
export const Cargando: Story = { args: { scenario: "cargando" } };

/** The list could not be loaded: clear reason and a retry that works. */
export const ErrorDeCarga: Story = { args: { scenario: "error" } };

/** About 180 files: pagination ("Mostrar más") instead of an endless grid. */
export const Muchisimos: Story = { args: { scenario: "muchisimos" } };

/** Very long names, accents, emoji, Arabic and Japanese, and a very long folder name. */
export const TextosLargos: Story = { args: { scenario: "textos-largos" } };

/** Read-only member: no upload, no context editing, folders that are not shared. */
export const SinPermisos: Story = { args: { scenario: "sin-permisos" } };

/** Several uploads with progress bars and a queue. */
export const SubidaEnCurso: Story = { args: { scenario: "subiendo" } };

/** One upload cut off and one rejected, each with a reason and a retry. */
export const SubidaFallida: Story = { args: { scenario: "subida-fallida" } };

/** Expired context files: the agents stopped reading them; renew or remove the expiry. */
export const Caducado: Story = { args: { scenario: "caducado" } };

/** Files of a private project the user is not a member of. */
export const NoAutorizado: Story = { args: { scenario: "no-autorizado" } };

/** 94 % of the storage used: warning, meter and "Liberar espacio". */
export const CuotaLlena: Story = { args: { scenario: "cuota-llena" } };
