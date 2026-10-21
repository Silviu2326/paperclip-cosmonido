import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  activityLog,
  agents,
  assets,
  companies,
  companyFileReads,
  companyFileVersions,
  companyFiles,
  createDb,
  folders,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "../../__tests__/helpers/embedded-postgres.js";
import type { StorageService } from "../../storage/types.js";
import { PaperclipRunnerToolAuthority } from "./paperclip-runner-tool-authority.js";

const sha = (body: Buffer) => createHash("sha256").update(body).digest("hex");

describe("native runner company files tools", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { temporary = await startEmbeddedPostgresTestDatabase("dot-company-files-"); db = createDb(temporary.connectionString); });
  afterAll(async () => { await temporary?.cleanup(); });

  // Creates a company with one run and an optional file. Bytes are served from memory.
  async function fixture(options: { enabled?: boolean; body?: Buffer; fileName?: string; contentType?: string; companyFilesRead?: boolean } = {}) {
    const enabled = options.enabled ?? true;
    const body = options.body ?? Buffer.from("contenido de la guia 🌍");
    const companyId = randomUUID(), agentId = randomUUID(), issueId = randomUUID(), runId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Entrada", issuePrefix: `E${companyId.slice(0, 6)}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "Dot", status: "active", adapterType: "paperclip_runner",
      adapterConfig: { provider: "openai_dot", dotAttachmentAccess: enabled, dotWorkspaceAccess: false } });
    await db.insert(issues).values({ id: issueId, companyId, title: "Use the guide", status: "in_progress", assigneeAgentId: agentId });
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, status: "running", runtimeMode: "native", nativeIssueId: issueId, invocationSource: "assignment", triggerDetail: "system", contextSnapshot: { issueId } });
    await db.update(issues).set({ executionRunId: runId }).where(eq(issues.id, issueId));

    const objects = new Map<string, Buffer>();
    const file = await addFile(companyId, { body, name: options.fileName ?? "guia.txt", contentType: options.contentType ?? "text/plain", objects });
    const getObject = vi.fn().mockImplementation(async (_companyId: string, key: string) => ({ stream: Readable.from([objects.get(key)!]) }));
    const storage = { provider: "local_disk", getObject, putFile: vi.fn(), deleteObject: vi.fn() } as unknown as StorageService;
    const assertBridgeAuthority = vi.fn().mockResolvedValue(undefined);
    const binding = { companyId, agentId, issueId, runId, dotRuntime: true, companyFilesRead: options.companyFilesRead ?? true, taskAttachmentRead: enabled, storage, assertBridgeAuthority };
    const authority = new PaperclipRunnerToolAuthority(db, binding);
    const call = (tool: string, args: unknown = {}) => authority.execute({ tool, callId: randomUUID(), arguments: args });
    return { ...binding, authority, call, file, objects, body };
  }

  // Inserts a company file with one current version and the backing asset row.
  async function addFile(companyId: string, input: { body: Buffer; name: string; contentType: string; objects: Map<string, Buffer>; folderId?: string | null }) {
    const objectKey = `${companyId}/company-files/${randomUUID()}-${input.name}`;
    input.objects.set(objectKey, input.body);
    const [asset] = await db.insert(assets).values({ companyId, provider: "local_disk", objectKey, originalFilename: input.name,
      contentType: input.contentType, byteSize: input.body.length, sha256: sha(input.body) }).returning();
    const [file] = await db.insert(companyFiles).values({ companyId, folderId: input.folderId ?? null, name: input.name, slug: `${input.name}-${randomUUID().slice(0, 6)}`,
      contentType: input.contentType, byteSize: input.body.length }).returning();
    const [version] = await db.insert(companyFileVersions).values({ companyId, fileId: file!.id, versionNumber: 1, assetId: asset!.id }).returning();
    await db.update(companyFiles).set({ currentVersionId: version!.id }).where(eq(companyFiles.id, file!.id));
    return { id: file!.id, versionId: version!.id, asset: asset! };
  }

  it("is on by default for native runs, independent of dotAttachmentAccess", async () => {
    const off = await fixture({ enabled: false });
    const names = off.authority.definitions().map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(["list_company_files", "read_company_file"]));
    const read = off.authority.definitions().find(t => t.name === "read_company_file") as { description: string };
    expect(read.description).toContain("model provider");
    await expect(off.call("read_company_file", { fileId: off.file.id })).resolves.toMatchObject({ fileId: off.file.id, encoding: "utf8" });
  });

  it("drops the tools and refuses calls when the binding flag is explicitly cleared", async () => {
    const killed = await fixture({ companyFilesRead: false });
    const names = killed.authority.definitions().map(t => t.name);
    expect(names).not.toContain("read_company_file");
    expect(names).not.toContain("list_company_files");
    await expect(killed.call("read_company_file", { fileId: killed.file.id })).rejects.toThrow("not enabled");
  });

  it("lists files with folder paths and pages with nextAfter", async () => {
    const f = await fixture({ fileName: "a.txt" });
    await addFile(f.companyId, { body: Buffer.from("b"), name: "b.txt", contentType: "text/plain", objects: f.objects });
    const listed = await f.call("list_company_files") as { files: Array<{ fileId: string; path: string; version: number; byteSize: number }>; nextAfter: string | null };
    expect(listed.files.map(entry => entry.path).sort()).toEqual(["a.txt", "b.txt"]);
    expect(listed.files.find(entry => entry.path === "a.txt")).toMatchObject({ version: 1, byteSize: f.body.length });
    expect(listed.nextAfter).toBeNull();
  });

  it("reads verified text, records the read and logs activity", async () => {
    const f = await fixture();
    const result = await f.call("read_company_file", { fileId: f.file.id }) as Record<string, unknown>;
    expect(result).toMatchObject({
      fileId: f.file.id,
      encoding: "utf8",
      content: "contenido de la guia 🌍",
      sha256: sha(f.body),
      nextOffset: null,
      contentTrust: "untrusted_company_file",
    });

    const reads = await db.select().from(companyFileReads).where(eq(companyFileReads.fileId, f.file.id));
    expect(reads).toEqual([expect.objectContaining({ companyId: f.companyId, issueId: f.issueId, agentId: f.agentId, runId: f.runId, versionId: f.file.versionId })]);
    const activity = await db.select().from(activityLog).where(and(eq(activityLog.companyId, f.companyId), eq(activityLog.action, "company_file.read")));
    expect(activity).toHaveLength(1);
  });

  it("does not read another company's file and reports it as not found", async () => {
    const owner = await fixture();
    const other = await fixture();
    const result = await other.call("read_company_file", { fileId: owner.file.id });
    expect(result).toMatchObject({ outcome: "failed", code: "runner_company_file_not_found" });
    expect(await db.select().from(companyFileReads).where(eq(companyFileReads.fileId, owner.file.id))).toHaveLength(0);
  });

  it("pages bytes, keeps UTF-8 boundaries, requires base64 for binary, and detects a changed version", async () => {
    const big = Buffer.from("á".repeat(9000)); // 18000 bytes, multi-byte characters
    const f = await fixture({ body: big, fileName: "largo.txt" });
    const first = await f.call("read_company_file", { fileId: f.file.id }) as any;
    expect(first.nextOffset).toBeGreaterThan(0);
    expect(first.returnedBytes).toBeLessThanOrEqual(12000);
    const second = await f.call("read_company_file", { fileId: f.file.id, offset: first.nextOffset, expectedSha256: first.sha256 }) as any;
    expect(second.content.length).toBeGreaterThan(0);
    expect(await f.call("read_company_file", { fileId: f.file.id, expectedSha256: "0".repeat(64) })).toMatchObject({ code: "runner_company_file_changed" });

    const binary = await fixture({ body: Buffer.from([0xff, 0x00, 0x01]), fileName: "bin.dat", contentType: "application/octet-stream" });
    expect(await binary.call("read_company_file", { fileId: binary.file.id })).toMatchObject({ outcome: "failed", code: "runner_company_file_use_base64" });
    expect(await binary.call("read_company_file", { fileId: binary.file.id, encoding: "base64" })).toMatchObject({ content: Buffer.from([0xff, 0x00, 0x01]).toString("base64") });
  });
  it("hides files under an agent-hidden folder (and its subfolders) from list and read, as if missing", async () => {
    const f = await fixture({ fileName: "visible.txt" });
    const [hiddenFolder] = await db.insert(folders).values({ companyId: f.companyId, kind: "company_files", name: "Privada", slug: "privada", agentVisible: false }).returning();
    const [subFolder] = await db.insert(folders).values({ companyId: f.companyId, kind: "company_files", name: "Sub", slug: "sub", parentId: hiddenFolder!.id }).returning();
    const secret = await addFile(f.companyId, { body: Buffer.from("secreto"), name: "secreto.txt", contentType: "text/plain", objects: f.objects, folderId: hiddenFolder!.id });
    const nested = await addFile(f.companyId, { body: Buffer.from("anidado"), name: "anidado.txt", contentType: "text/plain", objects: f.objects, folderId: subFolder!.id });

    const listed = await f.call("list_company_files") as { files: Array<{ fileId: string }> };
    expect(listed.files.map((entry) => entry.fileId)).toEqual([f.file.id]);
    expect(await f.call("read_company_file", { fileId: secret.id })).toMatchObject({ outcome: "failed", code: "runner_company_file_not_found" });
    expect(await f.call("read_company_file", { fileId: nested.id })).toMatchObject({ outcome: "failed", code: "runner_company_file_not_found" });
    expect(await db.select().from(companyFileReads).where(eq(companyFileReads.fileId, secret.id))).toHaveLength(0);
    expect(await f.call("read_company_file", { fileId: f.file.id })).toMatchObject({ content: "contenido de la guia 🌍" });
  });
});
