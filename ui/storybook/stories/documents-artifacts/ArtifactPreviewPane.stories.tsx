import type { Meta, StoryObj } from "@storybook/react-vite";
import * as XLSX from "xlsx";
import { ArtifactPreviewPane } from "@/components/artifacts/explorer/ArtifactPreviewPane";
import type { PreviewTarget } from "@/components/artifacts/explorer/preview-target";

function blobUrl(content: BlobPart, type: string) {
  return URL.createObjectURL(new Blob([content], { type }));
}

const svgLogo = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#183f35"/><text x="160" y="100" font-size="28" text-anchor="middle" fill="#faf8f3" font-family="sans-serif">LOGO</text></svg>`;
const pdfSource = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF";
const sheetBytes = (() => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Concepto", "Ud.", "Precio"],
    ["Consultoría", "h", 95],
    ["Diseño", "h", 80],
    ["Hosting", "mes", 60],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Tarifas");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
})();

const base = {
  box: "in" as const,
  byteSize: 2048,
  updatedAt: "2026-10-20T10:00:00.000Z",
  meta: [
    { label: "Carpeta", value: "Marca" },
    { label: "Visible para", value: "toda la empresa" },
  ],
};

const targets = {
  image: {
    ...base,
    id: "story-image",
    title: "logo.svg",
    contentType: "image/svg+xml",
    contentPath: blobUrl(svgLogo, "image/svg+xml"),
    downloadPath: null,
    byteSize: svgLogo.length,
  },
  video: {
    ...base,
    id: "story-video",
    title: "demo.mp4",
    contentType: "video/mp4",
    contentPath: null,
    downloadPath: null,
    byteSize: 3.4 * 1024 * 1024,
  },
  pdf: {
    ...base,
    id: "story-pdf",
    title: "contrato.pdf",
    contentType: "application/pdf",
    contentPath: blobUrl(pdfSource, "application/pdf"),
    downloadPath: null,
    byteSize: pdfSource.length,
  },
  markdown: {
    ...base,
    id: "story-markdown",
    title: "guia-de-estilo.md",
    contentType: "text/markdown",
    contentPath: blobUrl("# Guía de estilo\n\nUsa **tonos cálidos** y tipografía sans.\n\n- Logo principal\n- Paleta de cinco colores\n", "text/markdown"),
    downloadPath: null,
  },
  html: {
    ...base,
    id: "story-html",
    title: "informe.html",
    contentType: "text/html",
    contentPath: blobUrl("<h1>Informe</h1><p>Vista renderizada en iframe con sandbox.</p>", "text/html"),
    downloadPath: null,
  },
  csv: {
    ...base,
    id: "story-csv",
    title: "tarifas.csv",
    contentType: "text/csv",
    contentPath: blobUrl("Concepto,Ud.,Precio\nConsultoría,h,95\nDiseño,h,80\nHosting,mes,60\n", "text/csv"),
    downloadPath: null,
  },
  sheet: {
    ...base,
    id: "story-sheet",
    title: "tarifas.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    contentPath: blobUrl(sheetBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    downloadPath: null,
  },
  json: {
    ...base,
    id: "story-json",
    title: "config.json",
    contentType: "application/json",
    contentPath: blobUrl('{\n  "site": "landing",\n  "theme": "cosmonido",\n  "hero": { "image": "hero.png" }\n}', "application/json"),
    downloadPath: null,
  },
  text: {
    ...base,
    id: "story-text",
    title: "notas.txt",
    contentType: "text/plain",
    contentPath: blobUrl("Primera línea\nSegunda línea\nTercera línea", "text/plain"),
    downloadPath: null,
  },
  unsupported: {
    ...base,
    id: "story-unsupported",
    title: "paquete.zip",
    contentType: "application/zip",
    contentPath: null,
    downloadPath: "data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==",
  },
} satisfies Record<string, PreviewTarget>;

const meta: Meta<typeof ArtifactPreviewPane> = {
  id: "components-artifact-preview-pane",
  title: "Tasks and conversations/Documents, attachments, and work products/Components/Artifact Preview Pane",
  component: ArtifactPreviewPane,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: ["documents-artifacts/attachments"],
      implementation: "production",
      boundary: "fixtures",
      notes: "Generated blob fixtures only: no content route, no live PDF or XLSX file, and no action side effects.",
    },
  },
  args: {
    target: null,
    onClose: () => {},
    onOpenFullscreen: () => {},
    actions: [
      { id: "replace", label: "Reemplazar", onSelect: () => {} },
      { id: "copy", label: "Copiar enlace", onSelect: () => {} },
    ],
  },
  decorators: [(Story) => <div className="flex h-screen justify-end bg-background text-foreground"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof ArtifactPreviewPane>;

export const Empty: Story = {};
export const Image: Story = { args: { target: targets.image } };
export const Video: Story = { args: { target: targets.video } };
export const Pdf: Story = { args: { target: targets.pdf } };
export const Markdown: Story = { args: { target: targets.markdown } };
export const Html: Story = { args: { target: targets.html } };
export const Csv: Story = { args: { target: targets.csv } };
export const Sheet: Story = { args: { target: targets.sheet } };
export const Json: Story = { args: { target: targets.json } };
export const Text: Story = { args: { target: targets.text } };
export const Unsupported: Story = { args: { target: targets.unsupported } };
export const WithVersions: Story = {
  args: {
    target: {
      ...targets.image,
      id: "story-versions",
      versions: [
        { id: "v3", label: "v3", date: "12 sep", current: true },
        { id: "v2", label: "v2", date: "3 sep", current: false },
      ],
    },
  },
};
