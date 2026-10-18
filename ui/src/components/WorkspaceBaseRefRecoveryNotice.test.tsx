// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceBaseRefRecoveryNotice, type WorkspaceBaseRefRecoveryNoticeProps } from "./WorkspaceBaseRefRecoveryNotice";

const evidence = { requestedRef: "main", repository: "paperclipai/paperclip", defaultBranch: "master", agentName: "Felix", failureKind: "missing_branch" as const };
describe("workspace branch repair", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  const button = (name: string) => Array.from(container.querySelectorAll("button")).find(b => b.textContent === name)!;
  const render = async (props: Partial<WorkspaceBaseRefRecoveryNoticeProps> = {}) => act(async () => { root.render(<WorkspaceBaseRefRecoveryNotice {...evidence} onRepair={async () => {}} {...props} />); });

  it("shows the missing branch and verified default without a secrets diagnosis", async () => {
    await render();
    expect(container.textContent).toContain("Rama main no encontrada");
    expect(container.textContent).toContain("Felix aún no ha empezado");
    expect(container.textContent).not.toContain("secret");
    expect(button("Usar master y reintentar").disabled).toBe(false);
    expect(container.textContent).toContain("Cambia solo la rama inicial de esta tarea");
  });
  it("waits for a repair receipt and prevents duplicate submissions", async () => {
    let finish!: () => void;
    const repair = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    await render({ onRepair: repair });
    await act(async () => { button("Usar master y reintentar").click(); button("Usar master y reintentar")?.click(); });
    expect(repair).toHaveBeenCalledExactlyOnceWith("master");
    expect(button("Guardando y solicitando reintento…").disabled).toBe(true);
    expect(container.textContent).not.toContain("Rama actualizada");
    await act(async () => finish());
    expect(container.textContent).toContain("Rama actualizada · reintento solicitado");
    expect(button("Usar master y reintentar")).toBeUndefined();
  });
  it("keeps a custom branch after failure and permits correction", async () => {
    const repair = vi.fn().mockRejectedValue(new Error("Branch was not found."));
    await render({ onRepair: repair });
    await act(async () => button("Elegir otra rama").click());
    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "release/next");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(repair).toHaveBeenCalledExactlyOnceWith("release/next");
    expect(input.value).toBe("release/next");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Branch was not found");
    expect(button("Guardar rama y reintentar").disabled).toBe(false);
    expect(container.textContent).not.toContain("Rama actualizada");
  });
  it("rejects invalid branch syntax before sending a repair", async () => {
    const repair = vi.fn();
    await render({ onRepair: repair, defaultBranch: "bad..branch" });
    await act(async () => button("Usar bad..branch y reintentar").click());
    expect(repair).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Introduce un nombre de rama válido");
  });
  it("does not guess a default branch or call an unresolved ref missing", async () => {
    await render({ defaultBranch: null, failureKind: "unresolved_ref" });
    expect(button("Usar master y reintentar")).toBeUndefined();
    expect(container.textContent).not.toContain("has no branch");
    expect(container.querySelector("input")?.value).toBe("");
    expect(button("Guardar rama y reintentar").disabled).toBe(true);
  });
  it("does not submit a disabled repair", async () => {
    const repair = vi.fn();
    await render({ onRepair: repair, unavailableReason: "The task is paused." });
    expect(button("Usar master y reintentar").disabled).toBe(true);
    await act(async () => button("Usar master y reintentar").click());
    expect(repair).not.toHaveBeenCalled();
  });
});
