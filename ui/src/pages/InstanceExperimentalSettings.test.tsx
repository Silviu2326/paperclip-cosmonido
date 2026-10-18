// @vitest-environment jsdom

import { flushSync } from "react-dom";
import { MemoryRouter } from "react-router-dom";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { INSTANCE_FEATURE_KEYS } from "@paperclipai/shared";
import type {
  InstanceExperimentalSettings as InstanceExperimentalSettingsPayload,
  InstanceExperimentalSettingsWithManaged,
} from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstanceExperimentalSettings } from "./InstanceExperimentalSettings";
import { queryKeys } from "../lib/queryKeys";

const mockInstanceSettingsApi = vi.hoisted(() => ({
  getExperimental: vi.fn(),
  updateExperimental: vi.fn(),
}));

vi.mock("@/api/instanceSettings", () => ({
  instanceSettingsApi: mockInstanceSettingsApi,
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompany: { id: "butter", issuePrefix: "BUT" } }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

async function act(callback: () => void | Promise<void>) {
  let result: void | Promise<void> = undefined;
  flushSync(() => {
    result = callback();
  });
  await result;
}

async function flushReact() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  flushSync(() => {});
}

const CONFERENCE_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar el chat de sala de conferencias (experimental)"]';
const STREAMLINED_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar la interfaz simplificada (experimental)"]';
const TASK_WATCHDOGS_TOGGLE_SELECTOR =
  'button[aria-label="Toggle task watchdogs experimental setting"]';
const CLASSIC_TASK_INTERFACE_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar la interfaz clásica de tareas (experimental)"]';
const GOALS_SIDEBAR_LINK_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar el enlace de Objetivos en la barra lateral (experimental)"]';
const DECISIONS_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar las decisiones (experimental)"]';
const SERVER_INFO_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar la vista de depuración del servidor (experimental)"]';
const PAPERCLIP_DEVELOPER_MODE_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar el modo desarrollador de Paperclip (experimental)"]';
const BUILT_IN_AGENTS_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar los agentes integrados (experimental)"]';
const BETA_SKILLS_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar las habilidades beta (experimental)"]';
const SUMMARIES_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar los resúmenes (experimental)"]';
const STATUS_CARDS_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar las tarjetas de estado (experimental)"]';
const PAPERCLIP_RUNNER_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar Paperclip Runner (experimental)"]';

function defaultExperimentalSettings(): InstanceExperimentalSettingsPayload {
  return {
    enableEnvironments: false,
    enableNativeRunner: false,
    enableAiConnectionRouters: false,
    enableManagedSandboxOnly: false,
    enableIsolatedWorkspaces: false,
    enableIsolatedWorkspacesByDefault: false,
    enableStreamlinedLeftNavigation: true,
    enableStreamlinedUi: true,
    enableApps: true,
    enableMcpAggregators: true,
    enablePublicMcp: false,
    enableOpenAiDot: false,
    enableGrokBot: false,
    enableMuse: false,
    enableChatConnectors: false,
    enableGitHubReviewBots: false,
    enableMemoryConnectors: false,
    enablePipelines: false,
    enableCases: false,
    enableAgentChat: false,
    enableCombinedInboxTasks: false,
    enableConferenceRoomChat: false,
    enableClassicTaskInterface: false,
    enableIssuePlanDecompositions: false,
    enableExperimentalFileViewer: false,
    enableExternalObjects: false,
    enableBuiltInAgents: false,
    enableBetaSkills: false,
    enableSummaries: false,
    enableStatusCards: false,
    enableDecisions: false,
    enableFastResponses: false,
    enableGoalsSidebarLink: false,
    enableServerInfoDebugView: false,
    enablePaperclipDeveloperMode: false,
    enableSimplifiedEnglishInteractions: false,
    enableFirstTaskPlanProposal: false,
    enableSmokeLab: false,
    autoRestartDevServerWhenIdle: false,
    enableWorkspaceBranchReconcileForward: true,
    enableWorkspaceDirtyQuarantineRepair: true,
    enableOwnerInstanceAdmin: false,
    enableSandboxDuplexBridge: false,
    enableRunnerPreviewIngress: false,
    enableWorktreeRunExecution: false,
    worktreeRunExecutionActivatedAt: null,
    worktreeRunExecutionActivationInstanceId: null,
  };
}

const WORKTREE_RUN_EXECUTION_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar la ejecución de tareas en el worktree"]';

const ISOLATED_WORKSPACES_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar los espacios de trabajo aislados (experimental)"]';

const ISOLATED_WORKSPACES_BY_DEFAULT_TOGGLE_SELECTOR =
  'button[aria-label="Activar o desactivar los espacios aislados por defecto (experimental)"]';

function setWorktreeRuntimeMeta(enabled: boolean) {
  const name = "paperclip-worktree-enabled";
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (enabled) {
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", name);
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "true");
  } else if (meta) {
    meta.remove();
  }
}

function setWorktreeInstanceIdMeta(instanceId: string | null) {
  const name = "paperclip-instance-id";
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (instanceId) {
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", name);
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", instanceId);
  } else if (meta) {
    meta.remove();
  }
}

describe("InstanceExperimentalSettings — Conference Room Chat card (PAP-11233)", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let currentExperimentalSettings: InstanceExperimentalSettingsPayload;

  async function renderPage() {
    root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    flushSync(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/BUT/company/settings/instance/experimental"]}>
            <InstanceExperimentalSettings />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await flushReact();
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    currentExperimentalSettings = defaultExperimentalSettings();
    mockInstanceSettingsApi.getExperimental.mockImplementation(async () => ({
      ...currentExperimentalSettings,
    }));
    mockInstanceSettingsApi.updateExperimental.mockImplementation(async (patch) => {
      currentExperimentalSettings = { ...currentExperimentalSettings, ...patch };
      return { ...currentExperimentalSettings };
    });
  });

  afterEach(() => {
    flushSync(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    setWorktreeRuntimeMeta(false);
    setWorktreeInstanceIdMeta(null);
    vi.clearAllMocks();
  });

  it("renders a page-level warning about instability and lack of guarantees", async () => {
    await renderPage();

    const warning = [...container.querySelectorAll('[role="alert"]')].find((alert) =>
      alert.textContent?.includes("Las funciones experimentales pueden dejar de funcionar en cualquier momento."),
    );
    expect(warning?.textContent).toContain("Las funciones experimentales pueden dejar de funcionar en cualquier momento.");
    expect(warning?.textContent).toContain("no compatibility guarantees");
  });

  it("does not render an Apps experimental setting", async () => {
    await renderPage();

    expect(container.querySelector('button[aria-label="Toggle apps experimental setting"]')).toBeNull();
    expect(container.textContent).not.toContain("Show the Apps navigation");
  });

  it("defaults memory connectors off and persists an explicit toggle in both directions", async () => {
    await renderPage();
    const selector = 'button[aria-label="Activar o desactivar los conectores de memoria (experimental)"]';
    expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("Existing connections keep running.");
    for (const enabled of [true, false]) {
      await act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
      await flushReact();
      expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({ enableMemoryConnectors: enabled });
      expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe(String(enabled));
    }
  });

  it("defaults Combined Inbox + Task List off and persists an explicit toggle in both directions", async () => {
    await renderPage();
    const selector = 'button[aria-label="Activar o desactivar la bandeja combinada y la lista de tareas (experimental)"]';
    expect(container.textContent).toContain("Bandeja combinada + lista de tareas");
    expect(container.textContent).not.toContain("Agent Chat v2");
    expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe("false");
    for (const enabled of [true, false]) {
      await act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
      await flushReact();
      expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({ enableCombinedInboxTasks: enabled });
      expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe(String(enabled));
    }
  });

  it("does not offer a retired MCP aggregators toggle", async () => {
    await renderPage();
    expect(container.querySelector('button[aria-label="Toggle MCP aggregators experimental setting"]')).toBeNull();
    expect(container.textContent).not.toContain("MCP aggregators");
  });

  it("defaults assistant connections off and persists an explicit toggle in both directions", async () => {
    await renderPage();
    const selector = 'button[aria-label="Activar o desactivar las conexiones de asistentes (experimental)"]';
    expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("work already delegated continues");
    for (const enabled of [true, false]) {
      await act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
      await flushReact();
      expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({ enablePublicMcp: enabled });
      expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe(String(enabled));
      expect(Boolean(container.querySelector('a[href="/BUT/apps/assistant-connection"]'))).toBe(enabled);
    }
  });

  it("names Dot prerequisites and saves its opt-in independently in both directions", async () => {
    await renderPage();
    const selector = 'button[aria-label="Activar o desactivar OpenAI Dot (experimental)"]';
    expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("Requires Assistant connections (MCP) and an authenticated instance with a public HTTPS URL");
    for (const enabled of [true, false]) {
      await act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
      await flushReact();
      expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({ enableOpenAiDot: enabled });
      expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe(String(enabled));
    }
  });

  it("defaults chat connectors off and persists an explicit toggle in both directions", async () => {
    await renderPage();
    const selector = 'button[aria-label="Activar o desactivar los conectores de chat (experimental)"]';
    expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("Existing chat connections keep running");
    for (const enabled of [true, false]) {
      await act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
      await flushReact();
      expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({ enableChatConnectors: enabled });
      expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe(String(enabled));
      expect(currentExperimentalSettings.enableApps).toBe(true);
    }
  });

  it("toggles GitHub review bots without enabling chat connectors", async () => {
    await renderPage();
    const selector = 'button[aria-label="Activar o desactivar los bots de revisión de GitHub (experimental)"]';
    expect(container.querySelector(selector)?.getAttribute("aria-checked")).toBe("false");
    for (const enabled of [true, false]) {
      await act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
      await flushReact();
      expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({ enableGitHubReviewBots: enabled });
      expect(currentExperimentalSettings.enableChatConnectors).toBe(false);
    }
  });

  it("does not render the Conference Room Chat experimental setting for now", async () => {
    await renderPage();

    const headings = [...container.querySelectorAll("section h2")].map((h) => h.textContent);

    expect(headings).not.toContain("Pipelines");
    expect(container.querySelector('button[aria-label="Toggle pipelines experimental setting"]')).toBeNull();
    expect(headings).not.toContain("Chat de sala de conferencias");
    expect(container.querySelector(CONFERENCE_TOGGLE_SELECTOR)).toBeNull();
  });

  it("does not render the toggle even when the stored flag is currently enabled", async () => {
    currentExperimentalSettings = {
      ...currentExperimentalSettings,
      enableConferenceRoomChat: true,
    };
    await renderPage();

    const toggle = container.querySelector(CONFERENCE_TOGGLE_SELECTOR);
    expect(toggle).toBeNull();
    expect(mockInstanceSettingsApi.updateExperimental).not.toHaveBeenCalled();
  });

  it("renders and patches the Streamlined UI experimental toggle on and off", async () => {
    await renderPage();

    expect(container.textContent).toContain("Interfaz simplificada");
    expect(container.textContent).toContain(
      "Usa la barra lateral principal simplificada, la presentación compartida de Tareas y Bandeja, el diseño centrado en el detalle de la tarea y la navegación contextual entre Agentes, Rutinas, Habilidades y Ajustes.",
    );

    const toggle = container.querySelector<HTMLButtonElement>(STREAMLINED_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("true");

    await act(() => toggle?.click());
    await flushReact();
    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({
      enableStreamlinedUi: false,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(() => toggle?.click());
    await flushReact();
    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({
      enableStreamlinedUi: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("does not render a Task Watchdogs toggle because watchdogs are always enabled", async () => {
    await renderPage();

    expect(container.textContent).not.toContain("Task Watchdogs");
    expect(container.querySelector('button[aria-label="Toggle task watchdogs experimental setting"]')).toBeNull();
  });

  it("does not expose the retired Runner Preview Ingress setting separately", async () => {
    currentExperimentalSettings.enableRunnerPreviewIngress = true;
    await renderPage();

    expect(container.textContent).not.toContain("Runner Preview Ingress");
    expect(container.querySelector(
      'button[aria-label="Toggle runner preview ingress experimental setting"]',
    )).toBeNull();
  });

  it("keeps Paperclip Runner default-off and exposes an explicit opt-in", async () => {
    await renderPage();

    expect(container.textContent).toContain("Paperclip Runner");
    expect(container.textContent).toContain("Onboarding continues to use legacy adapters");
    const toggle = container.querySelector<HTMLButtonElement>(
      PAPERCLIP_RUNNER_TOGGLE_SELECTOR,
    );
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableNativeRunner: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("renders and patches the Classic Task Interface experimental toggle on and off", async () => {
    await renderPage();

    expect(container.textContent).toContain("Interfaz clásica de tareas");
    expect(container.textContent).toContain(
      "Restores the previous task detail page",
    );
    expect(container.textContent).toContain(
      "El cambio surte efecto de inmediato. No afecta a los datos de las tareas.",
    );

    const toggle = container.querySelector<HTMLButtonElement>(
      CLASSIC_TASK_INTERFACE_TOGGLE_SELECTOR,
    );
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableClassicTaskInterface: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");

    flushSync(() => {
      root?.unmount();
    });
    root = null;
    container.textContent = "";
    await renderPage();

    const enabledToggle = container.querySelector<HTMLButtonElement>(
      CLASSIC_TASK_INTERFACE_TOGGLE_SELECTOR,
    );
    expect(enabledToggle?.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      enabledToggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({
      enableClassicTaskInterface: false,
    });
  });

  it("renders and patches the Decisions experimental toggle", async () => {
    await renderPage();

    expect(container.textContent).toContain("Decisiones");
    expect(container.textContent).toContain(
      "Show the Decisions item in the main sidebar",
    );

    const toggle = container.querySelector<HTMLButtonElement>(DECISIONS_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableDecisions: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("renders and patches the fast responses experimental toggle", async () => {
    await renderPage();
    expect(container.textContent).toContain("Respuestas rápidas experimentales");
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Activar o desactivar las respuestas rápidas (experimental)"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    await act(async () => { toggle?.click(); });
    await flushReact();
    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({ enableFastResponses: true });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("renders and patches the Goals Sidebar Link experimental toggle", async () => {
    await renderPage();

    expect(container.textContent).toContain("Enlace de Objetivos en la barra lateral");
    expect(container.textContent).toContain(
      "Restaura el elemento Objetivos en la barra lateral principal mientras se evalúa esa superficie.",
    );

    const toggle = container.querySelector<HTMLButtonElement>(GOALS_SIDEBAR_LINK_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableGoalsSidebarLink: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("hides the isolated-workspaces-by-default toggle while isolated workspaces are off", async () => {
    await renderPage();

    expect(container.querySelector(ISOLATED_WORKSPACES_TOGGLE_SELECTOR)).not.toBeNull();
    expect(
      container.querySelector(ISOLATED_WORKSPACES_BY_DEFAULT_TOGGLE_SELECTOR),
    ).toBeNull();
    expect(container.textContent).not.toContain("Usar espacios de trabajo aislados por defecto");
  });

  it("keeps the dependent toggle hidden even when its stored flag is already on", async () => {
    // The operator default is inert without isolated workspaces, so the server
    // ignores a stored `true`. The control must not imply otherwise.
    currentExperimentalSettings = {
      ...currentExperimentalSettings,
      enableIsolatedWorkspaces: false,
      enableIsolatedWorkspacesByDefault: true,
    };
    await renderPage();

    expect(
      container.querySelector(ISOLATED_WORKSPACES_BY_DEFAULT_TOGGLE_SELECTOR),
    ).toBeNull();
    expect(mockInstanceSettingsApi.updateExperimental).not.toHaveBeenCalled();
  });

  it("renders and patches the isolated-workspaces-by-default toggle on and off", async () => {
    currentExperimentalSettings = {
      ...currentExperimentalSettings,
      enableIsolatedWorkspaces: true,
    };
    await renderPage();

    expect(container.textContent).toContain("Usar espacios de trabajo aislados por defecto");
    expect(container.textContent).toContain("per-task worktree");

    const toggle = container.querySelector<HTMLButtonElement>(
      ISOLATED_WORKSPACES_BY_DEFAULT_TOGGLE_SELECTOR,
    );
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableIsolatedWorkspacesByDefault: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenLastCalledWith({
      enableIsolatedWorkspacesByDefault: false,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
  });

  it("reflects a stored isolated-workspaces-by-default value as checked", async () => {
    currentExperimentalSettings = {
      ...currentExperimentalSettings,
      enableIsolatedWorkspaces: true,
      enableIsolatedWorkspacesByDefault: true,
    };
    await renderPage();

    const toggle = container.querySelector<HTMLButtonElement>(
      ISOLATED_WORKSPACES_BY_DEFAULT_TOGGLE_SELECTOR,
    );
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("hides the worktree run-execution toggle when not running in a worktree", async () => {
    setWorktreeRuntimeMeta(false);
    await renderPage();

    const headings = [...container.querySelectorAll("section h2")].map((h) => h.textContent);
    expect(headings).not.toContain("Ejecutar tareas en este worktree");
    expect(container.querySelector(WORKTREE_RUN_EXECUTION_TOGGLE_SELECTOR)).toBeNull();
  });

  it("renders and patches the worktree run-execution toggle when in a worktree", async () => {
    setWorktreeRuntimeMeta(true);
    await renderPage();

    expect(container.textContent).toContain(
      "Only tasks created after enabling will run automatically",
    );
    expect(container.textContent).toContain("Toggling off and on resets the cutoff.");
    // Off => no armed banner and no fail-closed hint.
    expect(container.textContent).not.toContain("Ejecutando las tareas creadas después del");
    expect(container.textContent).not.toContain("Execution is suppressed");

    expect(container.textContent).toContain("Ejecutar tareas en este worktree");
    expect(container.textContent).toContain(
      "isolated git-worktree preview instance",
    );

    const toggle = container.querySelector<HTMLButtonElement>(WORKTREE_RUN_EXECUTION_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableWorktreeRunExecution: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("shows the armed timestamp when the flag matches the current instance", async () => {
    setWorktreeRuntimeMeta(true);
    setWorktreeInstanceIdMeta("inst-current");
    currentExperimentalSettings = {
      ...currentExperimentalSettings,
      enableWorktreeRunExecution: true,
      worktreeRunExecutionActivatedAt: "2026-07-10T18:34:00.000Z",
      worktreeRunExecutionActivationInstanceId: "inst-current",
    };
    await renderPage();

    expect(container.textContent).toContain("Ejecutando las tareas creadas después del");
    expect(container.textContent).not.toContain("Execution is suppressed");
    const toggle = container.querySelector<HTMLButtonElement>(WORKTREE_RUN_EXECUTION_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("fails closed with a re-enable hint when the flag was armed in another instance", async () => {
    setWorktreeRuntimeMeta(true);
    setWorktreeInstanceIdMeta("inst-current");
    currentExperimentalSettings = {
      ...currentExperimentalSettings,
      enableWorktreeRunExecution: true,
      worktreeRunExecutionActivatedAt: "2026-07-10T18:34:00.000Z",
      worktreeRunExecutionActivationInstanceId: "inst-other",
    };
    await renderPage();

    expect(container.textContent).toContain("Execution is suppressed");
    expect(container.textContent).toContain("armed in a different instance");
    expect(container.textContent).toContain("Toggle it off and back on");
    expect(container.textContent).not.toContain("Ejecutando las tareas creadas después del");
  });

  it("fails closed with a re-enable hint when the activation cutoff is missing", async () => {
    setWorktreeRuntimeMeta(true);
    setWorktreeInstanceIdMeta("inst-current");
    currentExperimentalSettings = {
      ...currentExperimentalSettings,
      enableWorktreeRunExecution: true,
      worktreeRunExecutionActivatedAt: null,
      worktreeRunExecutionActivationInstanceId: null,
    };
    await renderPage();

    expect(container.textContent).toContain("Execution is suppressed");
    expect(container.textContent).toContain("missing its activation cutoff");
    expect(container.textContent).not.toContain("Ejecutando las tareas creadas después del");
  });

  it("renders and patches the Built-in Agents experimental toggle", async () => {
    await renderPage();

    expect(container.textContent).toContain("Agentes integrados");
    expect(container.textContent).toContain("Show Paperclip-managed built-in agent surfaces");

    const toggle = container.querySelector<HTMLButtonElement>(BUILT_IN_AGENTS_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableBuiltInAgents: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("renders and patches the Beta skills experimental toggle", async () => {
    await renderPage();

    expect(container.textContent).toContain("Habilidades beta");
    expect(container.textContent).toContain("pin beta releases of the Paperclip core skill");

    const toggle = container.querySelector<HTMLButtonElement>(BETA_SKILLS_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableBetaSkills: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("renders and patches the Summaries experimental toggle", async () => {
    await renderPage();

    expect(container.textContent).toContain("Resúmenes");
    expect(container.textContent).toContain("Show Summarizer-generated status slots");

    const toggle = container.querySelector<HTMLButtonElement>(SUMMARIES_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableSummaries: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("enables Summaries when enabling the Status Cards experimental toggle", async () => {
    await renderPage();

    expect(container.textContent).toContain("Tarjetas de estado");
    expect(container.textContent).toContain("experimental shared status-card board");

    const toggle = container.querySelector<HTMLButtonElement>(STATUS_CARDS_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableSummaries: true,
      enableStatusCards: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    expect(
      container.querySelector<HTMLButtonElement>(SUMMARIES_TOGGLE_SELECTOR)?.getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("disables Status Cards when disabling Summaries", async () => {
    currentExperimentalSettings = {
      ...currentExperimentalSettings,
      enableSummaries: true,
      enableStatusCards: true,
    };
    await renderPage();

    const summariesToggle = container.querySelector<HTMLButtonElement>(SUMMARIES_TOGGLE_SELECTOR);
    await act(async () => {
      summariesToggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableSummaries: false,
      enableStatusCards: false,
    });
    expect(summariesToggle?.getAttribute("aria-checked")).toBe("false");
    expect(
      container.querySelector<HTMLButtonElement>(STATUS_CARDS_TOGGLE_SELECTOR)?.getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("renders and patches the Server Info Debug View experimental toggle", async () => {
    await renderPage();

    expect(container.textContent).toContain("Vista de depuración de la información del servidor");
    expect(container.textContent).toContain(
      'Muestra una sección "Server" en el panel de la cuenta con la hora del último reinicio del servidor y el commit en ejecución.',
    );

    const toggle = container.querySelector<HTMLButtonElement>(SERVER_INFO_TOGGLE_SELECTOR);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableServerInfoDebugView: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("renders and patches Paperclip Developer Mode", async () => {
    await renderPage();

    expect(container.textContent).toContain("Modo desarrollador de Paperclip");
    expect(container.textContent).toContain("including Honeycomb trace queries on run pages");

    const toggle = container.querySelector<HTMLButtonElement>(
      PAPERCLIP_DEVELOPER_MODE_TOGGLE_SELECTOR,
    );
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      toggle?.click();
    });
    await flushReact();

    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enablePaperclipDeveloperMode: true,
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

});

describe("InstanceExperimentalSettings — cloud-managed keys", () => {
  const MANAGED_BADGE_TEXT = "Gestionado por Paperclip Cloud";

  let container: HTMLDivElement;
  let root: Root | null = null;
  let queryClient: QueryClient;

  async function renderPage(settings: InstanceExperimentalSettingsWithManaged) {
    mockInstanceSettingsApi.getExperimental.mockResolvedValue({ ...settings });
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    flushSync(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/BUT/company/settings/instance/experimental"]}>
            <InstanceExperimentalSettings />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await flushReact();
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockInstanceSettingsApi.updateExperimental.mockImplementation(async (patch) => ({
      ...defaultExperimentalSettings(),
      ...patch,
    }));
  });

  afterEach(() => {
    flushSync(() => {
      root?.unmount();
    });
    root = null;
    queryClient?.clear();
    container.remove();
    vi.clearAllMocks();
  });

  it("renders a managed key locked with the badge while unmanaged keys stay editable", async () => {
    await renderPage({
      ...defaultExperimentalSettings(),
      enableBuiltInAgents: true,
      managedKeys: {
        enableBuiltInAgents: { managed: true, managedBy: "paperclip-cloud" },
      },
    });

    expect(container.textContent).toContain(MANAGED_BADGE_TEXT);

    const builtInAgentsToggle = container.querySelector<HTMLButtonElement>(BUILT_IN_AGENTS_TOGGLE_SELECTOR);
    expect(builtInAgentsToggle?.getAttribute("aria-checked")).toBe("true");
    expect(builtInAgentsToggle?.disabled).toBe(true);

    await act(() => builtInAgentsToggle?.click());
    await flushReact();
    expect(mockInstanceSettingsApi.updateExperimental).not.toHaveBeenCalled();

    const summariesToggle = container.querySelector<HTMLButtonElement>(SUMMARIES_TOGGLE_SELECTOR);
    expect(summariesToggle?.disabled).toBe(false);

    await act(() => summariesToggle?.click());
    await flushReact();
    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({
      enableSummaries: true,
    });
  });

  it("keeps a managed isolated-workspaces-by-default setting locked", async () => {
    // The cloud overlay owns this key, so the tenant sees its value but cannot
    // write it back and have the overlay immediately override the write.
    await renderPage({
      ...defaultExperimentalSettings(),
      enableIsolatedWorkspaces: true,
      enableIsolatedWorkspacesByDefault: true,
      managedKeys: {
        enableIsolatedWorkspacesByDefault: { managed: true, managedBy: "paperclip-cloud" },
      },
    });

    const toggle = container.querySelector<HTMLButtonElement>(
      ISOLATED_WORKSPACES_BY_DEFAULT_TOGGLE_SELECTOR,
    );
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    expect(toggle?.disabled).toBe(true);
    expect(container.textContent).toContain(MANAGED_BADGE_TEXT);

    await act(() => toggle?.click());
    await flushReact();
    expect(mockInstanceSettingsApi.updateExperimental).not.toHaveBeenCalled();
  });

  it("keeps a managed chat connectors setting locked", async () => {
    await renderPage({
      ...defaultExperimentalSettings(),
      managedKeys: { enableChatConnectors: { managed: true, managedBy: "paperclip-cloud" } },
    });
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Activar o desactivar los conectores de chat (experimental)"]');
    expect(toggle?.disabled).toBe(true);
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain(MANAGED_BADGE_TEXT);
    await act(() => toggle?.click());
    expect(mockInstanceSettingsApi.updateExperimental).not.toHaveBeenCalled();
  });

  it("locks Status Cards when managed Summaries is disabled", async () => {
    await renderPage({
      ...defaultExperimentalSettings(),
      managedKeys: {
        enableSummaries: { managed: true, managedBy: "paperclip-cloud" },
      },
    });

    const statusCardsToggle = container.querySelector<HTMLButtonElement>(STATUS_CARDS_TOGGLE_SELECTOR);
    expect(statusCardsToggle?.disabled).toBe(true);

    await act(() => statusCardsToggle?.click());
    await flushReact();
    expect(mockInstanceSettingsApi.updateExperimental).not.toHaveBeenCalled();
  });

  it("locks Summaries on when managed Status Cards is enabled", async () => {
    await renderPage({
      ...defaultExperimentalSettings(),
      enableSummaries: true,
      enableStatusCards: true,
      managedKeys: {
        enableStatusCards: { managed: true, managedBy: "paperclip-cloud" },
      },
    });

    const summariesToggle = container.querySelector<HTMLButtonElement>(SUMMARIES_TOGGLE_SELECTOR);
    expect(summariesToggle?.disabled).toBe(true);

    await act(() => summariesToggle?.click());
    await flushReact();
    expect(mockInstanceSettingsApi.updateExperimental).not.toHaveBeenCalled();
  });

  it("renders no managed badge and keeps toggles editable without managedKeys (self-hosted)", async () => {
    await renderPage(defaultExperimentalSettings());

    expect(container.textContent).not.toContain(MANAGED_BADGE_TEXT);

    const builtInAgentsToggle = container.querySelector<HTMLButtonElement>(BUILT_IN_AGENTS_TOGGLE_SELECTOR);
    expect(builtInAgentsToggle?.disabled).toBe(false);

    await act(() => builtInAgentsToggle?.click());
    await flushReact();
    expect(mockInstanceSettingsApi.updateExperimental).toHaveBeenCalledWith({ enableBuiltInAgents: true });
  });
});

describe("InstanceExperimentalSettings — card ordering and headings (PAP-393)", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  async function renderPage(settings: InstanceExperimentalSettingsWithManaged) {
    mockInstanceSettingsApi.getExperimental.mockResolvedValue({ ...settings });
    root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    flushSync(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/BUT/company/settings/instance/experimental"]}>
            <InstanceExperimentalSettings />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await flushReact();
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockInstanceSettingsApi.updateExperimental.mockImplementation(async (patch) => ({
      ...defaultExperimentalSettings(),
      ...patch,
    }));
  });

  afterEach(() => {
    flushSync(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    setWorktreeRuntimeMeta(false);
    vi.clearAllMocks();
  });

  it("groups developer and legacy settings into sections", async () => {
    setWorktreeRuntimeMeta(true);
    await renderPage(defaultExperimentalSettings());

    const headings = [...container.querySelectorAll("section > div > h2")].map(
      (heading) => heading.textContent ?? "",
    );
    expect(headings).toEqual([
      "Funciones experimentales",
      "Modo desarrollador de Paperclip",
      "Heredado",
    ]);

    const sections = [...container.querySelectorAll("section")];
    expect(sections.at(0)?.textContent).not.toContain("Ejecutar tareas en este worktree");
    expect(sections.at(0)?.textContent).not.toContain("Solo entorno gestionado");
    expect(sections.at(-2)?.textContent).toContain("Ejecutar tareas en este worktree");
    expect(sections.at(-2)?.textContent).toContain("Solo entorno gestionado");
    expect(sections.at(-2)?.textContent).toContain("Reiniciar el servidor de desarrollo cuando esté inactivo");
    expect(sections.at(-2)?.textContent).toContain("Vista de depuración de la información del servidor");
    expect(sections.at(-2)?.textContent).toContain("Smoke Lab");
    expect(sections.at(-2)?.textContent).toContain("Descomposición del plan de tareas");
    expect(sections.at(-1)?.textContent).toContain("Estas funciones se eliminarán.");
    expect(sections.at(-1)?.textContent).toContain("Interfaz clásica de tareas");
    expect(sections.at(-1)?.textContent).toContain("Enlace de Objetivos en la barra lateral");
  });

  it("alphabetizes cards by their displayed title within each section", async () => {
    setWorktreeRuntimeMeta(true);
    await renderPage({ ...defaultExperimentalSettings(), enableIsolatedWorkspaces: true });

    for (const section of container.querySelectorAll("section")) {
      const titles = [...section.querySelectorAll("h3")].map((heading) => heading.textContent ?? "");
      expect(titles.length).toBeGreaterThan(1);
      expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    }
  });

  it("renders setting cards without a background color", async () => {
    await renderPage(defaultExperimentalSettings());

    const cards = [...container.querySelectorAll('[data-slot="card"]')];
    expect(cards.length).toBeGreaterThan(10);
    expect(cards.every((card) => card.classList.contains("bg-transparent"))).toBe(true);
  });

  it("no longer renders an 'Experimental' secondary badge on any card", async () => {
    await renderPage(defaultExperimentalSettings());

    const badges = [...container.querySelectorAll('[data-slot="badge"]')].map(
      (badge) => badge.textContent?.trim(),
    );
    expect(badges).not.toContain("Experimental");
  });
});

describe("InstanceExperimentalSettings — operator-hidden cards", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    flushSync(() => root?.unmount());
    root = null;
    queryClient?.clear();
    container.remove();
    setWorktreeRuntimeMeta(false);
    vi.clearAllMocks();
  });

  async function renderPage(
    hiddenSettings?: string[],
    settings: InstanceExperimentalSettingsWithManaged = defaultExperimentalSettings(),
  ) {
    mockInstanceSettingsApi.getExperimental.mockResolvedValue(settings);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.health, {
      status: "ok",
      ...(hiddenSettings ? { hiddenSettings } : {}),
    });
    flushSync(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/BUT/company/settings/instance/experimental"]}>
            <InstanceExperimentalSettings />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await flushReact();
  }

  it.each([
    { cloud: false, enabled: false },
    { cloud: false, enabled: true },
    { cloud: true, enabled: false },
    { cloud: true, enabled: true },
  ])("offers no AI routing control with cloud=$cloud and enabled=$enabled", async ({ cloud, enabled }) => {
    await renderPage(undefined, {
      ...defaultExperimentalSettings(),
      enableAiConnectionRouters: enabled,
      ...(cloud ? { managedKeys: { enableAiConnectionRouters: { managed: true, managedBy: "paperclip-cloud" as const } } } : {}),
    });

    expect(container.textContent).toContain("Funciones experimentales");
    expect(container.textContent).not.toContain("AI connection routers");
    expect(container.querySelector('button[aria-label="Toggle AI connection routers experimental setting"]')).toBeNull();
    expect(mockInstanceSettingsApi.updateExperimental).not.toHaveBeenCalled();
  });

  it("renders nothing for an operator-hidden toggle and keeps the rest", async () => {
    await renderPage(["instance.experimental.enableEnvironments"]);

    expect(container.textContent).not.toContain("Activar entornos");
    expect(container.textContent).toContain("Habilidades beta");
    expect(container.textContent).not.toContain("Show the Apps navigation");
  });

  it("keeps only permitted controls in alphabetical order, including when hidden features are enabled", async () => {
    setWorktreeRuntimeMeta(true);
    const visible = new Set(["enableExternalObjects", "enableMemoryConnectors", "enableSimplifiedEnglishInteractions"]);
    await renderPage(
      INSTANCE_FEATURE_KEYS.filter((key) => !visible.has(key)).map((key) => `instance.experimental.${key}`),
      {
        ...defaultExperimentalSettings(),
        enableIsolatedWorkspaces: true,
        enableIsolatedWorkspacesByDefault: true,
        enablePaperclipDeveloperMode: true,
        managedKeys: {
          enableIsolatedWorkspacesByDefault: { managed: true, managedBy: "paperclip-cloud" },
        },
      },
    );

    expect([...container.querySelectorAll("h3")].map((heading) => heading.textContent)).toEqual([
      "Activar objetos externos",
      "Conectores de memoria",
      "Interacciones en inglés simplificado",
    ]);
    expect([...container.querySelectorAll("section h2")].map((heading) => heading.textContent)).toEqual([
      "Funciones experimentales",
    ]);
    expect(container.querySelectorAll('button[role="switch"]')).toHaveLength(3);
    expect(mockInstanceSettingsApi.updateExperimental).not.toHaveBeenCalled();
  });

  it("retains a section when one of its controls is visible", async () => {
    const visible = new Set(["enablePaperclipDeveloperMode", "enableGoalsSidebarLink"]);
    await renderPage(INSTANCE_FEATURE_KEYS.filter((key) => !visible.has(key)).map((key) => `instance.experimental.${key}`));
    expect(container.querySelector('[aria-labelledby="developer-mode-heading"] h3')?.textContent).toBe("Modo desarrollador de Paperclip");
    expect(container.querySelector('[aria-labelledby="legacy-heading"] h3')?.textContent).toBe("Enlace de Objetivos en la barra lateral");
  });

  it("shows every toggle when nothing is hidden", async () => {
    await renderPage();

    expect(container.textContent).toContain("Activar entornos");
    expect(container.textContent).toContain("Habilidades beta");
  });
});
