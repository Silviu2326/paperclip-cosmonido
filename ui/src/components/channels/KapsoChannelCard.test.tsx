// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
// Storybook already exposes Testing Library; no additional dependency is needed.
import { within, userEvent } from "storybook/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { channelsApi, type ChannelAccount } from "@/api/channels";
import { secretsApi } from "@/api/secrets";
import { KapsoChannelCard, KapsoConnectionWizard, kapsoWebhookUrl } from "./KapsoChannelCard";

vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/api/channels", () => ({ channelsApi: { create: vi.fn(), test: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
vi.mock("@/api/secrets", () => ({ secretsApi: { create: vi.fn(), rotate: vi.fn() } }));
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const account: ChannelAccount = {
  id: "account-1", companyId: "company-1", provider: "kapso", kind: "whatsapp", label: "Support",
  externalAccountId: "123456", providerAccountSid: null, verifySecretName: "webhook", challengeSecretName: null,
  tokenSecretName: "api", status: "active", approvedTemplates: [], lastTestedAt: null, lastTestError: null,
  createdAt: "2026-11-06T00:00:00Z", updatedAt: "2026-11-06T00:00:00Z",
};

describe("Kapso WhatsApp setup", () => {
  let container: HTMLDivElement;
  let root: Root;
  let user: ReturnType<typeof userEvent.setup>;
  let copy: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn<() => void>>;
  const ui = () => within(container);
  const button = (key: string) => ui().getByRole("button", { name: `channelsKapso.${key}` });
  async function click(element: HTMLElement) { await act(async () => { await user.click(element); }); }
  async function type(key: string, value: string) {
    await act(async () => { await user.type(ui().getByLabelText(`channelsKapso.${key}`), value); });
  }
  async function credentials() {
    await type("apiKey", "synthetic-api-key");
    await type("phoneId", "123456");
    await click(button("next"));
  }
  async function webhook() {
    await act(async () => {
      const origin = ui().getByLabelText("channelsKapso.publicOrigin");
      await user.clear(origin);
      await user.type(origin, "https://cosmonido.example");
    });
    await type("webhookSecret", "synthetic-webhook-secret");
    await click(button("next"));
  }
  beforeEach(() => {
    vi.resetAllMocks();
    user = userEvent.setup();
    copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    close = vi.fn<() => void>();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(secretsApi.create).mockImplementation(async (_companyId, input) => ({ id: input.name, name: input.name }) as Awaited<ReturnType<typeof secretsApi.create>>);
    vi.mocked(channelsApi.create).mockResolvedValue(account);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });
  function renderWizard() {
    act(() => root.render(<KapsoConnectionWizard companyId="company-1" onClose={close} />));
  }

  it("renders the recommended entry point and empty state", () => {
    act(() => root.render(<KapsoChannelCard companyId="company-1" accounts={[]} onRefresh={vi.fn()} />));
    expect(ui().getByText("channelsKapso.recommended")).toBeTruthy();
    expect(ui().getByText("channelsKapso.empty")).toBeTruthy();
    expect(button("connect")).toBeTruthy();
  });

  it("validates required credentials and webhook fields before saving", async () => {
    renderWizard();
    await click(button("next"));
    expect(ui().getByRole("alert").textContent).toBe("channelsKapso.credentialsRequired");
    expect(secretsApi.create).not.toHaveBeenCalled();
    await credentials();
    await click(button("next"));
    expect(ui().getByRole("alert").textContent).toBe("channelsKapso.webhookRequired");
    expect(channelsApi.create).not.toHaveBeenCalled();
  });

  it("copies the full public webhook URL and handles clipboard failure", async () => {
    renderWizard();
    await credentials();
    await act(async () => {
      const origin = ui().getByLabelText("channelsKapso.publicOrigin");
      await user.clear(origin);
      await user.type(origin, "https://cosmonido.example");
    });
    await click(button("copy"));
    expect(copy).toHaveBeenCalledWith("https://cosmonido.example/api/webhooks/kapso/company-1");
    expect(ui().getByRole("status").textContent).toBe("channelsKapso.copied");
    copy.mockRejectedValueOnce(new Error("Clipboard unavailable"));
    await click(button("copy"));
    expect(ui().getByRole("alert").textContent).toBe("channelsKapso.copyFailed");
  });

  it("stores secrets separately and sends the Kapso payload with an approved template", async () => {
    renderWizard();
    await type("displayPhone", "+34600000000");
    await credentials();
    await webhook();
    await type("templateName", "customer_followup");
    await click(button("save"));
    expect(secretsApi.create).toHaveBeenCalledTimes(2);
    expect(secretsApi.create).toHaveBeenCalledWith("company-1", expect.objectContaining({ value: "synthetic-api-key" }));
    expect(secretsApi.create).toHaveBeenCalledWith("company-1", expect.objectContaining({ value: "synthetic-webhook-secret" }));
    expect(channelsApi.create).toHaveBeenCalledWith("company-1", {
      provider: "kapso", kind: "whatsapp", label: "+34600000000", externalAccountId: "123456",
      displayPhoneNumber: "+34600000000", apiKeySecretName: expect.stringMatching(/^kapso_.*_api$/),
      webhookSecretName: expect.stringMatching(/^kapso_.*_webhook$/), approvedTemplates: [{ name: "customer_followup", language: "es" }],
    });
    expect(JSON.stringify(vi.mocked(channelsApi.create).mock.calls)).not.toContain("synthetic-");
    vi.mocked(channelsApi.test).mockResolvedValueOnce({ ok: false, status: 401, detail: "Invalid key" });
    await click(button("test"));
    expect(channelsApi.test).toHaveBeenCalledWith("account-1");
    expect(ui().getByRole("alert").textContent).toContain("Invalid key");
    vi.mocked(channelsApi.test).mockResolvedValueOnce({ ok: true, status: 200, detail: "Connected" });
    await click(button("retryTest"));
    expect(ui().getByText(/channelsKapso.testOk/)).toBeTruthy();
    await click(button("finish"));
    expect(close).toHaveBeenCalled();
  });

  it("retries account creation without duplicating already stored secrets", async () => {
    vi.mocked(channelsApi.create).mockRejectedValueOnce(new Error("Temporarily unavailable"));
    renderWizard();
    await credentials();
    await webhook();
    await click(button("save"));
    expect(ui().getByRole("alert").textContent).toContain("Temporarily unavailable");
    await click(button("save"));
    expect(channelsApi.create).toHaveBeenCalledTimes(2);
    expect(secretsApi.create).toHaveBeenCalledTimes(2);
    expect(button("test")).toBeTruthy();
  });

  it("requires its own confirmation dialog before disconnecting", async () => {
    const refresh = vi.fn();
    act(() => root.render(<KapsoChannelCard companyId="company-1" accounts={[account]} onRefresh={refresh} />));
    await click(button("disconnect"));
    expect(channelsApi.remove).not.toHaveBeenCalled();
    const dialog = within(document.body).getByRole("alertdialog");
    await click(within(dialog).getByRole("button", { name: "channelsKapso.disconnect" }));
    expect(channelsApi.remove).toHaveBeenCalledWith("account-1");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows test loading and refreshes a pending account after verification", async () => {
    let resolve!: (value: { ok: boolean; status: number; detail: string }) => void;
    vi.mocked(channelsApi.test).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const refresh = vi.fn();
    act(() => root.render(<KapsoChannelCard companyId="company-1" accounts={[{ ...account, status: "pending" }]} onRefresh={refresh} />));
    expect(ui().getByText("channelsKapso.status.pending")).toBeTruthy();
    await click(button("test"));
    expect((button("testing") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolve({ ok: true, status: 200, detail: "Connected" }); });
    expect(refresh).toHaveBeenCalled();
    expect(ui().getByText(/channelsKapso.testOk/)).toBeTruthy();
  });

  it("pauses and resumes a saved account", async () => {
    const refresh = vi.fn();
    act(() => root.render(<KapsoChannelCard companyId="company-1" accounts={[account]} onRefresh={refresh} />));
    await click(button("pause"));
    expect(channelsApi.update).toHaveBeenLastCalledWith("account-1", { status: "disabled" });
    act(() => root.render(<KapsoChannelCard companyId="company-1" accounts={[{ ...account, status: "disabled" }]} onRefresh={refresh} />));
    expect(ui().getByText("channelsKapso.status.disabled")).toBeTruthy();
    await click(button("resume"));
    expect(channelsApi.update).toHaveBeenLastCalledWith("account-1", { status: "active" });
  });

  it("builds HTTPS callback URLs without accepting paths or credentials", () => {
    expect(kapsoWebhookUrl("https://cosmonido.example/", "company/id")).toBe("https://cosmonido.example/api/webhooks/kapso/company%2Fid");
    for (const origin of ["http://localhost:3100", "https://example.com/path", "https://user:pass@example.com", "invalid"]) {
      expect(kapsoWebhookUrl(origin, "company-1")).toBeNull();
    }
  });
});
