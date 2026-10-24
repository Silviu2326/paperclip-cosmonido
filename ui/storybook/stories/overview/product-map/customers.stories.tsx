import type { Meta, StoryObj } from "@storybook/react-vite";
import { CustomersPage } from "../../../product-map/customers/CustomersPage";
import { DEMO_CUSTOMERS } from "../../../product-map/customers/demo-data";

const meta = {
  id: "product-map-customers",
  title: "Overview/Mapa de producto/Clientes",
  component: CustomersPage,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed single Customers page (customers, people and services in one view) with demo data and its states (a table with row actions that leads to the customer's and the person's page); it does not render the production page.",
      notes: "Data in storybook/product-map/customers/demo-data.ts and scenario-data.ts; aggregates come from APIs that today live on separate pages.",
    },
  },
} satisfies Meta<typeof CustomersPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Customers as a table. A row (or its arrow) opens the customer's page; the buttons on the right write, create a task or a proposal without leaving the list. */
export const Propuesta: Story = { args: { customers: DEMO_CUSTOMERS } };

/** The customer's page: people, services, open proposals and work. Reached from the table. */
export const DetalleCliente: Story = { args: { customers: DEMO_CUSTOMERS, initialRoute: { page: "customer", id: "c1" } } };

/** The person's page: contact data, their customer and the rest of the people there. Reached from the People tab or from a customer's page. */
export const DetallePersona: Story = { args: { customers: DEMO_CUSTOMERS, initialRoute: { page: "person", id: "p1", customerId: "c1" } } };

/** First visit: what to do before there are customers. */
export const SinClientes: Story = { args: { customers: [] } };

/** Phone width. */
export const Movil: Story = {
  args: { customers: DEMO_CUSTOMERS },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

/** Loading: skeletons with the shape of the page. Stays until the story is changed. */
export const Cargando: Story = { args: { state: "cargando" } };

/** The list could not be loaded. "Reintentar" loads the data after a moment. */
export const ErrorDeCarga: Story = { args: { state: "error" } };

/** 180 customers: the list shows 25 and "Cargar más" reveals the next page. */
export const MuchisimosDatos: Story = { args: { state: "muchos" } };

/** Very long names, domains and tags, emoji, Arabic and Japanese text, one-letter and unbroken names. */
export const TextosLargos: Story = { args: { state: "textos-largos" } };

/** A member without billing access: no amounts, no create or import, read-only. */
export const SinPermisos: Story = { args: { state: "sin-permisos" } };

/** A search with no matches: how to get out of it, and a shortcut to create it. */
export const SinResultados: Story = { args: { state: "sin-resultados" } };

/** The "Archivados" filter: customers that left the active list and can be restored. */
export const Archivados: Story = { args: { state: "archivados" } };
