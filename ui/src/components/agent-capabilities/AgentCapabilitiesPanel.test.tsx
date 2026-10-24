// @vitest-environment jsdom

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapabilitiesResponse } from "@paperclipai/shared";
import { ApiError } from "../../api/client";
import { i18n } from "../../i18n";
import { DEFAULT_LOCALE } from "../../i18n/locales";
import { AgentCapabilitiesPanel } from "./AgentCapabilitiesPanel";

const mockAgentsApi = vi.hoisted(() => ({
  capabilities: vi.fn(),
  updateCapabilities: vi.fn(),
}));

vi.mock("@/api/agents", () => ({ agentsApi: mockAgentsApi }));

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; children: ReactNode }) =>
    createElement("a", { href: to, ...props }, children),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const savedResponse: AgentCapabilitiesResponse = {
  profile: { specialty: "sales", sectors: ["retail"] },
  capabilities: { messages: true, calls: false, video: false, code: false },
  autonomy: { message: "draft_only", email: "send_with_approval", call: "send_direct" },
};

async function flush() {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
}

describe("AgentCapabilitiesPanel", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let queryClient: QueryClient;

  function render(node: ReactNode) {
    flushSync(() => root.render(createElement(QueryClientProvider, { client: queryClient }, node)));
  }
  function toggle(key: string): HTMLButtonElement | null {
    return container.querySelector(`[data-testid="agent-capability-${key}"]`) as HTMLButtonElement | null;
  }
  function buttonWithText(text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text)) as
      | HTMLButtonElement
      | undefined;
  }
  function click(element: HTMLElement | null | undefined) {
    flushSync(() => element?.click());
  }

  beforeEach(async () => {
    await i18n.changeLanguage("es");
    mockAgentsApi.capabilities.mockReset().mockResolvedValue(savedResponse);
    mockAgentsApi.updateCapabilities.mockReset();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    flushSync(() => root.unmount());
    container.remove();
    queryClient.clear();
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });

  it("loads the saved capabilities, the specialty and the read-only autonomy chips", async () => {
    render(<AgentCapabilitiesPanel agentId="agent-1" companyId="company-1" />);
    await flush();
    expect(mockAgentsApi.capabilities).toHaveBeenCalledWith("agent-1", "company-1");
    expect(toggle("messages")?.getAttribute("aria-checked")).toBe("true");
    expect(toggle("calls")?.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector('[data-testid="agent-purpose-card-sales"]')?.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[data-testid="agent-autonomy-message"]')?.textContent).toBe("Solo borrador");
    expect(container.querySelector('[data-testid="agent-autonomy-email"]')?.textContent).toBe("Con aprobación");
    expect(container.querySelector('[data-testid="agent-autonomy-call"]')?.textContent).toBe("Directo");
    expect(container.querySelector('a[href="/autonomy?agent=agent-1"]')).not.toBeNull();
  });

  it("keeps Save disabled until something changes, then saves the changed switches", async () => {
    mockAgentsApi.updateCapabilities.mockResolvedValue({ ...savedResponse, capabilities: { messages: true, calls: true, video: false, code: false } });
    render(<AgentCapabilitiesPanel agentId="agent-1" companyId="company-1" />);
    await flush();
    expect(buttonWithText("Guardar capacidades")?.disabled).toBe(true);

    click(toggle("calls"));
    expect(buttonWithText("Guardar capacidades")?.disabled).toBe(false);

    click(buttonWithText("Guardar capacidades"));
    await flush();
    expect(mockAgentsApi.updateCapabilities).toHaveBeenCalledWith(
      "agent-1",
      {
        capabilities: { messages: true, calls: true, video: false, code: false },
        profile: { specialty: "sales", sectors: ["retail"] },
      },
      "company-1",
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Capacidades guardadas.");
  });

  it("applies a specialty preset on edit and keeps the saved sectors", async () => {
    mockAgentsApi.updateCapabilities.mockResolvedValue(savedResponse);
    render(<AgentCapabilitiesPanel agentId="agent-1" companyId="company-1" />);
    await flush();
    click(container.querySelector('[data-testid="agent-purpose-card-software"]') as HTMLButtonElement);
    expect(toggle("code")?.getAttribute("aria-checked")).toBe("true");
    click(buttonWithText("Guardar capacidades"));
    await flush();
    expect(mockAgentsApi.updateCapabilities).toHaveBeenCalledWith(
      "agent-1",
      {
        capabilities: { messages: false, calls: false, video: false, code: true },
        profile: { specialty: "software", sectors: ["retail"] },
      },
      "company-1",
    );
  });

  it("is read-only for users without board access", async () => {
    render(<AgentCapabilitiesPanel agentId="agent-1" companyId="company-1" readOnly />);
    await flush();
    expect(toggle("messages")?.disabled).toBe(true);
    expect(buttonWithText("Guardar capacidades")).toBeUndefined();
    expect(container.textContent).toContain("Solo lectura");
  });

  it("switches to read-only with a clear message when the server answers 403", async () => {
    mockAgentsApi.updateCapabilities.mockRejectedValue(new ApiError("Forbidden", 403, null));
    render(<AgentCapabilitiesPanel agentId="agent-1" companyId="company-1" />);
    await flush();
    click(toggle("video"));
    click(buttonWithText("Guardar capacidades"));
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("No tienes permiso");
    expect(buttonWithText("Guardar capacidades")).toBeUndefined();
  });

  it("shows a retryable error when the capabilities cannot be loaded", async () => {
    mockAgentsApi.capabilities.mockRejectedValueOnce(new Error("boom"));
    render(<AgentCapabilitiesPanel agentId="agent-1" companyId="company-1" />);
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("No se pudieron cargar");
    click(buttonWithText("Reintentar"));
    await flush();
    expect(mockAgentsApi.capabilities).toHaveBeenCalledTimes(2);
    expect(toggle("messages")).not.toBeNull();
  });
});
