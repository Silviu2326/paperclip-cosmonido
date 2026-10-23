// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CompanyFile } from "@/api/company-files";
import { FileContextProperties } from "./FileContextProperties";

const mocks = vi.hoisted(() => ({ update: vi.fn(), projects: vi.fn() }));

vi.mock("@/i18n", () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }),
}));
vi.mock("@/api/company-files", () => ({ companyFilesApi: { update: mocks.update } }));
vi.mock("@/api/projects", () => ({ projectsApi: { list: mocks.projects } }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function baseFile(overrides: Partial<CompanyFile> = {}): CompanyFile {
  return { id: "file-1", contextRole: null, audienceKind: "company", audienceId: null, validUntil: null, ...overrides } as CompanyFile;
}

async function render(file: CompanyFile) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}><FileContextProperties companyId="company-1" file={file} /></QueryClientProvider>);
  });
}

async function open() {
  const details = container.querySelector("details")!;
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.update.mockResolvedValue({});
  mocks.projects.mockResolvedValue([{ id: "project-1", name: "Proyecto Uno" }]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it("stays closed and fetches no projects until opened", async () => {
  await render(baseFile());
  expect(container.querySelector("details")?.open).toBe(false);
  expect(mocks.projects).not.toHaveBeenCalled();
  await open();
  expect(container.querySelector("button[type=submit]")).not.toBeNull();
});

it("saves only after a change and sends the chosen role", async () => {
  await render(baseFile());
  await open();
  const submit = () => container.querySelector("button[type=submit]") as HTMLButtonElement;
  expect(submit().disabled).toBe(true);
  await choose(container.querySelector("select")!, "brand");
  expect(submit().disabled).toBe(false);
  await act(async () => { submit().click(); });
  expect(mocks.update).toHaveBeenCalledWith("file-1", expect.objectContaining({ contextRole: "brand", audienceKind: "company", audienceId: null, validUntil: null }));
});

it("does not rewrite a customer audience when only the role changes", async () => {
  await render(baseFile({ audienceKind: "customer", audienceId: "customer-1", contextRole: "customer" }));
  await open();
  await choose(container.querySelector("select")!, "offer");
  await act(async () => { (container.querySelector("button[type=submit]") as HTMLButtonElement).click(); });
  const payload = mocks.update.mock.calls[0]![1];
  expect(payload).toEqual(expect.objectContaining({ contextRole: "offer" }));
  expect(payload).not.toHaveProperty("audienceKind");
  expect(payload).not.toHaveProperty("audienceId");
});
