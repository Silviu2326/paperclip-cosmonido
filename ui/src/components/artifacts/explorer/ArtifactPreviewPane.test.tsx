// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactPreviewPane, type ArtifactPreviewAction } from "./ArtifactPreviewPane";
import type { PreviewTarget } from "./preview-target";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeTarget(overrides: Partial<PreviewTarget> = {}): PreviewTarget {
  return {
    id: "file-1",
    box: "in",
    title: "logo.png",
    contentType: "image/png",
    contentPath: "/api/files/logo.png",
    downloadPath: "/api/files/logo.png?download=1",
    byteSize: 96 * 1024,
    updatedAt: "2026-10-20T10:00:00.000Z",
    meta: [{ label: "Subido por", value: "Ana" }],
    ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container;
}

function buttonWithText(text: string): HTMLButtonElement {
  const match = Array.from(container!.querySelectorAll("button")).find((button) => button.textContent?.trim() === text);
  if (!match) throw new Error(`No button with text "${text}"`);
  return match;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe("ArtifactPreviewPane", () => {
  it("shows the empty state when no target is selected", () => {
    render(
      <ArtifactPreviewPane target={null} onClose={vi.fn()} onOpenFullscreen={vi.fn()} actions={[]} />,
    );
    expect(container!.textContent).toContain("Selecciona un archivo para verlo aquí.");
    expect(container!.textContent).toContain("Doble clic abre a pantalla completa.");
  });

  it("renders an img for an image target and shows the title and metadata", () => {
    render(
      <ArtifactPreviewPane target={makeTarget()} onClose={vi.fn()} onOpenFullscreen={vi.fn()} actions={[]} />,
    );
    const image = container!.querySelector("img");
    expect(image).not.toBeNull();
    expect(image!.getAttribute("src")).toBe("/api/files/logo.png");
    expect(container!.querySelector("h3")?.textContent).toBe("logo.png");
    expect(container!.textContent).toContain("96 KB");
    expect(container!.textContent).toContain("Entrada");
    expect(container!.textContent).toContain("Subido por");
    expect(container!.textContent).toContain("Ana");
  });

  it("shows the unsupported state with a download link for unknown types", () => {
    render(
      <ArtifactPreviewPane
        target={makeTarget({
          id: "file-2",
          title: "bundle.zip",
          contentType: "application/zip",
          contentPath: "/api/files/bundle.zip",
          downloadPath: "/api/files/bundle.zip?download=1",
        })}
        onClose={vi.fn()}
        onOpenFullscreen={vi.fn()}
        actions={[]}
      />,
    );
    expect(container!.textContent).toContain("Sin vista previa");
    const download = container!.querySelector('a[download]');
    expect(download).not.toBeNull();
    expect(download!.getAttribute("href")).toBe("/api/files/bundle.zip?download=1");
  });

  it("fires each action's onSelect when its button is clicked", () => {
    const reemplazar = vi.fn();
    const borrar = vi.fn();
    const actions: ArtifactPreviewAction[] = [
      { id: "replace", label: "Reemplazar", onSelect: reemplazar },
      { id: "delete", label: "Borrar", onSelect: borrar, destructive: true },
    ];
    render(<ArtifactPreviewPane target={makeTarget()} onClose={vi.fn()} onOpenFullscreen={vi.fn()} actions={actions} />);
    act(() => buttonWithText("Reemplazar").click());
    act(() => buttonWithText("Borrar").click());
    expect(reemplazar).toHaveBeenCalledTimes(1);
    expect(borrar).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenFullscreen with the target and onClose from the header buttons", () => {
    const onOpenFullscreen = vi.fn();
    const onClose = vi.fn();
    const target = makeTarget();
    render(<ArtifactPreviewPane target={target} onClose={onClose} onOpenFullscreen={onOpenFullscreen} actions={[]} />);
    act(() => container!.querySelector<HTMLButtonElement>('button[aria-label="Pantalla completa"]')!.click());
    act(() => container!.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')!.click());
    expect(onOpenFullscreen).toHaveBeenCalledWith(target);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the versions list when versions are provided", () => {
    render(
      <ArtifactPreviewPane
        target={makeTarget({
          versions: [
            { id: "v2", label: "v2", date: "12 sep", current: true },
            { id: "v1", label: "v1", date: "3 sep", current: false },
          ],
        })}
        onClose={vi.fn()}
        onOpenFullscreen={vi.fn()}
        actions={[]}
      />,
    );
    expect(container!.textContent).toContain("Versiones");
    expect(container!.textContent).toContain("v2 · 12 sep");
    expect(container!.textContent).toContain("v1 · 3 sep");
  });
});
