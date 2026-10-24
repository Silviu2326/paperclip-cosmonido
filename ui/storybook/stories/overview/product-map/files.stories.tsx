import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilesPage, FilesVariantCompare } from "../../../product-map/files/FilesPage";

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
      exception: "Product decision tool: a proposed Archivos explorer (Entrada/Salida tree, grid or list, drag-and-drop upload, agent context and versions), its states and two alternative layouts, with demo data; it does not render the production ArtifactsExplorer.",
      notes: "Data in storybook/product-map/files/demo-data.ts and scenarios.ts, shaped like CompanyFile. Variants: A explorer, B gallery, C by customers and projects.",
    },
  },
} satisfies Meta<typeof FilesPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Browse folders, switch grid/list, open a file, edit its agent context and see versions. Drop files anywhere to upload. */
export const Propuesta: Story = { args: { variant: "a", scenario: "normal" } };

/** First visit: what to upload first. */
export const Vacio: Story = { args: { variant: "a", scenario: "vacio" } };

/** Phone width. */
export const Movil: Story = { args: { variant: "a", scenario: "normal" }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** Skeletons shaped like the page while the files load. */
export const Cargando: Story = { args: { variant: "a", scenario: "cargando" } };

/** The list could not be loaded: clear reason and a retry that works. */
export const ErrorDeCarga: Story = { args: { variant: "a", scenario: "error" } };

/** About 180 files: pagination ("Mostrar más") instead of an endless grid. */
export const Muchisimos: Story = { args: { variant: "a", scenario: "muchisimos" } };

/** Very long names, accents, emoji, Arabic and Japanese, and a very long folder name. */
export const TextosLargos: Story = { args: { variant: "a", scenario: "textos-largos" } };

/** Read-only member: no upload, no context editing, folders that are not shared. */
export const SinPermisos: Story = { args: { variant: "a", scenario: "sin-permisos" } };

/** Several uploads with progress bars and a queue. */
export const SubidaEnCurso: Story = { args: { variant: "a", scenario: "subiendo" } };

/** One upload cut off and one rejected, each with a reason and a retry. */
export const SubidaFallida: Story = { args: { variant: "a", scenario: "subida-fallida" } };

/** Expired context files: the agents stopped reading them; renew or remove the expiry. */
export const Caducado: Story = { args: { variant: "a", scenario: "caducado" } };

/** Files of a private project the user is not a member of. */
export const NoAutorizado: Story = { args: { variant: "a", scenario: "no-autorizado" } };

/** 94 % of the storage used: warning, meter and "Liberar espacio". */
export const CuotaLlena: Story = { args: { variant: "a", scenario: "cuota-llena" } };

/** Variant B: gallery. The preview is the page; arrows or keyboard to move on. */
export const VarianteB: Story = { args: { variant: "b", scenario: "normal" } };

/** Variant C: files grouped by customer, project or company. */
export const VarianteC: Story = { args: { variant: "c", scenario: "normal" } };

/** The three variants side by side behind tabs, each saying what it prioritises. */
export const CompararVariantes: StoryObj<typeof FilesVariantCompare> = { render: () => <FilesVariantCompare /> };
