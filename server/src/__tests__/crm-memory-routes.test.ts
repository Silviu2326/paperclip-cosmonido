import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const COMPANY_1 = "11111111-1111-4111-8111-111111111111";
const COMPANY_2 = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_LINKED = "33333333-3333-4333-8333-333333333333";
const CUSTOMER_OTHER = "44444444-4444-4444-8444-444444444444";
const NOTE_ID = "55555555-5555-4555-8555-555555555555";
const AGENT_ID = "66666666-6666-4666-8666-666666666666";
const RUN_ID = "77777777-7777-4777-8777-777777777777";

const mockService = vi.hoisted(() => ({
  findCustomer: vi.fn(),
  get: vi.fn(),
  append: vi.fn(),
  findNote: vi.fn(),
  archive: vi.fn(),
}));

const mockLinkedCustomerIdsForRun = vi.hoisted(() => vi.fn());
const mockProjectToolContext = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("../services/crm/memory.js", () => ({
  customerMemoryService: () => mockService,
  linkedCustomerIdsForRun: mockLinkedCustomerIdsForRun,
}));

vi.mock("../services/project-tool-context.js", () => ({
  projectToolContext: mockProjectToolContext,
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
}));

const customerRow = (id: string, companyId: string) => ({ id, companyId });
const noteRow = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  companyId: COMPANY_1,
  customerId: CUSTOMER_LINKED,
  key: "preferencias",
  content: "Prefiere correo",
  source: "user",
  agentId: null,
  runId: null,
  validUntil: null,
  archivedAt: null,
  createdAt: "2026-10-22T10:00:00.000Z",
  updatedAt: "2026-10-22T10:00:00.000Z",
  ...overrides,
});

const agentActor = {
  type: "agent",
  agentId: AGENT_ID,
  companyId: COMPANY_1,
  source: "agent_jwt",
  runId: RUN_ID,
};

const boardActor = {
  type: "board",
  userId: "user-1",
  companyIds: [COMPANY_1],
  source: "session",
  isInstanceAdmin: false,
};

async function createApp(actor: Record<string, unknown>) {
  vi.resetModules();
  const [{ errorHandler }, { crmMemoryRoutes }] = await Promise.all([
    import("../middleware/index.js") as Promise<typeof import("../middleware/index.js")>,
    import("../routes/crm-memory.js") as Promise<typeof import("../routes/crm-memory.js")>,
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { ...actor };
    next();
  });
  app.use("/api", crmMemoryRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("crm memory routes: agent isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockService.findCustomer.mockImplementation(async (id: string) =>
      id === CUSTOMER_LINKED
        ? customerRow(CUSTOMER_LINKED, COMPANY_1)
        : id === CUSTOMER_OTHER
          ? customerRow(CUSTOMER_OTHER, COMPANY_1)
          : null,
    );
    mockService.get.mockResolvedValue([noteRow()]);
    mockService.append.mockImplementation(async (_companyId: string, _customerId: string, input: any) =>
      noteRow({ ...input, id: NOTE_ID }),
    );
    mockProjectToolContext.mockResolvedValue({
      run: { id: RUN_ID, agentId: AGENT_ID, companyId: COMPANY_1, contextSnapshot: { conversationId: "c" } },
    });
    mockLinkedCustomerIdsForRun.mockResolvedValue([CUSTOMER_LINKED]);
  });

  it("lets an agent read the memory of the customer linked to its run", async () => {
    const app = await createApp(agentActor);
    const res = await request(app).get(`/api/customers/${CUSTOMER_LINKED}/memory`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockProjectToolContext).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "agent" }), false, "Customer memory");
  });

  it("forbids an agent from reading another customer's memory", async () => {
    const app = await createApp(agentActor);
    const res = await request(app).get(`/api/customers/${CUSTOMER_OTHER}/memory`);
    expect(res.status).toBe(403);
    expect(mockService.get).not.toHaveBeenCalled();
  });

  it("forbids an agent whose run has no linked customer", async () => {
    mockLinkedCustomerIdsForRun.mockResolvedValue([]);
    const app = await createApp(agentActor);
    const res = await request(app).get(`/api/customers/${CUSTOMER_LINKED}/memory`);
    expect(res.status).toBe(403);
    expect(mockService.get).not.toHaveBeenCalled();
  });

  it("forbids an agent from appending to another customer and writes nothing", async () => {
    const app = await createApp(agentActor);
    const res = await request(app)
      .post(`/api/customers/${CUSTOMER_OTHER}/memory`)
      .send({ key: "k", content: "c" });
    expect(res.status).toBe(403);
    expect(mockService.append).not.toHaveBeenCalled();
  });

  it("appends agent notes as source agent attributed to the run, ignoring a spoofed source", async () => {
    const app = await createApp(agentActor);
    const res = await request(app)
      .post(`/api/customers/${CUSTOMER_LINKED}/memory`)
      .send({ key: "preferencias", content: "Prefiere llamadas", source: "user" });
    expect(res.status).toBe(201);
    expect(mockService.append).toHaveBeenCalledWith(
      COMPANY_1,
      CUSTOMER_LINKED,
      expect.objectContaining({ source: "agent", agentId: AGENT_ID, runId: RUN_ID }),
    );
  });

  it("forbids agents from archiving notes", async () => {
    const app = await createApp(agentActor);
    const res = await request(app).post(`/api/customer-memory/${NOTE_ID}/archive`).send({});
    expect(res.status).toBe(403);
    expect(mockService.archive).not.toHaveBeenCalled();
  });

  it("rejects an agent key without a task-bound run before any lookup", async () => {
    const app = await createApp({ ...agentActor, source: "agent_key" });
    // Build the error from the same module instance the route uses (createApp resets modules).
    const { forbidden: forbiddenFresh } = await import("../errors.js");
    mockProjectToolContext.mockRejectedValue(forbiddenFresh("Customer memory tools require an authenticated agent run"));
    const res = await request(app).get(`/api/customers/${CUSTOMER_LINKED}/memory`);
    expect(res.status).toBe(403);
    expect(mockService.get).not.toHaveBeenCalled();
  });
});

describe("crm memory routes: board access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockService.findCustomer.mockImplementation(async (id: string) =>
      id === CUSTOMER_LINKED ? customerRow(CUSTOMER_LINKED, COMPANY_1) : null,
    );
    mockService.get.mockResolvedValue([noteRow()]);
    mockService.append.mockImplementation(async (_c: string, _cu: string, input: any) =>
      noteRow({ ...input, id: NOTE_ID }),
    );
    mockService.findNote.mockResolvedValue(noteRow());
    mockService.archive.mockResolvedValue(noteRow({ archivedAt: "2026-10-22T11:00:00.000Z" }));
  });

  it("lets a board user of the company read and append, recording source user by default", async () => {
    const app = await createApp(boardActor);
    const read = await request(app).get(`/api/customers/${CUSTOMER_LINKED}/memory`);
    expect(read.status).toBe(200);
    const write = await request(app)
      .post(`/api/customers/${CUSTOMER_LINKED}/memory`)
      .send({ key: "preferencias", content: "Prefiere correo" });
    expect(write.status).toBe(201);
    expect(mockService.append).toHaveBeenCalledWith(
      COMPANY_1,
      CUSTOMER_LINKED,
      expect.objectContaining({ source: "user", agentId: null, runId: null }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "customer.memory_appended", companyId: COMPANY_1 }),
    );
  });

  it("forbids a board user from another company", async () => {
    mockService.findCustomer.mockResolvedValue(customerRow(CUSTOMER_LINKED, COMPANY_2));
    const app = await createApp(boardActor);
    const res = await request(app).get(`/api/customers/${CUSTOMER_LINKED}/memory`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown customer", async () => {
    const app = await createApp(boardActor);
    const res = await request(app).get(`/api/customers/${CUSTOMER_OTHER}/memory`);
    expect(res.status).toBe(404);
  });

  it("archives a note and logs the activity", async () => {
    const app = await createApp(boardActor);
    const res = await request(app).post(`/api/customer-memory/${NOTE_ID}/archive`).send({});
    expect(res.status).toBe(200);
    expect(mockService.archive).toHaveBeenCalledWith(COMPANY_1, NOTE_ID);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "customer.memory_archived" }),
    );
  });

  it("returns 404 when the note is already archived", async () => {
    mockService.archive.mockResolvedValue(null);
    const app = await createApp(boardActor);
    const res = await request(app).post(`/api/customer-memory/${NOTE_ID}/archive`).send({});
    expect(res.status).toBe(404);
  });
});
