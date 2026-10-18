// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteUxLab } from "./InviteUxLab";

vi.mock("@/components/CompanyPatternIcon", () => ({
  CompanyPatternIcon: ({ companyName }: { companyName: string }) => (
    <div aria-label={`${companyName} logo`}>{companyName}</div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("InviteUxLab", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders the invite/signup review sections", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<InviteUxLab />);
    });

    expect(container.textContent).toContain("Superficie de revisión UX de invitaciones y registro");
    expect(container.textContent).toContain("/tests/ux/invites");
    expect(container.textContent).toContain("Cobertura de estados de la landing");
    expect(container.textContent).toContain("Flujos de invitación en dos paneles");
    expect(container.textContent).toContain("Pantallas de aprobación y finalización");
    expect(container.textContent).toContain("Estados de la página de autenticación");
    expect(container.textContent).toContain("Gestión de invitaciones de la organización");
    expect(container.textContent).toContain("Crea tu cuenta");
    expect(container.textContent).toContain("Historial de invitaciones");

    await act(async () => {
      root.unmount();
    });
  });
});
