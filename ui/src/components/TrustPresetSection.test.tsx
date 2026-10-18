// @vitest-environment jsdom
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentPermissions } from "@paperclipai/shared";
import { TrustPresetSection } from "./TrustPresetSection";
import { TooltipProvider } from "@/components/ui/tooltip";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderSection(permissions: Partial<AgentPermissions>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  const onChange = vi.fn();
  const createdRoot = createRoot(container);
  root = createdRoot;
  flushSync(() => {
    createdRoot.render(
      <TooltipProvider>
        <TrustPresetSection
          permissions={permissions}
          onChange={onChange}
          companyId="company-1"
          projectCandidates={[{ id: "project-1", label: "Paperclip App" }]}
          issueCandidates={[{ id: "issue-1", label: "PAP-1 · Review PR" }]}
        />
      </TooltipProvider>,
    );
  });
  return { onChange, text: () => container?.textContent ?? "" };
}

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe("TrustPresetSection", () => {
  it("hides the CE boundary editor under Standard", () => {
    const view = renderSection({ canCreateAgents: false, trustPreset: "standard" });

    expect(view.text()).toContain("Preajuste de confianza");
    expect(view.text()).not.toContain("Tipo de límite");
    expect(view.text()).not.toContain("Obtén Paperclip EE.");
  });

  it("shows a selectable CE boundary editor for low-trust review", () => {
    const view = renderSection({
      canCreateAgents: false,
      trustPreset: "low_trust_review",
      authorizationPolicy: {
        trustPreset: "low_trust_review",
        trustBoundary: {
          mode: "low_trust_review",
          companyId: "company-1",
          projectIds: ["project-1"],
        },
      },
    });

    expect(view.text()).toContain("Contención activa");
    expect(view.text()).toContain("Tipo de límite");
    expect(view.text()).toContain("Paperclip App");
    expect(view.text()).toContain("Obtén Paperclip EE.");
    expect(view.text()).not.toContain("Gestionado por EE/API");
  });

  it("renders multi-boundary policies as read-only", () => {
    const view = renderSection({
      canCreateAgents: false,
      trustPreset: "low_trust_review",
      authorizationPolicy: {
        trustPreset: "low_trust_review",
        trustBoundary: {
          mode: "low_trust_review",
          companyId: "company-1",
          projectIds: ["project-1", "project-2"],
        },
      },
    });

    expect(view.text()).toContain("Gestionado por EE/API");
    expect(view.text()).toContain("2 boundaries");
    expect(view.text()).not.toContain("Quitar límite");
  });
});
