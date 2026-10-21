import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

// Company files (Entrada). Auth comes from the same environment as other agent
// commands: PAPERCLIP_API_URL, PAPERCLIP_API_KEY and PAPERCLIP_COMPANY_ID.

interface CompanyFileRow {
  id: string;
  name: string;
  contentType: string;
  byteSize: number;
  currentVersionNumber: number | null;
  folderId: string | null;
}

interface CompanyFilesListBody {
  files: CompanyFileRow[];
}

interface FolderNode {
  id: string;
  name: string;
  children: FolderNode[];
}

interface FilesListOptions extends BaseClientOptions {
  companyId?: string;
  folder?: string;
  q?: string;
}

interface FilesDownloadOptions extends BaseClientOptions {
  out: string;
  version?: string;
}

export function registerFilesCommands(program: Command): void {
  const files = program.command("files").description("Company files (Entrada)");

  addCommonClientOptions(
    files
      .command("list")
      .description("List company files with their path, type, size, version and id")
      .option("--folder <id>", "Only files directly inside this folder ID")
      .option("--q <text>", "Filter by file name")
      .action(async (opts: FilesListOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const companyId = ctx.companyId ?? "";
          const params = new URLSearchParams();
          if (opts.folder) params.set("folderId", opts.folder);
          if (opts.q) params.set("q", opts.q);
          const query = params.toString();
          const body = await ctx.api.get<CompanyFilesListBody>(
            `${apiPath`/api/companies/${companyId}/files`}${query ? `?${query}` : ""}`,
          );
          const tree = (await ctx.api.get<FolderNode[]>(apiPath`/api/companies/${companyId}/files/tree`)) ?? [];
          const folderPaths = new Map<string, string>();
          const walk = (nodes: FolderNode[], prefix: string) => {
            for (const node of nodes) {
              const path = prefix ? `${prefix}/${node.name}` : node.name;
              folderPaths.set(node.id, path);
              walk(node.children ?? [], path);
            }
          };
          walk(tree, "");
          const rows = (body?.files ?? []).map((file) => ({
            path: [folderPaths.get(file.folderId ?? "") ?? "", file.name].filter(Boolean).join("/"),
            type: file.contentType,
            size: formatBytes(file.byteSize),
            version: file.currentVersionNumber ? `v${file.currentVersionNumber}` : "v1",
            fileId: file.id,
          }));
          if (ctx.json) {
            console.log(JSON.stringify(rows, null, 2));
            return;
          }
          printTable(rows, ["path", "type", "size", "version", "fileId"]);
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: true },
  );

  addCommonClientOptions(
    files
      .command("download")
      .description("Download a company file's bytes to a local path")
      .argument("<fileId>", "Company file ID")
      .requiredOption("--out <path>", "Output file path")
      .option("--version <n>", "Version number; defaults to the current version")
      .action(async (fileId: string, opts: FilesDownloadOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const version = opts.version !== undefined ? Number(opts.version) : undefined;
          if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
            throw new Error("--version must be a positive integer");
          }
          const path = apiPath`/api/company-files/${fileId}/content`;
          const url = new URL(ctx.api.apiBase);
          url.pathname = `${url.pathname.replace(/\/+$/, "")}${path}`;
          if (version !== undefined) url.searchParams.set("version", String(version));
          const response = await fetch(url, {
            headers: ctx.api.apiKey ? { authorization: `Bearer ${ctx.api.apiKey}` } : undefined,
          });
          if (!response.ok) {
            const text = await response.text();
            throw new Error(`Download failed with HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
          }
          const bytes = Buffer.from(await response.arrayBuffer());
          await writeFile(opts.out, bytes);
          if (ctx.json) console.log(JSON.stringify({ out: opts.out, bytes: bytes.byteLength }, null, 2));
          else console.log(`Wrote ${bytes.byteLength} byte(s) to ${opts.out}`);
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printTable(rows: Record<string, string>[], columns: string[]): void {
  if (rows.length === 0) {
    console.log("(no files)");
    return;
  }
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => row[column]!.length)));
  console.log(columns.map((column, i) => column.padEnd(widths[i]!)).join("  "));
  for (const row of rows) {
    console.log(columns.map((column, i) => row[column]!.padEnd(widths[i]!)).join("  "));
  }
}
