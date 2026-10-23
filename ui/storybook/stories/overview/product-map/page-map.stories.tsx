import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SIDEBAR_PROPOSAL } from "../../../product-map/sidebar-proposal";
import {
  PRODUCT_PAGES,
  PRODUCTION_URL,
  type PageSection,
  type PageStatus,
  type ProductPage,
} from "../../../product-map/pages";

const STATUS_LABEL: Record<PageStatus, string> = { live: "En producción", retired: "Retirada", proposed: "Propuesta" };
const STATUS_VARIANT: Record<PageStatus, "secondary" | "outline" | "default"> = { live: "secondary", retired: "outline", proposed: "default" };
const REACH_LABEL: Record<ProductPage["reach"], string> = {
  sidebar: "Sidebar",
  contextual: "Desde otra página",
  flag: "Con flag",
  public: "Pública",
};

const inProposal = new Set(SIDEBAR_PROPOSAL.flatMap((section) => section.items));

function PageMap() {
  const [status, setStatus] = useState<PageStatus | "all">("all");
  const [query, setQuery] = useState("");
  const pages = useMemo(() => PRODUCT_PAGES.filter((page) =>
    (status === "all" || page.status === status)
    && (!query || `${page.name} ${page.route} ${page.note}`.toLowerCase().includes(query.toLowerCase()))), [status, query]);
  const sections = [...new Set(pages.map((page) => page.section))] as PageSection[];
  const count = (value: PageStatus) => PRODUCT_PAGES.filter((page) => page.status === value).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Mapa de páginas</h1>
        <p className="text-sm text-muted-foreground">
          Todas las páginas del producto. Se edita en <code>storybook/product-map/pages.ts</code>; «En la propuesta» indica si
          está en la sidebar propuesta. «Abrir» lleva a la página real en producción.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "live", "retired", "proposed"] as const).map((value) => (
            <Button key={value} size="sm" variant={status === value ? "secondary" : "outline"} onClick={() => setStatus(value)}>
              {value === "all" ? `Todas (${PRODUCT_PAGES.length})` : `${STATUS_LABEL[value]} (${count(value)})`}
            </Button>
          ))}
          <input
            className="h-8 min-w-48 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            placeholder="Buscar página, ruta o nota"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </header>
      {sections.map((section) => (
        <section key={section} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{section}</h2>
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            {pages.filter((page) => page.section === section).map((page) => (
              <div key={page.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{page.name}</span>
                    <Badge variant={STATUS_VARIANT[page.status]}>{STATUS_LABEL[page.status]}</Badge>
                    <Badge variant="outline">{REACH_LABEL[page.reach]}</Badge>
                    {inProposal.has(page.id) ? <Badge variant="outline">En la propuesta</Badge> : null}
                  </div>
                  <code className="text-xs text-muted-foreground">{page.route}</code>
                  <p className="text-sm text-muted-foreground">{page.note}</p>
                </div>
                {page.status !== "proposed" && !page.route.includes(":") ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={`${PRODUCTION_URL}${page.route}`} target="_blank" rel="noreferrer">Abrir</a>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const meta = {
  id: "product-map-pages",
  title: "Overview/Mapa de producto/Páginas",
  component: PageMap,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: lists every board page from storybook/product-map/pages.ts; it renders no product capability.",
      notes: "Edit pages.ts to add, retire or propose pages; links open production.",
    },
  },
} satisfies Meta<typeof PageMap>;

export default meta;

export const Todas: StoryObj<typeof meta> = {};
