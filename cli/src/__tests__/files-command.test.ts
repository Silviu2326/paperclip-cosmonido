import { Command } from "commander";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFilesCommands } from "../commands/client/files.js";

const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const FILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOLDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerFilesCommands(program);
  return program;
}

async function run(args: string[]): Promise<void> {
  await createProgram().parseAsync([...args, "--api-base", "http://localhost:3100", "--api-key", "agent-token"], { from: "user" });
}

describe("files commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.PAPERCLIP_API_KEY;
    delete process.env.PAPERCLIP_API_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lists files as a table with folder paths and filters", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { lines.push(args.join(" ")); });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/files/tree")) {
        return new Response(JSON.stringify([{ id: FOLDER_ID, name: "Marca", children: [] }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        folder: null,
        folders: [],
        files: [{ id: FILE_ID, name: "guia.pdf", contentType: "application/pdf", byteSize: 2048, currentVersionNumber: 3, folderId: FOLDER_ID }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await run(["files", "list", "--company-id", COMPANY_ID, "--folder", FOLDER_ID, "--q", "guia"]);

    expect(fetchMock.mock.calls[0]![0]).toBe(`http://localhost:3100/api/companies/${COMPANY_ID}/files?folderId=${FOLDER_ID}&q=guia`);
    const output = lines.join("\n");
    expect(output).toContain("path");
    expect(output).toContain("Marca/guia.pdf");
    expect(output).toContain("2.0 KB");
    expect(output).toContain("v3");
    expect(output).toContain(FILE_ID);
  });

  it("downloads a file version to the output path with the agent bearer token", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = await mkdtemp(join(tmpdir(), "paperclip-files-"));
    try {
      const out = join(dir, "guia.pdf");
      const fetchMock = vi.fn().mockResolvedValue(new Response(Buffer.from("%PDF-1.4"), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      await run(["files", "download", FILE_ID, "--out", out, "--version", "2"]);

      expect(fetchMock.mock.calls[0]![0].toString()).toBe(`http://localhost:3100/api/company-files/${FILE_ID}/content?version=2`);
      expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toEqual({ authorization: "Bearer agent-token" });
      expect((await readFile(out)).toString("utf8")).toBe("%PDF-1.4");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects an invalid --version before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(run(["files", "download", FILE_ID, "--out", "x.bin", "--version", "0"])).rejects.toThrow("exit");
    expect(fetchMock).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});
