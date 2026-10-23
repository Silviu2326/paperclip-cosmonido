/**
 * Proposed sidebar, as data. Each item is a page id from ./pages.ts; the
 * "Mapa de producto / Sidebar" stories draw it with the real sidebar parts.
 *
 * To try a change: reorder, move or delete ids here, or add a page to
 * PRODUCT_PAGES (status "proposed") and list it. Storybook reloads on save.
 * Starting point: the current streamlined sidebar ordered as in section 6A of
 * doc/plans/2026-10-22-revision-paginas-reducir-sin-empeorar.md.
 */
export interface SidebarProposalSection {
  label: string;
  /** Collapsed by default, like the current admin group. */
  collapsed?: boolean;
  items: string[];
}

/** Special item: the real agent list of the sidebar (starred and recent agents). */
export const AGENT_LIST_ITEM = "@agent-list";

export const SIDEBAR_PROPOSAL: SidebarProposalSection[] = [
  { label: "", items: ["home", "decisions"] },
  { label: "Trabajo", items: ["chat", "tasks", "projects", "files"] },
  { label: "Negocio", items: ["customers", "sales", "conversations"] },
  // The agent list brings its own "Agentes" heading.
  { label: "", items: [AGENT_LIST_ITEM] },
  { label: "Administración", collapsed: true, items: ["apps", "activity", "settings"] },
];
