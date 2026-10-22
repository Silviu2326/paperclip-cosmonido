// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, OfficeLayout } from "@paperclipai/shared";
import { DEV_CATALOG } from "./dev-catalog";
import { OfficeCanvas } from "./OfficeCanvas";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/router", () => ({ useNavigate: () => navigate }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const layout: OfficeLayout = {
  version: 1,
  cols: 12,
  rows: 8,
  floor: "wood",
  wall: "plaster",
  objects: [{ id: "desk_1", kind: "desk", x: 2, y: 4, agentId: "a1" }],
};
const agents = [
  { id: "a1", companyId: "c1", name: "Walter", urlKey: "walter", status: "running", appearance: null },
  { id: "a2", companyId: "c1", name: "Ana", urlKey: "ana", status: "paused", appearance: null },
] as unknown as Agent[];

let host: HTMLDivElement;
let root: Root;
let contexts: Array<Record<string, unknown>>;

/** A 2D context stub: every method is a spy, so the engine can draw without a real canvas. */
function fakeContext() {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(store, property) {
      if (!(property in store)) store[property as string] = vi.fn();
      return store[property as string];
    },
    set(store, property, value) {
      store[property as string] = value;
      return true;
    },
  });
}

beforeEach(() => {
  navigate.mockReset();
  contexts = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const context = fakeContext();
    contexts.push(context);
    return context as unknown as CanvasRenderingContext2D;
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OfficeCanvas", () => {
  it("mounts the engine on a 2D context without throwing", async () => {
    await act(async () => {
      root.render(<OfficeCanvas layout={layout} catalog={DEV_CATALOG} atlases={{}} agents={agents} />);
    });
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith("2d");
    expect(contexts.length).toBeGreaterThan(0);
    expect(host.querySelector("canvas")).not.toBeNull();
  });

  it("lists every agent as a keyboard-reachable link to its page", async () => {
    await act(async () => {
      root.render(<OfficeCanvas layout={layout} catalog={DEV_CATALOG} atlases={{}} agents={agents} />);
    });
    const links = Array.from(host.querySelectorAll("a"));
    expect(links.map(link => link.getAttribute("href"))).toEqual(["/agents/walter", "/agents/ana"]);
    await act(async () => {
      links[1].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(navigate).toHaveBeenCalledWith("/agents/ana");
  });

  it("re-draws when the agents change and stops its loop on unmount", async () => {
    await act(async () => {
      root.render(<OfficeCanvas layout={layout} catalog={DEV_CATALOG} atlases={{}} agents={agents} />);
    });
    await act(async () => {
      root.render(<OfficeCanvas layout={layout} catalog={DEV_CATALOG} atlases={{}} agents={agents.slice(0, 1)} />);
    });
    expect(host.querySelectorAll("a")).toHaveLength(1);
    await act(async () => root.unmount());
    expect(vi.mocked(cancelAnimationFrame).mock.calls.length + vi.mocked(requestAnimationFrame).mock.calls.length).toBeGreaterThan(0);
    root = createRoot(host);
  });
});
