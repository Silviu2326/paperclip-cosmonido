// @vitest-environment jsdom

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingWizardVariant } from "./OnboardingWizardVariant";

const dialog = vi.hoisted(() => ({ onboardingOpen: true }));
vi.mock("../context/DialogContext", () => ({ useDialogState: () => dialog }));

const mockInstanceSettingsApi = vi.hoisted(() => ({
  getExperimental: vi.fn(),
}));

vi.mock("@/api/instanceSettings", () => ({
  instanceSettingsApi: mockInstanceSettingsApi,
}));

vi.mock("./OnboardingWizard", () => ({
  OnboardingWizard: () => <div data-testid="wizard-capsule" />,
}));

describe("OnboardingWizardVariant (PAP-138)", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  function renderVariant() {
    root ??= createRoot(container);
    flushSync(() => {
      root!.render(<OnboardingWizardVariant />);
    });
  }

  beforeEach(() => {
    dialog.onboardingOpen = true;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    flushSync(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the capsule wizard without reading the chat flag", async () => {
    mockInstanceSettingsApi.getExperimental.mockResolvedValue({});
    renderVariant();

    await vi.waitFor(() => expect(container.querySelector('[data-testid="wizard-capsule"]')).not.toBeNull());
    expect(mockInstanceSettingsApi.getExperimental).not.toHaveBeenCalled();
  });
  it("keeps the closed wizard out of the initial render", () => {
    dialog.onboardingOpen = false;
    renderVariant();
    expect(container.childElementCount).toBe(0);
    expect(mockInstanceSettingsApi.getExperimental).not.toHaveBeenCalled();
  });

  it("preserves the mounted wizard after first use when it is closed", async () => {
    renderVariant();
    await vi.waitFor(() => expect(container.querySelector('[data-testid="wizard-capsule"]')).not.toBeNull());
    const wizard = container.querySelector('[data-testid="wizard-capsule"]');
    dialog.onboardingOpen = false;
    renderVariant();
    expect(container.querySelector('[data-testid="wizard-capsule"]')).toBe(wizard);
  });
});
