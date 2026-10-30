// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer } from "@paperclipai/shared";
import { CustomersActionsMenu } from "./CustomersActionsMenu";

vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("CustomersActionsMenu", () => {
  let root: Root;
  let container: HTMLDivElement;
  const callbacks = { onEdit: vi.fn(), onProposal: vi.fn(), onAddContact: vi.fn(), onArchive: vi.fn(), onRestore: vi.fn() };
  const customer = { id: "customer-1", name: "Acme", status: "active" } as Customer;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.values(callbacks).forEach((callback) => callback.mockReset());
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ""; });

  it("keeps customer actions out of the containing row click and invokes the selected action", async () => {
    const rowClick = vi.fn();
    act(() => root.render(<div onClick={rowClick}><CustomersActionsMenu customer={customer} {...callbacks} /></div>));
    const trigger = container.querySelector("button")!;
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }));
      trigger.click();
    });
    expect(rowClick).not.toHaveBeenCalled();
    const edit = [...document.querySelectorAll("[role=menuitem]")].find((item) => item.textContent?.includes("uxCrm.customers.edit"))!;
    await act(async () => { (edit as HTMLElement).click(); });
    expect(callbacks.onEdit).toHaveBeenCalledOnce();
    expect(rowClick).not.toHaveBeenCalled();
  });
});
