import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppsPage, AppsVariantCompare } from "../../../product-map/apps/AppsPage";

const meta = {
  id: "product-map-apps",
  title: "Overview/Mapa de producto/Apps",
  component: AppsPage,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Apps catalog (states, stepped connect dialog, per-agent permissions, contextual channels), its states and two alternative layouts, with demo data; it does not render the production Apps pages.",
      notes: "Data in storybook/product-map/apps/demo-data.ts and scenarios.ts, shaped like ToolConnection. Variants: A catalog, B by goals, C health.",
    },
  },
} satisfies Meta<typeof AppsPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Catalog with connected, attention and available apps. Connect one, open a connection and change per-agent permissions. */
export const Propuesta: Story = { args: { variant: "a", scenario: "normal" } };

/** Nothing connected yet: the first screen. */
export const SinConexiones: Story = { args: { variant: "a", scenario: "sin-conexiones" } };

/** Phone width. */
export const Movil: Story = { args: { variant: "a", scenario: "normal" }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** Skeletons shaped like the page while the connections load. */
export const Cargando: Story = { args: { variant: "a", scenario: "cargando" } };

/** The list could not be loaded: clear reason and a retry that works. */
export const ErrorDeCarga: Story = { args: { variant: "a", scenario: "error" } };

/** A catalog of about 90 apps: "Mostrar más" instead of an endless wall of cards. */
export const Muchisimas: Story = { args: { variant: "a", scenario: "muchisimos" } };

/** Very long names and accounts, Arabic and Japanese names, emoji. */
export const TextosLargos: Story = { args: { variant: "a", scenario: "textos-largos" } };

/** Read-only member: sees the state, asks an administrator to connect or change. */
export const SinPermisos: Story = { args: { variant: "a", scenario: "sin-permisos" } };

/** Three connections that stopped working (revoked sign-in). */
export const ConexionCaducada: Story = { args: { variant: "a", scenario: "conexion-caducada" } };

/** Connections still in use whose last health check failed (timeout, 502). */
export const ErrorEnLaComprobacion: Story = { args: { variant: "a", scenario: "error-comprobacion" } };

/** Connection requests waiting for an administrator. */
export const AprobacionPendiente: Story = { args: { variant: "a", scenario: "aprobacion-pendiente" } };

/** 5 of 5 connections of the plan used: "Mejorar plan" instead of "Conectar". */
export const LimiteDelPlan: Story = { args: { variant: "a", scenario: "limite-plan" } };

/** Variant B: pick a goal and the page lists the apps to connect. */
export const VarianteB: Story = { args: { variant: "b", scenario: "normal" } };

/** Variant C: health of every connection at a glance. */
export const VarianteC: Story = { args: { variant: "c", scenario: "conexion-caducada" } };

/** The three variants behind tabs, each saying what it prioritises. */
export const CompararVariantes: StoryObj<typeof AppsVariantCompare> = { render: () => <AppsVariantCompare /> };
