import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies, companyFiles, createDb, folders, type Db } from "@paperclipai/db";
import { COMPANY_FILES_INDEX_MAX_ENTRIES } from "@paperclipai/shared";
import { startEmbeddedPostgresTestDatabase, type EmbeddedPostgresTestDatabase } from "../../__tests__/helpers/embedded-postgres.js";
import { COMPANY_FILE_KIND } from "../company-files.js";
import { loadCompanyFilesIndex } from "./company-files-context.js";

let tempDb: EmbeddedPostgresTestDatabase | null = null;
let db: Db;

async function createCompany() {
  return db
    .insert(companies)
    .values({ name: `Index ${randomUUID()}`, issuePrefix: `IX${randomUUID().slice(0, 6).toUpperCase()}` })
    .returning()
    .then((rows) => rows[0]!);
}

async function createFolder(companyId: string, name: string, parentId: string | null = null) {
  return db
    .insert(folders)
    .values({ companyId, kind: COMPANY_FILE_KIND, name, slug: name.toLowerCase(), parentId })
    .returning()
    .then((rows) => rows[0]!);
}

// Bulk-inserts file rows (no versions; the index falls back to version 1). Keeps the cap test fast.
async function insertFiles(companyId: string, rows: Array<{ folderId: string | null; name: string }>) {
  await db.insert(companyFiles).values(
    rows.map((row, index) => ({
      companyId,
      folderId: row.folderId,
      name: row.name,
      slug: `${row.name}-${index}`,
      contentType: "application/pdf",
      byteSize: 1000 + index,
      updatedAt: new Date(Date.UTC(2026, 0, 1) + index * 1000),
    })),
  );
}

describe("loadCompanyFilesIndex", () => {
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-files-context-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("builds folder paths, orders newest first, excludes deleted files, and reports the version", async () => {
    const company = await createCompany();
    const brand = await createFolder(company.id, "Marca");
    const guides = await createFolder(company.id, "Guias", brand.id);
    const [, newer] = await db
      .insert(companyFiles)
      .values([
        {
          companyId: company.id,
          folderId: brand.id,
          name: "logo.pdf",
          slug: "logo.pdf",
          contentType: "application/pdf",
          byteSize: 10,
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          companyId: company.id,
          folderId: guides.id,
          name: "guia-de-estilo.pdf",
          slug: "guia-de-estilo.pdf",
          contentType: "application/pdf",
          byteSize: 20,
          updatedAt: new Date("2026-02-01T00:00:00Z"),
        },
      ])
      .returning();
    await db.insert(companyFiles).values({
      companyId: company.id,
      folderId: brand.id,
      name: "borrado.pdf",
      slug: "borrado.pdf",
      contentType: "application/pdf",
      byteSize: 5,
      deletedAt: new Date(),
    });

    const index = await loadCompanyFilesIndex(db, company.id);
    expect(index.truncated).toBe(false);
    expect(index.total).toBe(2);
    expect(index.entries.map((entry) => entry.path)).toEqual([
      "Marca/Guias/guia-de-estilo.pdf",
      "Marca/logo.pdf",
    ]);
    expect(index.entries[0]).toMatchObject({
      fileId: newer!.id,
      name: "guia-de-estilo.pdf",
      contentType: "application/pdf",
      byteSize: 20,
    });
  });

  it("caps entries at COMPANY_FILES_INDEX_MAX_ENTRIES and sets truncated with the full total", async () => {
    const company = await createCompany();
    const folder = await createFolder(company.id, "Briefs");
    const total = COMPANY_FILES_INDEX_MAX_ENTRIES + 5;
    await insertFiles(
      company.id,
      Array.from({ length: total }, (_, i) => ({ folderId: folder.id, name: `brief-${i}.pdf` })),
    );
    const index = await loadCompanyFilesIndex(db, company.id);
    expect(index.entries).toHaveLength(COMPANY_FILES_INDEX_MAX_ENTRIES);
    expect(index.truncated).toBe(true);
    expect(index.total).toBe(total);
  });

  it("leaves files under an agent-hidden folder (and its subfolders) out of the wake index and total", async () => {
    const company = await createCompany();
    const open = await createFolder(company.id, "Abierta");
    const hidden = await createFolder(company.id, "Privada");
    const hiddenChild = await createFolder(company.id, "Subcarpeta", hidden.id);
    await db.update(folders).set({ agentVisible: false }).where(eq(folders.id, hidden.id));
    await insertFiles(company.id, [
      { folderId: open.id, name: "visible.pdf" },
      { folderId: hidden.id, name: "oculto.pdf" },
      { folderId: hiddenChild.id, name: "oculto-hijo.pdf" },
      { folderId: null, name: "raiz.pdf" },
    ]);

    const index = await loadCompanyFilesIndex(db, company.id);
    expect(index.total).toBe(2);
    expect(index.entries.map((entry) => entry.name).sort()).toEqual(["raiz.pdf", "visible.pdf"]);
    expect(index.entries.map((entry) => entry.path).sort()).toEqual(["Abierta/visible.pdf", "raiz.pdf"]);
  });
});
