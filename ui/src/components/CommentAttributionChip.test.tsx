// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommentAttributionChip, commentAttributionTooltip } from "./CommentAttributionChip";

/** The chip uses the app's Radix tooltip, which requires an ancestor provider. */
function render(node: React.ReactNode) {
  return renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
}

describe("CommentAttributionChip", () => {
  it("renders 'for {user}' beside the author name", () => {
    const html = render(<CommentAttributionChip agentName="Fable" userName="Dotta" />);

    // Composes with the header's author name to read "Fable · para Dotta".
    expect(html).toContain("para Dotta");
    expect(html).toContain('data-testid="comment-attribution-chip"');
    expect(html).toContain('aria-label="Publicado en nombre de Dotta"');
  });

  it("does not repeat the agent name on the chip face", () => {
    const html = render(<CommentAttributionChip agentName="Fable" userName="Dotta" />);
    expect(html).not.toContain("Fable");
  });

  it("renders nothing without a responsible user", () => {
    const empty = render(null);
    expect(render(<CommentAttributionChip agentName="Fable" userName={null} />)).toBe(empty);
    expect(render(<CommentAttributionChip agentName="Fable" userName="   " />)).toBe(empty);
    expect(render(<CommentAttributionChip userName={undefined} />)).toBe(empty);
  });

  it("is keyboard focusable so the tooltip is not hover-only", () => {
    // Badge renders a span; without tabIndex a sighted keyboard user could never
    // open the explanation of whose authority the comment rode.
    expect(render(<CommentAttributionChip userName="Dotta" />)).toContain('tabindex="0"');
  });

  it("trims a padded user name", () => {
    expect(render(<CommentAttributionChip userName="  Dotta  " />)).toContain("para Dotta");
  });
});

describe("commentAttributionTooltip", () => {
  it("names both the agent and the user it acted for", () => {
    const copy = commentAttributionTooltip("Fable", "Dotta");
    expect(copy).toContain("Fable publicó esto en nombre de Dotta");
    expect(copy).toContain("no está asignado a esta tarea");
    expect(copy).toContain("nunca la supera");
  });

  it("keeps on-behalf-of terminology, never 'impersonate'", () => {
    expect(commentAttributionTooltip("Fable", "Dotta")).not.toContain("impersonat");
  });
});
