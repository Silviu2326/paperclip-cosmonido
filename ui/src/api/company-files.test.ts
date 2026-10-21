import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  postForm: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./client", () => ({
  api: mockApi,
  ApiError: class ApiError extends Error {},
}));

import {
  buildCompanyFilesQuery,
  companyFileContentPath,
  companyFileDownloadPath,
  companyFilesApi,
} from "./company-files";

describe("buildCompanyFilesQuery", () => {
  it("returns an empty string without params", () => {
    expect(buildCompanyFilesQuery()).toBe("");
    expect(buildCompanyFilesQuery({})).toBe("");
  });

  it("serializes folder, search, sort and direction", () => {
    expect(
      buildCompanyFilesQuery({ folderId: "f-1", q: "budget 2026", sort: "size", dir: "desc" }),
    ).toBe("?folderId=f-1&q=budget+2026&sort=size&dir=desc");
  });

  it("skips empty folder and search values", () => {
    expect(buildCompanyFilesQuery({ folderId: "", q: "" })).toBe("");
  });

  it("serializes the quick-access scope, uploader and starred filters", () => {
    expect(buildCompanyFilesQuery({ scope: "all", starred: true })).toBe("?scope=all&starred=true");
    expect(buildCompanyFilesQuery({ scope: "all", createdByMe: true })).toBe("?scope=all&createdByMe=true");
  });

  it("omits false quick-access flags", () => {
    expect(buildCompanyFilesQuery({ createdByMe: false, starred: false })).toBe("");
  });
});

describe("companyFilesApi.list and tree", () => {
  beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.get.mockResolvedValue({ folder: null, folders: [], files: [] });
  });

  it("calls the company files endpoint without a query when no params are given", async () => {
    await companyFilesApi.list("company-1");
    expect(mockApi.get).toHaveBeenCalledWith("/companies/company-1/files");
  });

  it("passes folder, search, sort and dir through the query string", async () => {
    await companyFilesApi.list("company-1", { folderId: "f-1", q: "plan", sort: "usedBy", dir: "asc" });
    expect(mockApi.get).toHaveBeenCalledWith(
      "/companies/company-1/files?folderId=f-1&q=plan&sort=usedBy&dir=asc",
    );
  });

  it("sends scope, starred and createdByMe for quick-access views", async () => {
    await companyFilesApi.list("company-1", { scope: "all", starred: true });
    expect(mockApi.get).toHaveBeenLastCalledWith("/companies/company-1/files?scope=all&starred=true");

    await companyFilesApi.list("company-1", { scope: "all", sort: "date", dir: "desc", createdByMe: true });
    expect(mockApi.get).toHaveBeenLastCalledWith(
      "/companies/company-1/files?sort=date&dir=desc&scope=all&createdByMe=true",
    );
  });

  it("requests the folder tree for a company", async () => {
    await companyFilesApi.tree("company-1");
    expect(mockApi.get).toHaveBeenCalledWith("/companies/company-1/files/tree");
  });
});

describe("companyFileContentPath and companyFileDownloadPath", () => {
  it("builds the content path without a version", () => {
    expect(companyFileContentPath("file-1")).toBe("/api/company-files/file-1/content");
    expect(companyFileContentPath("file-1", null)).toBe("/api/company-files/file-1/content");
  });

  it("pins the content path to a version", () => {
    expect(companyFileContentPath("file-1", 3)).toBe("/api/company-files/file-1/content?version=3");
  });

  it("builds the download path with download=1", () => {
    expect(companyFileDownloadPath("file-1")).toBe("/api/company-files/file-1/content?download=1");
  });

  it("builds the download path for a specific version", () => {
    expect(companyFileDownloadPath("file-1", 2)).toBe(
      "/api/company-files/file-1/content?version=2&download=1",
    );
  });
});

describe("companyFilesApi mutations", () => {
  beforeEach(() => {
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    mockApi.post.mockReset();
    mockApi.postForm.mockReset();
    mockApi.get.mockReset();
  });

  it("patches a file with name and folder changes", async () => {
    await companyFilesApi.update("file-1", { name: "Plan.md", folderId: null });
    expect(mockApi.patch).toHaveBeenCalledWith("/company-files/file-1", { name: "Plan.md", folderId: null });
  });

  it("deletes a file", async () => {
    await companyFilesApi.remove("file-1");
    expect(mockApi.delete).toHaveBeenCalledWith("/company-files/file-1");
  });

  it("creates a folder under a parent", async () => {
    await companyFilesApi.createFolder("company-1", { name: "Contratos", parentId: "root-1" });
    expect(mockApi.post).toHaveBeenCalledWith("/companies/company-1/files/folders", {
      name: "Contratos",
      parentId: "root-1",
    });
  });

  it("updates and removes folders by id", async () => {
    await companyFilesApi.updateFolder("folder-1", { position: 2 });
    expect(mockApi.patch).toHaveBeenCalledWith("/company-files/folders/folder-1", { position: 2 });
    await companyFilesApi.removeFolder("folder-1");
    expect(mockApi.delete).toHaveBeenCalledWith("/company-files/folders/folder-1");
  });

  it("creates a file from an artifact source", async () => {
    await companyFilesApi.createFromArtifact("company-1", {
      source: "work_product",
      id: "wp-1",
      folderId: "f-1",
    });
    expect(mockApi.post).toHaveBeenCalledWith("/companies/company-1/files/from-artifact", {
      source: "work_product",
      id: "wp-1",
      folderId: "f-1",
    });
  });

  it("reads versions and usage for a file", async () => {
    await companyFilesApi.versions("file-1");
    expect(mockApi.get).toHaveBeenLastCalledWith("/company-files/file-1/versions");
    await companyFilesApi.usage("file-1");
    expect(mockApi.get).toHaveBeenLastCalledWith("/company-files/file-1/usage");
  });

  it("uploads a file as multipart with folderId when provided", async () => {
    mockApi.postForm.mockResolvedValue({ id: "file-1" });
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    await companyFilesApi.upload("company-1", file, { folderId: "f-1" });
    expect(mockApi.postForm).toHaveBeenCalledTimes(1);
    const [path, form] = mockApi.postForm.mock.calls[0] as [string, FormData];
    expect(path).toBe("/companies/company-1/files");
    expect(form.get("folderId")).toBe("f-1");
    expect(form.get("file")).toBeInstanceOf(File);
    expect((form.get("file") as File).name).toBe("hello.txt");
  });

  it("omits folderId from the multipart body when uploading to the root", async () => {
    mockApi.postForm.mockResolvedValue({ id: "file-1" });
    await companyFilesApi.upload("company-1", new File(["x"], "x.txt"));
    const [, form] = mockApi.postForm.mock.calls[0] as [string, FormData];
    expect(form.has("folderId")).toBe(false);
  });

  it("sends an optional note when adding a version", async () => {
    mockApi.postForm.mockResolvedValue({ id: "file-1" });
    await companyFilesApi.addVersion("file-1", new File(["v2"], "v2.txt"), { note: "Revisión" });
    const [path, form] = mockApi.postForm.mock.calls[0] as [string, FormData];
    expect(path).toBe("/company-files/file-1/versions");
    expect(form.get("note")).toBe("Revisión");
  });
});
