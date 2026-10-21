import { describe, expect, it } from "vitest";
import { buildPaperclipTaskMarkdown, renderCompanyFilesSection } from "./task-markdown.js";

function fakeIndex(count: number, truncated = false, total = count) {
  return {
    entries: Array.from({ length: count }, (_, i) => ({
      fileId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      path: `Marca/archivo-${i}.pdf`,
      name: `archivo-${i}.pdf`,
      contentType: "application/pdf",
      byteSize: 1024 * (i + 1),
      version: 2,
      updatedAt: "2026-10-21T10:00:00.000Z",
    })),
    truncated,
    total,
  };
}

const issue = {
  id: "task-1",
  identifier: "TEST-1",
  title: "Inspect the evidence",
};

describe("heartbeat task markdown rendering", () => {
  it("returns null without a task or a nonempty wake comment", () => {
    expect(buildPaperclipTaskMarkdown({ issue: null })).toBeNull();
    expect(buildPaperclipTaskMarkdown({
      issue: null,
      wakeComments: [{ id: "empty", body: " \n " }],
    })).toBeNull();
  });

  it("renders comment-only context in order without changing the input", () => {
    const input = {
      issue: null,
      wakeComments: [
        Object.freeze({ id: "first", body: "  First request.  " }),
        Object.freeze({ id: "empty", body: "  " }),
        Object.freeze({ id: "last", body: "\nLatest request.\n" }),
      ],
    };
    const before = structuredClone(input);
    const markdown = buildPaperclipTaskMarkdown(input)!;

    expect(markdown).toContain("Pending wake comments (oldest to newest):");
    expect(markdown.indexOf('("first")')).toBeLessThan(markdown.indexOf('("last")'));
    expect(markdown).toContain("\nFirst request.\n");
    expect(markdown).toContain("\nLatest request.\n");
    expect(markdown).not.toContain('("empty")');
    expect(input).toEqual(before);
    expect(buildPaperclipTaskMarkdown(input)).toBe(markdown);
  });

  it("quotes task scalars and keeps embedded code fences inside the description", () => {
    const description = "First line.\n````text\nQuoted instruction.\n````\nLast line.";
    const title = 'A "quoted" title\nwith a second line';
    const markdown = buildPaperclipTaskMarkdown({
      issue: { ...issue, title, description },
    });

    expect(markdown).toContain(`- Title: ${JSON.stringify(title)}`);
    expect(markdown).toContain(`Issue description:\n\`\`\`\`\`text\n${description}\n\`\`\`\`\``);
  });

  it("keeps the nearest six ancestors and reports omitted ancestor context", () => {
    const markdown = buildPaperclipTaskMarkdown({
      issue,
      ancestors: Array.from({ length: 7 }, (_, index) => ({
        id: `ancestor-${index + 1}`,
        title: `Ancestor title ${index + 1}`,
      })),
    });

    expect(markdown).toContain("- Parent: ancestor-1 Ancestor title 1");
    expect(markdown).toContain("- Ancestor 6: ancestor-6 Ancestor title 6");
    expect(markdown).not.toContain("ancestor-7");
    expect(markdown).toContain("[ancestor context truncated after 6 entries]");
  });

  it.each([true, false])("retains attachment-only wakes with hidden comment bodies (native=%s)", (nativeRunner) => {
    const contentPath = "/api/attachments/attachment-1/content";
    const markdown = buildPaperclipTaskMarkdown({
      issue: null,
      nativeRunner,
      includeWakeComments: false,
      wakeComments: [{
        id: "comment-file",
        body: "  ",
        attachments: [{
          id: "attachment-1",
          filename: "evidence.txt",
          contentType: "text/plain",
          byteSize: 42,
          contentPath,
        }],
      }],
    });

    expect(markdown).toContain('Attachments on wake comment "comment-file":');
    expect(markdown).toContain('"filename":"evidence.txt"');
    expect(markdown).toContain("Attachment directive:");
    if (nativeRunner) {
      expect(markdown).not.toContain(contentPath);
      expect(markdown).toContain("read_task_attachment");
    } else {
      expect(markdown).toContain(contentPath);
      expect(markdown).toContain("PAPERCLIP_API_KEY");
    }
  });

  it("keeps a rejected plan from granting execution through an older acceptance", () => {
    const markdown = buildPaperclipTaskMarkdown({
      issue: { ...issue, workMode: "planning" },
      acceptedPlanContinuation: true,
      interaction: { kind: "request_confirmation", status: "accepted" },
      acceptedPlan: { revisionId: "old-approved-revision", revisionNumber: 1 },
      planReview: { status: "rejected", reason: "Revise the scope.\n```\nQuoted feedback.\n```" },
    });

    expect(markdown).toContain("Rejected plan review directive:");
    expect(markdown).toContain("Make the plan only. Do not write code or perform implementation work.");
    expect(markdown).toContain("This is not approval to implement or hand off execution tasks.");
    expect(markdown).toContain("````text\nRevise the scope.");
    expect(markdown).not.toContain("Implement the accepted plan");
    expect(markdown).not.toContain("old-approved-revision");
  });

  it("renders the company files section with per-runner read instructions", () => {
    const markdown = buildPaperclipTaskMarkdown({
      issue,
      companyFiles: fakeIndex(2),
      nativeRunner: false,
    })!;
    expect(markdown).toContain("## Company files (Entrada)");
    expect(markdown).toContain('- "Marca/archivo-0.pdf" · application/pdf · 1024 B · v2 · 00000000-0000-4000-8000-000000000000');
    expect(markdown).toContain("GET $PAPERCLIP_API_URL/api/company-files/{fileId}/content");
    expect(markdown).toContain("paperclip files download <fileId> --out <safe-local-path>");
    expect(markdown).not.toContain("list_company_files");

    const native = buildPaperclipTaskMarkdown({ issue, companyFiles: fakeIndex(1), nativeRunner: true })!;
    expect(native).toContain("list_company_files");
    expect(native).toContain("read_company_file");
    expect(native).not.toContain("paperclip files download");
  });

  it("omits the company files section when the index is empty or missing", () => {
    const empty = buildPaperclipTaskMarkdown({ issue, companyFiles: { entries: [], truncated: false, total: 0 } })!;
    expect(empty).not.toContain("Company files (Entrada)");
    expect(buildPaperclipTaskMarkdown({ issue, companyFiles: null })).not.toContain("Company files (Entrada)");
    expect(renderCompanyFilesSection({ entries: [], truncated: false, total: 0 }, false)).toBeNull();
  });

  it("flags a truncated index and keeps the rendered size bounded at the cap", () => {
    const section = renderCompanyFilesSection(fakeIndex(200, true, 350), false)!;
    expect(section.join("\n")).toContain("Index shows 200 of 350 files");
    expect(section.filter((line) => line.startsWith('- "')).length).toBe(200);
    // Approximate size for 200 entries, reported in the task summary.
    const chars = section.join("\n").length;
    expect(chars).toBeGreaterThan(0);
    expect(chars).toBeLessThan(40_000);
  });
});
