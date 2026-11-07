// @vitest-environment jsdom

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewTarget } from "../preview-target";
import { PdfViewer } from "./PdfViewer";

const pdfState = vi.hoisted(() => ({ fail: false }));

vi.mock("pdfjs-dist", () => {
  const textItem = (str: string) => ({
    str,
    dir: "ltr",
    transform: [12, 0, 0, 12, 40, 700],
    width: str.length * 6,
    height: 12,
    fontName: "f1",
    hasEOL: false,
  });
  const pages = [[textItem("Introducción")], [textItem("Hola mundo")]];
  const makePage = (items: ReturnType<typeof textItem>[]) => ({
    getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({
      width: 600 * scale,
      height: 800 * scale,
      scale,
      transform: [scale, 0, 0, -scale, 0, 800 * scale],
    }),
    render: () => ({ promise: Promise.resolve(), cancel: () => undefined }),
    getTextContent: async () => ({ items }),
  });
  const doc = {
    numPages: 2,
    getPage: async (pageNumber: number) => makePage(pages[pageNumber - 1]!),
  };
  return {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: () => ({
      promise: pdfState.fail ? Promise.reject(new Error("load failed")) : Promise.resolve(doc),
      destroy: async () => undefined,
    }),
  };
});

const target: PreviewTarget = {
  id: "file:pdf-1",
  box: "in",
  title: "propuesta.pdf",
  contentType: "application/pdf",
  contentPath: "/api/company-files/pdf-1/content",
  downloadPath: "/api/company-files/pdf-1/content?download=1",
  openPath: "/api/company-files/pdf-1/content",
  byteSize: 2048,
  updatedAt: "2026-06-02T00:00:00.000Z",
  previewText: null,
  meta: [],
};

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForAssertion(assertion: () => void, attempts = 60) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flush();
    }
  }
  throw lastError;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("PdfViewer", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    pdfState.fail = false;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) flushSync(() => root?.unmount());
    root = null;
    container.remove();
  });

  function render(mode: "pane" | "fullscreen") {
    root = createRoot(container);
    flushSync(() => root?.render(<PdfViewer target={target} mode={mode} />));
  }

  it("renders the first page in the pane with page controls and no second canvas", async () => {
    render("pane");

    await waitForAssertion(() => {
      expect(container.querySelectorAll("canvas")).toHaveLength(1);
      expect(container.textContent).toContain("1 / 2");
    });
    expect(container.querySelector('[data-pdf-page="2"]')).toBeNull();
  });

  it("moves to the next page with the pane controls", async () => {
    render("pane");
    await waitForAssertion(() => expect(container.textContent).toContain("1 / 2"));

    (container.querySelector('button[aria-label="Página siguiente"]') as HTMLButtonElement).click();

    await waitForAssertion(() => expect(container.textContent).toContain("2 / 2"));
  });

  it("searches the text of every page, selects page 2 and highlights the match", async () => {
    render("fullscreen");
    await waitForAssertion(() => expect(container.querySelector('[data-pdf-page="1"]')).not.toBeNull());

    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    setInputValue(input, "mundo");
    (container.querySelector('form[role="search"]') as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await waitForAssertion(() => {
      expect(container.textContent).toContain("2 / 2");
      expect(container.textContent).toContain("1 de 1");
      const highlight = container.querySelector('[data-pdf-page="2"] [data-pdf-highlight]');
      expect(highlight).not.toBeNull();
    });
    expect(container.querySelector('[data-pdf-page="1"] [data-pdf-highlight]')).toBeNull();
  });

  it("reports no results when the search matches nothing", async () => {
    render("fullscreen");
    await waitForAssertion(() => expect(container.querySelector('[data-pdf-page="1"]')).not.toBeNull());

    setInputValue(container.querySelector('input[type="search"]') as HTMLInputElement, "inexistente");
    (container.querySelector('form[role="search"]') as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await waitForAssertion(() => expect(container.textContent).toContain("Sin resultados"));
  });

  it("falls back to the browser viewer with an open-in-new-tab link when pdf.js fails", async () => {
    pdfState.fail = true;
    render("pane");

    await waitForAssertion(() => {
      const frame = container.querySelector("iframe");
      expect(frame?.getAttribute("src")).toBe(target.contentPath);
      const link = [...container.querySelectorAll("a")].find((anchor) => anchor.textContent?.includes("Abrir en pestaña nueva"));
      expect(link?.getAttribute("href")).toBe(target.openPath);
    });
  });
});
