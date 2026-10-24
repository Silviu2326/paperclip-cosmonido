import type { Meta, StoryObj } from "@storybook/react-vite";
import { DEMO_FILES } from "../../../product-map/files/demo-data";
import { FilesProposal } from "../../../product-map/files/FilesProposal";

const meta = {
  id: "product-map-files",
  title: "Overview/Mapa de producto/Archivos",
  component: FilesProposal,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Archivos explorer (Entrada/Salida tree, grid or list, drag-and-drop upload, agent context and versions) with demo data; it does not render the production ArtifactsExplorer.",
      notes: "Data in storybook/product-map/files/demo-data.ts, shaped like CompanyFile.",
    },
  },
} satisfies Meta<typeof FilesProposal>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Browse folders, switch grid/list, open a file, edit its agent context and see versions. Drop files anywhere to upload. */
export const Propuesta: Story = { args: { files: DEMO_FILES } };

/** First visit: what to upload first. */
export const Vacio: Story = { args: { files: [] } };

/** Phone width. */
export const Movil: Story = { args: { files: DEMO_FILES }, globals: { viewport: { value: "mobile1", isRotated: false } } };
