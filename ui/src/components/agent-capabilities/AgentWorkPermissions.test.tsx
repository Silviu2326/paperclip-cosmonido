// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_AGENT_WORK_PERMISSIONS, type AgentWorkPermissions } from "@paperclipai/shared";
import { i18n } from "../../i18n";
import { AgentWorkPermissionsSection } from "./AgentWorkPermissions";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let element: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(async () => { await i18n.changeLanguage("es"); element = document.createElement("div"); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(async () => root.unmount()); element.remove(); });
const button = (key: string) => element.querySelector(`[data-testid="agent-work-permission-${key}"]`) as HTMLButtonElement;
describe("real work permission controls", () => {
  it("disables controls the adapter does not own", async () => {
    await act(async () => root.render(<AgentWorkPermissionsSection specialty="software" value={ALL_AGENT_WORK_PERMISSIONS} onChange={vi.fn()} />));
    expect(button("workspaceRead").disabled).toBe(true);
    expect(button("workspaceExecute").disabled).toBe(true);
    expect(button("tasksCreate").disabled).toBe(false);
    expect(element.textContent).toContain("no tiene habilitado el espacio de trabajo controlado");
  });
  it("removes command access when workspace writing is disabled", async () => {
    const changed = vi.fn();
    await act(async () => root.render(<AgentWorkPermissionsSection specialty="software" value={ALL_AGENT_WORK_PERMISSIONS} support={{ workspace: true, commands: true }} onChange={changed} />));
    await act(async () => button("workspaceWrite").click());
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ workspaceRead: true, workspaceWrite: false, workspaceExecute: false }));
  });
  it("keeps older effective access until an explicit edit", async () => {
    const changed = vi.fn();
    await act(async () => root.render(<AgentWorkPermissionsSection specialty="operations" onChange={changed} />));
    expect(changed).not.toHaveBeenCalled();
    expect(button("tasksCreate").getAttribute("aria-checked")).toBe("true");
    await act(async () => button("tasksCreate").click());
    expect((changed.mock.calls[0][0] as AgentWorkPermissions).tasksCreate).toBe(false);
    expect((changed.mock.calls[0][0] as AgentWorkPermissions).documentsRead).toBe(true);
    expect(element.querySelector('[data-testid="agent-work-permission-workspaceRead"]')).toBeNull();
  });
  it("exposes the real Codex filesystem policy separately from unsupported command switches", async () => {
    const changed = vi.fn();
    await act(async () => root.render(<AgentWorkPermissionsSection specialty="software" value={ALL_AGENT_WORK_PERMISSIONS} support={{ workspace: false, commands: false, codexFilesystem: true }} onChange={vi.fn()} onCodeAdapterAccessChange={changed} />));
    const select = element.querySelector("select")!;
    await act(async () => { select.value = "read_only"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(changed).toHaveBeenCalledWith("read_only");
    expect(button("workspaceExecute").disabled).toBe(true);
  });
});
