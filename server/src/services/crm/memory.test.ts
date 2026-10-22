import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { customerMemoryService, linkedCustomerIdsForRun } from "./memory.js";
import { callCustomerMemoryTool, customerMemoryToolDefinitions } from "./memory-tools.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "33333333-3333-4333-8333-333333333333";
const CONVERSATION = "88888888-8888-4888-8888-888888888888";
const ISSUE = "66666666-6666-4666-8666-666666666666";
const PROJECT = "77777777-7777-4777-8777-777777777777";

/**
 * Minimal drizzle-like double. Every builder method returns the same chain and the chain is
 * awaitable; awaiting resolves to the next scripted result for that verb. It records which
 * write verbs were used so tests can assert history (insert only) rather than overwrite.
 */
function fakeDb(script: { selects?: unknown[][]; inserts?: unknown[][]; updates?: unknown[][] } = {}) {
  const calls = { select: 0, insert: 0, update: 0, delete: 0, values: [] as unknown[], set: [] as unknown[], orderBy: 0 };
  const queues = {
    select: [...(script.selects ?? [])],
    insert: [...(script.inserts ?? [])],
    update: [...(script.updates ?? [])],
  };
  const builder = (verb: "select" | "insert" | "update") => {
    const chain: Record<string, unknown> = {};
    const passthrough = ["from", "where", "returning", "limit"];
    for (const m of passthrough) chain[m] = () => chain;
    chain.values = (v: unknown) => { calls.values.push(v); return chain; };
    chain.set = (v: unknown) => { calls.set.push(v); return chain; };
    chain.orderBy = () => { calls.orderBy += 1; return chain; };
    chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(queues[verb].shift() ?? []).then(onOk, onErr);
    return chain;
  };
  const db = {
    select: () => { calls.select += 1; return builder("select"); },
    insert: () => { calls.insert += 1; return builder("insert"); },
    update: () => { calls.update += 1; return builder("update"); },
    delete: () => { calls.delete += 1; throw new Error("history must never delete"); },
  };
  return { db: db as unknown as Db, calls };
}

const note = (overrides: Record<string, unknown> = {}) => ({
  id: "99999999-9999-4999-8999-999999999999",
  companyId: COMPANY,
  customerId: CUSTOMER,
  key: "preferencias",
  content: "Prefiere correo",
  source: "user",
  archivedAt: null,
  ...overrides,
});

describe("customerMemoryService history", () => {
  it("append inserts a new row and never updates or deletes existing notes", async () => {
    const { db, calls } = fakeDb({ inserts: [[note({ content: "primera" })], [note({ content: "corrección" })]] });
    const svc = customerMemoryService(db);
    await svc.append(COMPANY, CUSTOMER, { key: "preferencias", content: "primera", source: "user" });
    await svc.append(COMPANY, CUSTOMER, { key: "preferencias", content: "corrección", source: "user" });
    expect(calls.insert).toBe(2);
    expect(calls.update).toBe(0);
    expect(calls.delete).toBe(0);
    expect(calls.values).toEqual([
      expect.objectContaining({ key: "preferencias", content: "primera", source: "user", companyId: COMPANY, customerId: CUSTOMER }),
      expect.objectContaining({ key: "preferencias", content: "corrección", source: "user" }),
    ]);
  });

  it("append with a repeated idempotency key returns the existing note without inserting", async () => {
    const existing = note({ idempotencyKey: "k-1" });
    const { db, calls } = fakeDb({ selects: [[existing]] });
    const svc = customerMemoryService(db);
    const result = await svc.append(COMPANY, CUSTOMER, { key: "k", content: "c", source: "agent", idempotencyKey: "k-1" });
    expect(result).toBe(existing);
    expect(calls.insert).toBe(0);
  });

  it("get reads active notes ordered by key and date", async () => {
    const rows = [note({ content: "a" }), note({ content: "b" })];
    const { db, calls } = fakeDb({ selects: [rows] });
    const result = await customerMemoryService(db).get(COMPANY, CUSTOMER);
    expect(result).toEqual(rows);
    expect(calls.orderBy).toBe(1);
  });

  it("archive sets archived_at with an update and returns null when the note is absent or already archived", async () => {
    const archived = note({ archivedAt: new Date() });
    const { db, calls } = fakeDb({ updates: [[archived], []] });
    const svc = customerMemoryService(db);
    expect(await svc.archive(COMPANY, note().id)).toBe(archived);
    expect(calls.set[0]).toEqual(expect.objectContaining({ archivedAt: expect.any(Date) }));
    expect(await svc.archive(COMPANY, note().id)).toBeNull();
    expect(calls.delete).toBe(0);
  });
});

describe("linkedCustomerIdsForRun isolation", () => {
  it("returns no customer when the run has neither a conversation nor a task", async () => {
    const { db, calls } = fakeDb();
    expect(await linkedCustomerIdsForRun(db, { companyId: COMPANY, contextSnapshot: {} })).toEqual([]);
    expect(await linkedCustomerIdsForRun(db, { companyId: COMPANY, contextSnapshot: null })).toEqual([]);
    expect(calls.select).toBe(0);
  });

  it("returns the customer of the run's task project, scoped to the company", async () => {
    const { db } = fakeDb({ selects: [[{ projectId: PROJECT }], [{ customerId: CUSTOMER }]] });
    expect(
      await linkedCustomerIdsForRun(db, { companyId: COMPANY, contextSnapshot: null, issueId: ISSUE }),
    ).toEqual([CUSTOMER]);
  });

  it("returns no project customer when the task has no project or the project has no customer", async () => {
    const noProject = fakeDb({ selects: [[{ projectId: null }]] });
    expect(await linkedCustomerIdsForRun(noProject.db, { companyId: COMPANY, contextSnapshot: { issueId: ISSUE } })).toEqual([]);
    const unlinked = fakeDb({ selects: [[{ projectId: PROJECT }], [{ customerId: null }]] });
    expect(await linkedCustomerIdsForRun(unlinked.db, { companyId: COMPANY, contextSnapshot: { issueId: ISSUE } })).toEqual([]);
  });

  it("does not link another customer's project when the task is outside the company", async () => {
    const { db } = fakeDb({ selects: [[]] });
    expect(await linkedCustomerIdsForRun(db, { companyId: COMPANY, contextSnapshot: null, issueId: ISSUE })).toEqual([]);
  });

  it("combines the conversation customer and the project customer without duplicates", async () => {
    const OTHER = "44444444-4444-4444-8444-444444444444";
    const { db } = fakeDb({
      selects: [[{ customerId: CUSTOMER }], [{ projectId: PROJECT }], [{ customerId: OTHER }]],
    });
    expect(
      await linkedCustomerIdsForRun(db, {
        companyId: COMPANY,
        contextSnapshot: { conversationId: CONVERSATION, issueId: ISSUE },
      }),
    ).toEqual([CUSTOMER, OTHER]);
  });

  it("returns the conversation's customer when the conversation belongs to the run's company", async () => {
    const { db } = fakeDb({ selects: [[{ customerId: CUSTOMER }]] });
    expect(
      await linkedCustomerIdsForRun(db, { companyId: COMPANY, contextSnapshot: { conversationId: CONVERSATION } }),
    ).toEqual([CUSTOMER]);
  });

  it("returns no customer when the conversation is missing from the company or has no customer", async () => {
    const missing = fakeDb({ selects: [[]] });
    expect(
      await linkedCustomerIdsForRun(missing.db, { companyId: COMPANY, contextSnapshot: { conversationId: CONVERSATION } }),
    ).toEqual([]);
    const unlinked = fakeDb({ selects: [[{ customerId: null }]] });
    expect(
      await linkedCustomerIdsForRun(unlinked.db, { companyId: COMPANY, contextSnapshot: { conversationId: CONVERSATION } }),
    ).toEqual([]);
  });
});

describe("customer memory agent tools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes exactly the two memory tools with JSON schemas", () => {
    const defs = customerMemoryToolDefinitions();
    expect(defs.map((d) => d.name)).toEqual(["customer_memory_get", "customer_memory_append"]);
    for (const def of defs) expect(def.inputSchema).toMatchObject({ type: "object" });
  });

  it("calls the authenticated memory endpoint for the customer and strips customerId from the append body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "n" }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await callCustomerMemoryTool({
      name: "customer_memory_append",
      arguments: { customerId: CUSTOMER, key: "k", content: "c", idempotencyKey: "idem-1" },
      apiUrl: "http://localhost:3100/api",
      token: "tok",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://localhost:3100/api/customers/${CUSTOMER}/memory`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ key: "k", content: "c", idempotencyKey: "idem-1" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("rejects append calls without an idempotency key before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      callCustomerMemoryTool({
        name: "customer_memory_append",
        arguments: { customerId: CUSTOMER, key: "k", content: "c" },
        apiUrl: "http://localhost:3100",
        token: "tok",
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
