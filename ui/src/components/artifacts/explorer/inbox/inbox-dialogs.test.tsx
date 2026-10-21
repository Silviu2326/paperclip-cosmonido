// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFile, CompanyFileFolderNode } from "@/api/company-files";
import { ApiError } from "@/api/client";
import { t } from "@/i18n";
import { type InboxDialogsApi, useInboxDialogs } from "./InboxDialogs";

const treeMock = vi.hoisted(() => vi.fn());
const createFolderMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const updateFolderMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());
const removeFolderMock = vi.hoisted(() => vi.fn());
const addVersionMock = vi.hoisted(() => vi.fn());
const createFromArtifactMock = vi.hoisted(() => vi.fn());
const pushToastMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/company-files", () => ({
  companyFilesApi: {
    tree: (companyId: string) => treeMock(companyId),
    createFolder: (companyId: string, input: unknown) => createFolderMock(companyId, input),
    update: (fileId: string, input: unknown) => updateMock(fileId, input),
    updateFolder: (folderId: string, input: unknown) => updateFolderMock(folderId, input),
    remove: (fileId: string) => removeMock(fileId),
    removeFolder: (folderId: string) => removeFolderMock(folderId),
    addVersion: (fileId: string, file: File, options?: unknown) => addVersionMock(fileId, file, options),
    createFromArtifact: (companyId: string, input: unknown) => createFromArtifactMock(companyId, input),
  },
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ pushToast: pushToastMock }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const COMPANY_ID = "company-1";

const tree: CompanyFileFolderNode[] = [
  {
    id: "f1",
    parentId: null,
    name: "Contratos",
    slug: "contratos",
    systemKey: null,
    agentVisible: true,
    position: 0,
    fileCount: 0,
    totalByteSize: 0,
    children: [
      {
        id: "f2",
        parentId: "f1",
        name: "2026",
        agentVisible: true,
        slug: "2026",
        systemKey: null,
        position: 0,
        fileCount: 0,
        totalByteSize: 0,
        children: [],
      },
    ],
  },
];

const fileFixture = {
  id: "file-1",
  companyId: COMPANY_ID,
  folderId: "f1",
  name: "contrato.pdf",
  slug: "contrato-pdf",
  contentType: "application/pdf",
  byteSize: 10,
  currentVersionId: null,
  currentVersionNumber: 1,
  versionCount: 1,
  createdByUserId: null,
  updatedByUserId: null,
  contentPath: "",
  downloadPath: "",
  usedInIssueCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as CompanyFile;

let api: InboxDialogsApi | null = null;

function Harness() {
  const inbox = useInboxDialogs(COMPANY_ID);
  useEffect(() => {
    api = inbox;
  });
  return <>{inbox.dialogs}</>;
}

function current(): InboxDialogsApi {
  if (!api) throw new Error("harness not mounted");
  return api;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function input(selector: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(selector);
  if (!el) throw new Error(`input not found: ${selector}`);
  return el;
}

function submitButton(): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]');
  if (!el) throw new Error("submit button not found");
  return el;
}

function buttonWithText(text: string): HTMLButtonElement {
  const el = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
    (button) => button.textContent?.trim() === text,
  );
  if (!el) throw new Error(`button not found: ${text}`);
  return el;
}

function radioWithText(text: string): HTMLButtonElement {
  const el = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
    (button) => button.textContent?.trim() === text,
  );
  if (!el) throw new Error(`radio not found: ${text}`);
  return el;
}

function findExpandFolder(name: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    `[role="radiogroup"] button[aria-label="${t("artifacts.explorer.inbox.picker.expand", { name })}"]`,
  );
}

// The picker loads its tree through react-query, so the expand control can
// appear a few ticks after the dialog opens. Poll briefly instead of assuming
// a single flush is enough.
async function expandFolder(name: string): Promise<HTMLButtonElement> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const el = findExpandFolder(name);
    if (el) return el;
    await flush();
  }
  throw new Error(`expand control not found: ${name}`);
}

function alertText(): string | null {
  return document.querySelector('[role="alert"]')?.textContent ?? null;
}

describe("useInboxDialogs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    treeMock.mockResolvedValue(tree);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    api = null;
    document.body.innerHTML = "";
  });

  it("creates a folder under the given parent", async () => {
    createFolderMock.mockResolvedValue({ id: "f3", name: "Facturas" });
    act(() => current().openNewFolder("f1"));
    await flush();

    setInputValue(input("#inbox-new-folder-name"), "  Facturas  ");
    await act(async () => submitButton().click());
    await flush();

    expect(createFolderMock).toHaveBeenCalledWith(COMPANY_ID, { name: "Facturas", parentId: "f1" });
    expect(pushToastMock).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" }));
  });

  it("renames a file with the prefilled name", async () => {
    updateMock.mockResolvedValue({ ...fileFixture, name: "nuevo.pdf" });
    act(() => current().openRenameFile(fileFixture));
    await flush();

    expect(input("#inbox-rename-name").value).toBe("contrato.pdf");
    setInputValue(input("#inbox-rename-name"), "nuevo.pdf");
    await act(async () => submitButton().click());
    await flush();

    expect(updateMock).toHaveBeenCalledWith("file-1", { name: "nuevo.pdf" });
  });

  it("deletes a file only after the confirm button is pressed", async () => {
    removeMock.mockResolvedValue(undefined);
    act(() => current().openDeleteFile(fileFixture));
    await flush();

    expect(removeMock).not.toHaveBeenCalled();
    await act(async () => submitButton().click());
    await flush();

    expect(removeMock).toHaveBeenCalledWith("file-1");
  });

  it("replaces a version with the chosen File and the note", async () => {
    const upload = new File(["v2"], "contrato-v2.pdf", { type: "application/pdf" });
    addVersionMock.mockResolvedValue({ ...fileFixture, currentVersionNumber: 2 });
    act(() => current().openReplaceVersion(fileFixture));
    await flush();

    const fileInput = input("#inbox-version-file");
    Object.defineProperty(fileInput, "files", { value: [upload], configurable: true });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    setInputValue(input("#inbox-version-note"), "revisión final");
    await flush();

    await act(async () => submitButton().click());
    await flush();

    expect(addVersionMock).toHaveBeenCalledWith("file-1", upload, { note: "revisión final" });
    expect(pushToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: t("artifacts.explorer.inbox.version.added", { name: "contrato.pdf", version: 2 }),
      }),
    );
  });

  it("moves an artifact to the inbox into the picked folder", async () => {
    createFromArtifactMock.mockResolvedValue({ ...fileFixture, name: "Guía.md" });
    act(() => current().openMoveToInbox({ source: "document", id: "doc-1", name: "Guía.md" }));
    await flush();

    const expand = await expandFolder("Contratos");
    await act(async () => expand.click());
    await act(async () => radioWithText("2026").click());
    await act(async () => submitButton().click());
    await flush();

    expect(createFromArtifactMock).toHaveBeenCalledWith(COMPANY_ID, {
      source: "document",
      id: "doc-1",
      folderId: "f2",
      name: "Guía.md",
    });
  });

  it("moves a file to the picked folder", async () => {
    updateMock.mockResolvedValue({ ...fileFixture, folderId: "f2" });
    act(() => current().openMoveFile(fileFixture));
    await flush();

    const expand = await expandFolder("Contratos");
    await act(async () => expand.click());
    await act(async () => radioWithText("2026").click());
    await act(async () => submitButton().click());
    await flush();

    expect(updateMock).toHaveBeenCalledWith("file-1", { folderId: "f2" });
  });

  it("shows the server error message inside the dialog when deleting a non-empty folder", async () => {
    removeFolderMock.mockRejectedValue(new ApiError("La carpeta no está vacía", 422, null));
    act(() => current().openDeleteFolder({ id: "f1", name: "Contratos" }));
    await flush();

    await act(async () => submitButton().click());
    await flush();

    expect(alertText()).toContain("La carpeta no está vacía");
    expect(pushToastMock).not.toHaveBeenCalled();
    expect(buttonWithText(t("artifacts.explorer.inbox.cancel"))).toBeTruthy();
  });
});
