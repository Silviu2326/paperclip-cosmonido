// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { autopilotConfigSchema, initialAutopilotState, type Project, type ProjectAutopilot } from "@paperclipai/shared";
import { ProjectAutopilotPanel } from "./ProjectAutopilotPanel";

const api = vi.hoisted(() => ({ get: vi.fn(), configure: vi.fn(), discover: vi.fn(), select: vi.fn(), feedback: vi.fn() }));
vi.mock("../api/autopilot", () => ({ autopilotApi: api }));
vi.mock("../api/agents", () => ({ agentsApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock("../api/projects", () => ({ projectsApi: { createWorkspace: vi.fn() } }));
vi.mock("@/lib/router", () => ({ Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a> }));

const project = { id: "e69dc476-afac-4567-ad6e-04904f0c990b", companyId: "company", name: "Smart Dental", description: "Dental software", workspaces: [], leadAgentId: null } as unknown as Project;
const config = autopilotConfigSchema.parse({ objective: "Improve the simulator", plannerAgentId: "46fc865a-2229-4110-ae6d-28d097e20713", builderAgentId: "46fc865a-2229-4110-ae6d-28d097e20713", reviewerAgentId: "0bbd4614-bde3-4200-8056-1f155c38eff1" });
const fixture = (): ProjectAutopilot => ({ projectId: project.id, companyId: project.companyId, enabled: true, config, revision: 1,
  state: { ...initialAutopilotState(), status: "awaiting_selection", recommendedPlanId: "balanced", plans: (["essential", "balanced", "ambitious"] as const).map(id => ({ id, title: `Plan ${id}`, problem: "No image comparison", benefit: "Explain results faster", evidence: ["Observed simulator"], assumptions: ["Needs user feedback"], effort: "Small", risk: "low", steps: ["Add comparison"], acceptanceCriteria: ["Slider works"], workspaceIds: [project.id] })) },
  nextTickAt: "2030-01-01T00:00:00Z", updatedAt: "2030-01-01T00:00:00Z" });

describe("project autonomy interface", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  afterEach(async () => { if (root) await act(async () => root!.unmount()); host?.remove(); vi.clearAllMocks(); });
  async function render(row: ProjectAutopilot | null) {
    api.get.mockResolvedValue(row);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await act(async () => { root!.render(<QueryClientProvider client={client}><ProjectAutopilotPanel project={project} /></QueryClientProvider>); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  }
  it("shows benefits and submits the selected plan through the real mutation handler", async () => {
    await render(fixture());
    expect(host!.textContent).toContain("Qué podrías ganar");
    const choices = [...host!.querySelectorAll("button")].filter(button => button.textContent === "Elegir este plan");
    expect(choices).toHaveLength(3);
    api.select.mockResolvedValue(fixture());
    await act(async () => { choices[1]!.click(); });
    expect(api.select).toHaveBeenCalledWith(project.id, "balanced");
  });
  it("keeps plans visible but prevents starting another discovery while a task is running", async () => {
    const row = fixture(); row.state.activeIssueId = "current-task"; row.state.status = "implementing";
    await render(row);
    const discovery = [...host!.querySelectorAll("button")].find(button => button.textContent?.includes("Preparar tres planes"));
    expect(discovery?.disabled).toBe(true);
    expect(host!.querySelector('a[href="/issues/current-task"]')).not.toBeNull();
    expect(host!.textContent).toContain("Construyendo la mejora");
  });
  it("explains pausing admissions without pretending the current task was stopped", async () => {
    const row = fixture(); row.enabled = false; row.config.enabled = false; row.state.activeIssueId = "current-task";
    await render(row);
    expect(host!.textContent).toContain("La tarea actual puede terminar");
    expect(host!.textContent).toContain("Autonomía en pausa");
  });
});
