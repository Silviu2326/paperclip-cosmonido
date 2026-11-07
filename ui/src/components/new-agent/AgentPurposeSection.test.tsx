// @vitest-environment jsdom

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_AGENT_CAPABILITIES_ENABLED, AGENT_SPECIALTY_PRESETS, defaultAgentWorkPermissions } from "@paperclipai/shared";
import { i18n } from "../../i18n";
import { DEFAULT_LOCALE } from "../../i18n/locales";
import {
  AgentPurposeSection,
  EMPTY_AGENT_PURPOSE,
  agentPurposeHireFields,
  type AgentPurposeValue,
} from "./AgentPurposeSection";

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; children: ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Holds the value like NewAgentSetup does, and exposes it for assertions. */
let latest: AgentPurposeValue = EMPTY_AGENT_PURPOSE;
function Harness() {
  const [value, setValue] = useState<AgentPurposeValue>(EMPTY_AGENT_PURPOSE);
  latest = value;
  return <AgentPurposeSection value={value} onChange={setValue} />;
}

describe("AgentPurposeSection", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  function render(node: ReactNode) {
    flushSync(() => root.render(node));
  }
  function card(specialty: string): HTMLButtonElement {
    return container.querySelector(`[data-testid="agent-purpose-card-${specialty}"]`) as HTMLButtonElement;
  }
  function toggle(key: string): HTMLButtonElement | null {
    return container.querySelector(`[data-testid="agent-capability-${key}"]`) as HTMLButtonElement | null;
  }
  function click(element: HTMLElement | null) {
    flushSync(() => element?.click());
  }

  beforeEach(async () => {
    await i18n.changeLanguage("es");
    latest = EMPTY_AGENT_PURPOSE;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    flushSync(() => root.unmount());
    container.remove();
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });

  it("shows the six specialty cards and hides the switches until one is chosen", () => {
    render(<Harness />);
    const cards = container.querySelectorAll('[role="radio"]');
    expect(cards).toHaveLength(6);
    expect(container.textContent).toContain("¿Para qué sirve este agente?");
    expect(card("customer_care").textContent).toContain("Atención al cliente");
    expect(card("video_content").textContent).toContain("Vídeo y contenido");
    expect(toggle("messages")).toBeNull();
  });

  it("applies the preset of the chosen specialty to the switches, which stay editable", () => {
    render(<Harness />);
    click(card("sales"));
    expect(latest.specialty).toBe("sales");
    expect(latest.capabilities).toEqual(AGENT_SPECIALTY_PRESETS.sales.capabilities);
    expect(toggle("messages")?.getAttribute("aria-checked")).toBe("true");
    expect(toggle("calls")?.getAttribute("aria-checked")).toBe("true");
    expect(toggle("mediaEdit")).toBeNull();

    click(card("video_content"));
    expect(toggle("mediaEdit")?.getAttribute("aria-checked")).toBe("true");
    expect(toggle("messages")).toBeNull();

    click(card("software"));
    expect(toggle("code")).toBeNull();
    expect(container.querySelector('[data-testid="agent-work-permission-workspaceRead"]')).not.toBeNull();
    expect((container.querySelector('[data-testid="agent-work-permission-workspaceRead"]') as HTMLButtonElement).disabled).toBe(true);
    click(container.querySelector('[data-testid="agent-work-permission-tasksCreate"]'));
    expect(latest.workPermissions?.tasksCreate).toBe(false);
  });

  it.each([
    ["customer_care", ["messages", "calls"]],
    ["sales", ["messages", "calls"]],
    ["video_content", ["mediaAnalyze", "mediaEdit", "mediaCreateVideo"]],
    ["software", []],
    ["operations", []],
    ["custom", ["messages", "calls", "mediaAnalyze", "mediaEdit", "mediaCreateVideo"]],
  ])("shows only the available permissions for %s", (specialty, expected) => {
    render(<Harness />);
    click(card(specialty as string));
    const keys = [...container.querySelectorAll('[data-testid^="agent-capability-"]')].map((node) => node.getAttribute("data-testid")!.replace("agent-capability-", ""));
    expect(keys.sort()).toEqual([...expected].sort());
    expect(container.textContent).toContain("Permisos del agente");
  });

  it("clears incompatible permissions when switching categories", () => {
    render(<Harness />);
    click(card("sales"));
    click(card("software"));
    expect(latest.capabilities.messages).toBe(false);
    expect(latest.capabilities.calls).toBe(false);
    expect(latest.messageChannels).toEqual([]);
    expect(toggle("messages")).toBeNull();
  });

  it("shows the autonomy note with a link to Autonomía under the messaging and calls switches", () => {
    render(<Harness />);
    click(card("customer_care"));
    expect(container.textContent).toContain("Al principio solo prepara borradores.");
    const link = container.querySelector('a[href="/autonomy"]');
    expect(link).not.toBeNull();
  });

  it("sends nothing to the hire call while the section is untouched", () => {
    expect(latest.specialty).toBeNull();
    expect(agentPurposeHireFields(EMPTY_AGENT_PURPOSE)).toEqual({});
    expect(EMPTY_AGENT_PURPOSE.capabilities).toEqual(ALL_AGENT_CAPABILITIES_ENABLED);
  });

  it("sends capabilities and profile once a specialty is chosen", () => {
    render(<Harness />);
    click(card("operations"));
    expect(agentPurposeHireFields(latest)).toEqual({
      capabilities: AGENT_SPECIALTY_PRESETS.operations.capabilities,
      profile: { specialty: "operations", sectors: [], messageChannels: [], workPermissions: defaultAgentWorkPermissions("operations") },
    });
  });
});
