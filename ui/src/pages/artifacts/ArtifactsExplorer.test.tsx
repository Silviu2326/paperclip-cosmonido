// @vitest-environment jsdom

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFileFolderNode, CompanyFile } from "@/api/company-files";
import type { CompanyArtifactTreeNode } from "@/api/artifacts";
import type { ResourceMemberships } from "@paperclipai/shared";
import { ArtifactsExplorer } from "./ArtifactsExplorer";

const companyState = vi.hoisted(() => ({ selectedCompanyId: "company-1" }));
const breadcrumbState = vi.hoisted(() => ({ setBreadcrumbs: vi.fn() }));
const companyFilesApiMock = vi.hoisted(() => ({
  tree: vi.fn(),
  list: vi.fn(),
  versions: vi.fn(),
  usage: vi.fn(),
  updateFolder: vi.fn(),
}));
const artifactsApiMock = vi.hoisted(() => ({ tree: vi.fn(), list: vi.fn() }));
const contextApiMock = vi.hoisted(() => ({ list: vi.fn() }));
const projectsApiMock = vi.hoisted(() => ({ list: vi.fn() }));
const membershipsApiMock = vi.hoisted(() => ({
  listMine: vi.fn(),
  updateCompanyFile: vi.fn(),
  updateDocument: vi.fn(),
  updateArtifact: vi.fn(),
}));
const uploadsMock = vi.hoisted(() => ({
  entries: [] as unknown[],
  announcement: "",
  upload: vi.fn(),
  retry: vi.fn(),
  dismiss: vi.fn(),
  clearCompleted: vi.fn(),
}));
const inboxMock = vi.hoisted(() => ({
  dialogs: null,
  openNewFolder: vi.fn(),
  openRenameFile: vi.fn(),
  openRenameFolder: vi.fn(),
  openMoveFile: vi.fn(),
  openDeleteFile: vi.fn(),
  openDeleteFolder: vi.fn(),
  openReplaceVersion: vi.fn(),
  openMoveToInbox: vi.fn(),
}));

vi.mock("@/context/CompanyContext", () => ({ useCompany: () => companyState }));
vi.mock("@/context/BreadcrumbContext", () => ({ useBreadcrumbs: () => breadcrumbState }));
vi.mock("@/api/company-files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/company-files")>()),
  companyFilesApi: companyFilesApiMock,
}));
vi.mock("@/api/artifacts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/artifacts")>()),
  artifactsApi: artifactsApiMock,
}));
vi.mock("@/api/context", () => ({ contextApi: contextApiMock }));
vi.mock("@/api/projects", () => ({ projectsApi: projectsApiMock }));
vi.mock("@/api/resourceMemberships", () => ({ resourceMembershipsApi: membershipsApiMock }));
vi.mock("@/context/ToastContext", () => ({ useToastActions: () => ({ pushToast: vi.fn() }) }));
vi.mock("@/hooks/useCompanyFileUploads", () => ({ useCompanyFileUploads: () => uploadsMock }));
vi.mock("@/components/artifacts/explorer/inbox/InboxDialogs", () => ({ useInboxDialogs: () => inboxMock }));
vi.mock("@/components/artifacts/explorer/ArtifactViewer", () => ({
  ArtifactViewer: ({ target }: { target: { title: string } }) => <div data-testid="artifact-viewer">{target.title}</div>,
}));

function folder(overrides: Partial<CompanyFileFolderNode> & { id: string; name: string }): CompanyFileFolderNode {
  return {
    parentId: null,
    slug: overrides.id,
    systemKey: null,
    position: 0,
    fileCount: 0,
    totalByteSize: 0,
    children: [],
    agentVisible: true,
    ...overrides,
  };
}

function companyFile(overrides: Partial<CompanyFile> & { id: string; name: string }): CompanyFile {
  return {
    companyId: "company-1",
    folderId: null,
    slug: overrides.id,
    folderPath: "",
    createdByName: null,
    updatedByName: null,
    contentType: "application/pdf",
    byteSize: 2048,
    audienceKind: "company",
    audienceId: null,
    validUntil: null,
    contextRole: null,
    currentVersionId: null,
    currentVersionNumber: 1,
    versionCount: 1,
    createdByUserId: "user-1",
    updatedByUserId: null,
    contentPath: `/api/company-files/${overrides.id}/content`,
    downloadPath: `/api/company-files/${overrides.id}/content?download=1`,
    usedInIssueCount: 2,
    agentVisible: true,
    thumbnailPath: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    ...overrides,
  };
}

function memberships(overrides: Partial<ResourceMemberships> = {}): ResourceMemberships {
  return {
    projectMemberships: {},
    agentMemberships: {},
    starredProjectIds: [],
    starredAgentIds: [],
    starredDocumentIds: [],
    projectStarredAt: {},
    agentStarredAt: {},
    documentStarredAt: {},
    updatedAt: null,
    starredCompanyFileIds: [],
    companyFileStarredAt: {},
    starredArtifactRefs: [],
    artifactStarredAt: {},
    ...overrides,
  };
}

function treeNode(overrides: Partial<CompanyArtifactTreeNode> & { id: string; label: string }): CompanyArtifactTreeNode {
  return {
    kind: "project",
    projectId: null,
    issueId: null,
    issueIdentifier: null,
    count: 0,
    totalByteSize: 0,
    updatedAt: null,
    mediaKinds: [],
    hasChildren: false,
    ...overrides,
  };
}

const marca = folder({ id: "f-marca", name: "Marca", fileCount: 1 });
const precios = folder({ id: "f-precios", name: "Precios", fileCount: 0 });
const guia = companyFile({ id: "file-1", name: "guia.pdf", createdByName: "Ana Pérez" });

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

function row(container: HTMLElement, id: string): HTMLTableRowElement | null {
  return container.querySelector(`tr[data-explorer-item="${id}"]`);
}

function clickSegment(container: HTMLElement, label: string) {
  const button = container.querySelector(`button[aria-pressed][aria-label="${label}"]`) as HTMLButtonElement;
  button.click();
}

function renderExplorer(container: HTMLDivElement, initialEntries: string[] = ["/artifacts"]): Root {
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  flushSync(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <ArtifactsExplorer />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return root;
}

describe("ArtifactsExplorer", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    breadcrumbState.setBreadcrumbs.mockReset();
    companyFilesApiMock.tree.mockReset().mockResolvedValue([marca, precios]);
    companyFilesApiMock.list.mockReset().mockResolvedValue({ folder: null, folders: [marca, precios], files: [guia] });
    companyFilesApiMock.versions.mockReset().mockResolvedValue([]);
    companyFilesApiMock.usage.mockReset().mockResolvedValue([]);
    companyFilesApiMock.updateFolder.mockReset().mockResolvedValue(undefined);
    membershipsApiMock.listMine.mockReset().mockResolvedValue(memberships());
    membershipsApiMock.updateCompanyFile.mockReset().mockResolvedValue({
      resourceType: "project",
      resourceId: "file-1",
      state: "joined",
      starredAt: new Date(),
      updatedAt: new Date(),
    });
    artifactsApiMock.tree.mockReset().mockImplementation(async (_companyId: string, node: string) => {
      if (node === "root") {
        return {
          node: treeNode({ id: "root", label: "Salida", kind: "root", hasChildren: true }),
          children: [
            treeNode({ id: "projects", label: "Proyectos", kind: "projects", count: 4, hasChildren: true }),
            treeNode({ id: "no_project", label: "Sin proyecto", kind: "no_project", count: 0 }),
          ],
        };
      }
      return { node: treeNode({ id: node, label: node }), children: [] };
    });
    artifactsApiMock.list.mockReset().mockResolvedValue({ artifacts: [], groups: [], nextCursor: null });
    contextApiMock.list.mockReset().mockResolvedValue({ folders: [], files: [], truncated: false });
    projectsApiMock.list.mockReset().mockResolvedValue([{ id: "project-1", name: "Proyecto Uno" }]);
  });

  afterEach(() => {
    if (root) flushSync(() => root?.unmount());
    root = null;
    container.remove();
  });

  it("renders the Entrada root folders from the company files tree", async () => {
    root = renderExplorer(container);

    await waitForAssertion(() => {
      expect(companyFilesApiMock.list).toHaveBeenCalled();
      expect(row(container, "folder:f-marca")?.textContent).toContain("Marca");
      expect(row(container, "folder:f-precios")?.textContent).toContain("Precios");
      expect(container.querySelector('nav[aria-label]')?.textContent).toContain("Entrada");
    });
  });

  it("switches to Salida and lists the tree children of the root", async () => {
    root = renderExplorer(container);
    await waitForAssertion(() => expect(row(container, "folder:f-marca")).not.toBeNull());

    clickSegment(container, "Salida");

    await waitForAssertion(() => {
      expect(artifactsApiMock.tree).toHaveBeenCalledWith("company-1", "root");
      expect(row(container, "node:projects")?.textContent).toContain("Proyectos");
      expect(row(container, "node:no_project")?.textContent).toContain("Sin proyecto");
    });
  });

  it("shows the preview pane with the selected file", async () => {
    root = renderExplorer(container);
    await waitForAssertion(() => expect(row(container, "file:file-1")).not.toBeNull());

    row(container, "file:file-1")!.click();

    await waitForAssertion(() => {
      const preview = container.querySelector('aside[aria-label="Vista previa"]');
      expect(preview).not.toBeNull();
      expect(preview?.querySelector("h3")?.textContent).toBe("guia.pdf");
    });
  });

  it("toggles the sort direction when a column header is clicked", async () => {
    root = renderExplorer(container);
    await waitForAssertion(() => expect(row(container, "folder:f-marca")).not.toBeNull());

    const nameHeader = () =>
      [...container.querySelectorAll("th")].find((th) => th.textContent?.startsWith("Nombre")) as HTMLTableCellElement;
    expect(nameHeader().getAttribute("aria-sort")).toBe("ascending");

    (nameHeader().querySelector("button") as HTMLButtonElement).click();

    await waitForAssertion(() => expect(nameHeader().getAttribute("aria-sort")).toBe("descending"));
  });

  it("moves the selection with ArrowDown", async () => {
    root = renderExplorer(container);
    await waitForAssertion(() => expect(row(container, "folder:f-marca")).not.toBeNull());

    row(container, "folder:f-marca")!.click();
    await waitForAssertion(() => expect(row(container, "folder:f-marca")?.getAttribute("aria-selected")).toBe("true"));

    const region = container.querySelector('[role="region"]') as HTMLElement;
    region.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    await waitForAssertion(() => {
      expect(row(container, "folder:f-precios")?.getAttribute("aria-selected")).toBe("true");
      expect(row(container, "folder:f-marca")?.getAttribute("aria-selected")).toBe("false");
    });
  });

  it("opens the context menu on right click", async () => {
    root = renderExplorer(container);
    await waitForAssertion(() => expect(row(container, "file:file-1")).not.toBeNull());

    row(container, "file:file-1")!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }),
    );

    await waitForAssertion(() => {
      const menu = container.querySelector('[role="menu"]');
      expect(menu).not.toBeNull();
      const labels = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].map((item) => item.textContent ?? "");
      expect(labels.some((label) => label.includes("Reemplazar por versión nueva"))).toBe(true);
      expect(labels.some((label) => label.includes("Borrar"))).toBe(true);
    });
  });

  it("shows who uploaded the file in the Subido por column", async () => {
    root = renderExplorer(container);
    await waitForAssertion(() => {
      expect(row(container, "file:file-1")?.textContent).toContain("Ana Pérez");
    });
  });

  it("requests starred files across the whole Entrada for the favorites view", async () => {
    root = renderExplorer(container, ["/artifacts/in/favorites"]);

    await waitForAssertion(() => {
      expect(companyFilesApiMock.list).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ scope: "all", starred: true }),
      );
      expect(container.querySelector('nav[aria-label]')?.textContent).toContain("Favoritos");
    });
  });

  it("requests the most recent files first for the recent view", async () => {
    root = renderExplorer(container, ["/artifacts/in/recent"]);

    await waitForAssertion(() => {
      expect(companyFilesApiMock.list).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ scope: "all", sort: "date", dir: "desc" }),
      );
    });
  });

  it("requests only the viewer's uploads for the mine view", async () => {
    root = renderExplorer(container, ["/artifacts/in/mine"]);

    await waitForAssertion(() => {
      expect(companyFilesApiMock.list).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ scope: "all", createdByMe: true }),
      );
    });
  });

  it("requests starred Salida artifacts for the Salida favorites view", async () => {
    root = renderExplorer(container, ["/artifacts/out/favorites"]);

    await waitForAssertion(() => {
      expect(artifactsApiMock.list).toHaveBeenCalledWith("company-1", expect.objectContaining({ starred: true }));
    });
  });

  it("marks starred files with a star in the name cell", async () => {
    membershipsApiMock.listMine.mockResolvedValue(memberships({ starredCompanyFileIds: ["file-1"] }));
    root = renderExplorer(container);

    await waitForAssertion(() => {
      expect(row(container, "file:file-1")?.textContent).toContain("★");
      expect(row(container, "folder:f-marca")?.textContent).not.toContain("★");
    });
  });

  it("stars a file from the preview pane through the memberships endpoint", async () => {
    root = renderExplorer(container);
    await waitForAssertion(() => expect(row(container, "file:file-1")).not.toBeNull());
    row(container, "file:file-1")!.click();

    const starButton = () =>
      [...container.querySelectorAll('aside[aria-label="Vista previa"] button')].find((button) =>
        button.textContent?.includes("Favorito"),
      ) as HTMLButtonElement | undefined;

    await waitForAssertion(() => expect(starButton()?.textContent).toBe("☆ Favorito"));
    starButton()!.click();

    await waitForAssertion(() => {
      expect(membershipsApiMock.updateCompanyFile).toHaveBeenCalledWith("company-1", "file-1", { starred: true });
    });
  });

  it("lists the tasks that use the file in the preview pane", async () => {
    companyFilesApiMock.usage.mockResolvedValue([
      { issueId: "i-1", issueIdentifier: "COS-1", issueTitle: "Uno", agentId: null, agentName: null, lastReadAt: new Date(), readCount: 1 },
      { issueId: "i-2", issueIdentifier: "COS-2", issueTitle: "Dos", agentId: null, agentName: null, lastReadAt: new Date(), readCount: 1 },
    ]);
    root = renderExplorer(container);
    await waitForAssertion(() => expect(row(container, "file:file-1")).not.toBeNull());
    row(container, "file:file-1")!.click();

    await waitForAssertion(() => {
      const preview = container.querySelector('aside[aria-label="Vista previa"]');
      expect(preview?.textContent).toContain("COS-1");
      expect(preview?.textContent).toContain("COS-2");
    });
  });

  describe("ZIP downloads, folder visibility and thumbnails", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function captureAnchorClicks() {
      const clicks: Array<{ href: string | null; download: string }> = [];
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push({ href: this.getAttribute("href"), download: this.download });
      });
      return clicks;
    }

    function stubArchiveStatus(status: number) {
      const fetchMock = vi.fn(async () => ({ ok: status >= 200 && status < 300, status }) as Response);
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    function openContextMenu(element: HTMLElement) {
      element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }));
    }

    function menuItem(label: string): HTMLElement | undefined {
      return [...container.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')].find((item) =>
        item.textContent?.includes(label),
      );
    }

    function toolbarButton(label: string): HTMLButtonElement | undefined {
      return [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);
    }

    it("downloads an Entrada folder as a ZIP after a HEAD check", async () => {
      const fetchMock = stubArchiveStatus(200);
      const clicks = captureAnchorClicks();
      root = renderExplorer(container);
      await waitForAssertion(() => expect(row(container, "folder:f-marca")).not.toBeNull());

      openContextMenu(row(container, "folder:f-marca")!);
      await waitForAssertion(() => expect(menuItem("Descargar carpeta (ZIP)")).toBeDefined());
      menuItem("Descargar carpeta (ZIP)")!.click();

      await waitForAssertion(() => {
        expect(clicks).toEqual([{ href: "/api/company-files/folders/f-marca/archive", download: "Marca.zip" }]);
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/company-files/folders/f-marca/archive",
        expect.objectContaining({ method: "HEAD" }),
      );
    });

    it("shows a status notice instead of downloading when the folder is empty (422)", async () => {
      stubArchiveStatus(422);
      const clicks = captureAnchorClicks();
      root = renderExplorer(container);
      await waitForAssertion(() => expect(row(container, "folder:f-marca")).not.toBeNull());

      openContextMenu(row(container, "folder:f-marca")!);
      await waitForAssertion(() => expect(menuItem("Descargar carpeta (ZIP)")).toBeDefined());
      menuItem("Descargar carpeta (ZIP)")!.click();

      await waitForAssertion(() => expect(container.textContent).toContain("No hay archivos que descargar aquí."));
      expect(clicks).toHaveLength(0);
    });

    it("shows a status notice when the folder is over 500 MB (413)", async () => {
      stubArchiveStatus(413);
      const clicks = captureAnchorClicks();
      root = renderExplorer(container);
      await waitForAssertion(() => expect(row(container, "folder:f-marca")).not.toBeNull());

      openContextMenu(row(container, "folder:f-marca")!);
      await waitForAssertion(() => expect(menuItem("Descargar carpeta (ZIP)")).toBeDefined());
      menuItem("Descargar carpeta (ZIP)")!.click();

      await waitForAssertion(() =>
        expect(container.textContent).toContain("La carpeta supera los 500 MB y no se puede descargar como ZIP."),
      );
      expect(clicks).toHaveLength(0);
    });

    it("downloads the open Salida project node from the toolbar when nothing is selected", async () => {
      const fetchMock = stubArchiveStatus(200);
      const clicks = captureAnchorClicks();
      artifactsApiMock.tree.mockImplementation(async (_companyId: string, node: string) => ({
        node: treeNode({ id: node, label: node === "project:p-1" ? "Proyecto Uno" : node, kind: "project" }),
        children: [],
      }));
      root = renderExplorer(container, [`/artifacts/out/${encodeURIComponent("project:p-1")}`]);

      await waitForAssertion(() => expect(toolbarButton("Descargar")?.disabled).toBe(false));
      toolbarButton("Descargar")!.click();

      const archive = "/api/companies/company-1/artifacts/archive?node=project%3Ap-1";
      await waitForAssertion(() => {
        // Named after the open crumb; the server's Content-Disposition sets the final name.
        expect(clicks).toEqual([{ href: archive, download: "Proyecto.zip" }]);
      });
      expect(fetchMock).toHaveBeenCalledWith(archive, expect.objectContaining({ method: "HEAD" }));
    });

    it("offers the ZIP on a Salida project node in the context menu", async () => {
      stubArchiveStatus(200);
      const clicks = captureAnchorClicks();
      artifactsApiMock.tree.mockImplementation(async (_companyId: string, node: string) =>
        node === "root"
          ? {
              node: treeNode({ id: "root", label: "Salida", kind: "root", hasChildren: true }),
              children: [treeNode({ id: "project:p-1", label: "Proyecto Uno", kind: "project", count: 2 })],
            }
          : { node: treeNode({ id: node, label: node }), children: [] },
      );
      root = renderExplorer(container, ["/artifacts/out"]);
      await waitForAssertion(() => expect(row(container, "node:project:p-1")).not.toBeNull());

      openContextMenu(row(container, "node:project:p-1")!);
      await waitForAssertion(() => expect(menuItem("Descargar carpeta (ZIP)")).toBeDefined());
      menuItem("Descargar carpeta (ZIP)")!.click();

      await waitForAssertion(() => {
        expect(clicks).toEqual([
          { href: "/api/companies/company-1/artifacts/archive?node=project%3Ap-1", download: "Proyecto Uno.zip" },
        ]);
      });
    });

    it("toggles a folder's visibility for agents from the context menu", async () => {
      root = renderExplorer(container);
      await waitForAssertion(() => expect(row(container, "folder:f-marca")).not.toBeNull());

      openContextMenu(row(container, "folder:f-marca")!);
      await waitForAssertion(() => {
        const item = menuItem("Visible para los agentes");
        expect(item?.getAttribute("role")).toBe("menuitemcheckbox");
        expect(item?.getAttribute("aria-checked")).toBe("true");
      });
      menuItem("Visible para los agentes")!.click();

      await waitForAssertion(() => {
        expect(companyFilesApiMock.updateFolder).toHaveBeenCalledWith("f-marca", { agentVisible: false });
      });
    });

    it("toggles a folder's visibility from the preview pane switch", async () => {
      root = renderExplorer(container);
      await waitForAssertion(() => expect(row(container, "folder:f-precios")).not.toBeNull());
      row(container, "folder:f-precios")!.click();

      const switchButton = () =>
        container.querySelector('aside[aria-label="Vista previa"] button[role="switch"]') as HTMLButtonElement | null;
      await waitForAssertion(() => expect(switchButton()?.getAttribute("aria-checked")).toBe("true"));

      switchButton()!.click();

      await waitForAssertion(() => {
        expect(companyFilesApiMock.updateFolder).toHaveBeenCalledWith("f-precios", { agentVisible: false });
      });
    });

    it("marks hidden folders with an eye-off icon in the tree and the list", async () => {
      const hidden = folder({ id: "f-hidden", name: "Interna", agentVisible: false });
      companyFilesApiMock.tree.mockResolvedValue([marca, hidden]);
      companyFilesApiMock.list.mockResolvedValue({ folder: null, folders: [marca, hidden], files: [guia] });
      root = renderExplorer(container);

      await waitForAssertion(() => {
        expect(row(container, "folder:f-hidden")?.querySelector('[aria-label="Oculto para agentes"]')).not.toBeNull();
        expect(row(container, "folder:f-marca")?.querySelector('[aria-label="Oculto para agentes"]')).toBeNull();
        // One marker in the tree and one in the list row.
        expect(container.querySelectorAll('[aria-label="Oculto para agentes"]').length).toBeGreaterThanOrEqual(2);
      });
    });

    it("shows that a file under a hidden folder is hidden from agents in the preview meta", async () => {
      const hiddenFile = companyFile({ id: "file-2", name: "interno.pdf", agentVisible: false });
      companyFilesApiMock.list.mockResolvedValue({ folder: null, folders: [marca, precios], files: [hiddenFile] });
      root = renderExplorer(container);
      await waitForAssertion(() => expect(row(container, "file:file-2")).not.toBeNull());

      row(container, "file:file-2")!.click();

      await waitForAssertion(() => {
        expect(container.querySelector('aside[aria-label="Vista previa"]')?.textContent).toContain("Oculto para agentes");
      });
    });

    it("uses the server thumbnail in the list when one exists and the type icon otherwise", async () => {
      const withThumb = companyFile({
        id: "file-3",
        name: "foto.png",
        contentType: "image/png",
        thumbnailPath: "/api/company-files/file-3/thumbnail",
      });
      companyFilesApiMock.list.mockResolvedValue({ folder: null, folders: [], files: [withThumb, guia] });
      root = renderExplorer(container);

      await waitForAssertion(() => {
        expect(row(container, "file:file-3")?.querySelector("img")?.getAttribute("src")).toBe(
          "/api/company-files/file-3/thumbnail",
        );
        expect(row(container, "file:file-1")?.querySelector("img")).toBeNull();
      });
    });
  });
  describe("context view (?context=1)", () => {
    const oferta = companyFile({ id: "ctx-offer", name: "oferta.md", contextRole: "offer" });
    const marcaVieja = companyFile({ id: "ctx-brand", name: "marca-vieja.md", contextRole: "brand", validUntil: new Date("2020-01-01") });
    const proyecto = companyFile({ id: "ctx-proj", name: "guion-proyecto.md", contextRole: "procedure", audienceKind: "project", audienceId: "project-1" });

    beforeEach(() => {
      companyFilesApiMock.list.mockReset().mockResolvedValue({ folder: null, folders: [], files: [guia, oferta, marcaVieja, proyecto] });
    });

    it("lists only files with a context role, across the whole Entrada, with expired ones marked by the filters", async () => {
      root = renderExplorer(container, ["/artifacts?context=1"]);

      await waitForAssertion(() => {
        expect(companyFilesApiMock.list).toHaveBeenCalledWith("company-1", expect.objectContaining({ scope: "all" }));
        expect(row(container, "file:ctx-offer")).not.toBeNull();
        expect(row(container, "file:ctx-brand")).not.toBeNull();
        expect(row(container, "file:ctx-proj")).not.toBeNull();
      });
      expect(row(container, "file:file-1")).toBeNull();
      expect(row(container, "folder:f-marca")).toBeNull();
    });

    it("narrows to expired files and to a project audience from the URL", async () => {
      root = renderExplorer(container, ["/artifacts?context=1&validity=expired"]);
      await waitForAssertion(() => expect(row(container, "file:ctx-brand")).not.toBeNull());
      expect(row(container, "file:ctx-offer")).toBeNull();
      expect(contextApiMock.list).toHaveBeenCalledWith("company-1", undefined, true);

      flushSync(() => root?.unmount());
      root = renderExplorer(container, ["/artifacts?context=1&projectId=project-1"]);
      await waitForAssertion(() => expect(row(container, "file:ctx-proj")).not.toBeNull());
      expect(row(container, "file:ctx-offer")).toBeNull();
    });

    it("shows the agent-view truncation note", async () => {
      contextApiMock.list.mockResolvedValue({ folders: [], files: [], truncated: true });
      root = renderExplorer(container, ["/artifacts?context=1"]);
      await waitForAssertion(() => expect(container.textContent).toContain("resultados limitados"));
    });

    it("is off by default and does not call the context endpoints", async () => {
      companyFilesApiMock.list.mockResolvedValue({ folder: null, folders: [marca, precios], files: [guia] });
      root = renderExplorer(container);
      await waitForAssertion(() => expect(row(container, "folder:f-marca")).not.toBeNull());
      expect(contextApiMock.list).not.toHaveBeenCalled();
      expect(projectsApiMock.list).not.toHaveBeenCalled();
    });
  });
});
