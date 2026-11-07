import type { Meta, StoryObj } from "@storybook/react-vite";
import { DecisionsPage, DecisionsVariants } from "../../../product-map/decisions/DecisionsPage";
import { DEMO_DECISIONS } from "../../../product-map/decisions/demo-data";

const meta = {
  id: "product-map-decisions",
  title: "Overview/Mapa de producto/Decisiones",
  component: DecisionsPage,
  parameters: {
    layout: "fullscreen",
    paperclip: {
      capabilities: [],
      status: "proposed",
      implementation: "guide",
      boundary: "static",
      exception: "Product decision tool: a proposed Decisiones inbox (urgency groups, inline context and actions, undo) with demo data, its states and three design variants; it does not render the production WhatNeedsMe page.",
      notes: "Data in storybook/product-map/decisions/demo-data.ts and scenario-data.ts, shaped like AttentionItem.",
    },
  },
} satisfies Meta<typeof DecisionsPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Seven pending decisions. Approve, reject, answer or postpone them; "Deshacer" brings them back. */
export const Propuesta: Story = { args: { decisions: DEMO_DECISIONS } };

/** Nothing pending. */
export const TodoAlDia: Story = { args: { decisions: [] } };

/** Phone width. */
export const Movil: Story = { args: { decisions: DEMO_DECISIONS }, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** Loading: skeletons with the shape of the page. Stays until the story is changed. */
export const Cargando: Story = { args: { state: "cargando" } };

/** The decisions could not be loaded. "Reintentar" loads them after a moment. */
export const ErrorDeCarga: Story = { args: { state: "error" } };

/** 160 pending decisions: each group shows 10 and "Cargar más" reveals the next page. */
export const MuchisimasDecisiones: Story = { args: { state: "muchisimas" } };

/** Very long titles, reasons and customer names, emoji, Arabic and Japanese text, a URL and a stack trace. */
export const TextosLargos: Story = { args: { state: "textos-largos" } };

/** A member: can answer and review, but approve, reject, accept and budget buttons are disabled. */
export const SinPermisos: Story = { args: { state: "sin-permisos" } };

/** Only urgent decisions: the "Urgentes" filter preselected. */
export const SoloUrgentes: Story = { args: { state: "solo-urgentes" } };

/** Past deadlines: an "Vencidas" group on top, with how long ago they expired. */
export const ConVencidas: Story = { args: { state: "con-vencidas" } };

/** Variant B: mail-style inbox with a reading pane; J/K move, A acts, R rejects, S postpones, Z undoes. */
export const VarianteB: Story = { args: { variant: "b" } };

/** Variant C: one decision at a time; swipe the card or use the arrow keys. */
export const VarianteC: Story = { args: { variant: "c" } };

/** The three designs in tabs with a sentence about what each favours. */
export const CompararVariantes: Story = { render: () => <DecisionsVariants /> };

/** Variant B with 160 decisions. */
export const VarianteBMuchasDecisiones: Story = { args: { variant: "b", state: "muchisimas" } };

/** Variant B as a member: action buttons and shortcuts are disabled where they need an admin. */
export const VarianteBSinPermisos: Story = { args: { variant: "b", state: "sin-permisos" } };
