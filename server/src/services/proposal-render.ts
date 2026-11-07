import type { ProposalScopeItem } from "@paperclipai/shared";

/** Sprint 3 WP8: pure markdown template for a proposal document. No I/O, no internal notes. */

export interface ProposalRenderInput {
  title: string;
  scope: ProposalScopeItem[];
  terms?: string | null;
  priceCents: number;
  depositCents?: number | null;
  currency: string;
  validUntil?: Date | string | null;
  revision: number;
}

function formatMoney(cents: number, currency: string) {
  return `${(cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Keeps user text inside a markdown table cell: no pipes, no line breaks. */
function cell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/\|/g, "\|").replace(/\r?\n/g, "<br>");
}

/** Keeps user text from starting markdown structures in paragraphs. */
function paragraph(value: string) {
  return value.replace(/\r\n/g, "\n").split("\n").map((line) => line.trimEnd()).join("\n").trim();
}

export function renderProposalMarkdown(proposal: ProposalRenderInput, companyName: string): string {
  const lines: string[] = [];
  lines.push(`# Propuesta: ${paragraph(proposal.title)}`);
  lines.push("");
  lines.push(`**Empresa:** ${paragraph(companyName)}  `);
  lines.push(`**Revisión:** ${proposal.revision}`);
  const validUntil = formatDate(proposal.validUntil);
  if (validUntil) lines.push(`  \n**Válida hasta:** ${validUntil}`);
  lines.push("");
  lines.push("## Alcance");
  lines.push("");
  lines.push("| # | Concepto | Descripción | Cantidad | Precio unitario |");
  lines.push("| --- | --- | --- | --- | --- |");
  proposal.scope.forEach((item, index) => {
    const unit = item.unitPriceCents === null || item.unitPriceCents === undefined
      ? null
      : formatMoney(item.unitPriceCents, proposal.currency);
    lines.push(`| ${index + 1} | ${cell(item.title)} | ${cell(item.description)} | ${cell(item.quantity)} | ${cell(unit)} |`);
  });
  lines.push("");
  lines.push("## Precio");
  lines.push("");
  lines.push(`**Precio total:** ${formatMoney(proposal.priceCents, proposal.currency)}`);
  if (proposal.depositCents && proposal.depositCents > 0) {
    lines.push("");
    lines.push(`**Señal para reservar:** ${formatMoney(proposal.depositCents, proposal.currency)}`);
  }
  if (proposal.terms && proposal.terms.trim()) {
    lines.push("");
    lines.push("## Condiciones");
    lines.push("");
    lines.push(paragraph(proposal.terms));
  }
  lines.push("");
  lines.push("## Aceptación");
  lines.push("");
  lines.push("Al aceptar esta propuesta, la persona firmante confirma el alcance, el precio y las condiciones indicados arriba.");
  lines.push("");
  lines.push("Nombre: ____________________________");
  lines.push("");
  lines.push("Correo: ____________________________");
  lines.push("");
  return lines.join("\n");
}
