// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Conversation, ConversationMessage } from "@paperclipai/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConversationComposer, whatsappWindowRemaining } from "./ConversationComposer";
import { ConversationThread, attachmentUrl } from "./ConversationThread";
import { ConversationControls } from "./ConversationControls";
import { ConversationList, relativeActivity } from "./ConversationList";
import { conversationsApi } from "@/api/conversations";

vi.mock("@/api/conversations", () => ({ conversationsApi: { draft: vi.fn(), send: vi.fn(), assign: vi.fn(), setState: vi.fn() } }));
vi.mock("@/api/agents", () => ({ agentsApi: { list: async () => [{ id: "agent-a", name: "Luna" }] } }));
vi.mock("@/api/auth", () => ({ authApi: { getSession: async () => ({ user: { id: "human-a" } }) } }));
vi.mock("@/api/health", () => ({ healthApi: { get: async () => ({ deploymentMode: "authenticated" }) } }));
vi.mock("@/api/crm", () => ({ crmApi: { contacts: { get: async () => ({ displayName: "Ana" }) } } }));
vi.mock("@/lib/router", () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("@/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }) }));

const conversation = { id: "conversation-a", companyId: "company-a", channel: "whatsapp", status: "open", priority: "normal", assignedAgentId: "agent-a", assignedUserId: null, lastInboundAt: "2026-11-06T10:00:00Z" } as Conversation;
const message = (overrides: Partial<ConversationMessage> = {}): ConversationMessage => ({
  id: "message-a", body: "Hola", direction: "outbound", actorKind: "agent", deliveryStatus: "sent", attachments: [], createdAt: "2026-11-06T10:00:00Z", ...overrides,
} as ConversationMessage);
let root: Root; let container: HTMLDivElement; let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); });
async function render(element: React.ReactNode) { await act(async () => root.render(<QueryClientProvider client={client}>{element}</QueryClientProvider>)); }
async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 60; attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    if (check()) return;
  }
  throw new Error(`Expected UI state not reached: ${container.textContent}`);
}
async function type(value: string) {
  const input = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
const button = (key: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === key)!;

it("uses the authoritative inbound timestamp, closes at exactly 24 h and falls back to inbound history", () => {
  const now = new Date("2026-11-07T10:00:00Z").getTime();
  expect(whatsappWindowRemaining(conversation, [], now)).toBe(0);
  expect(whatsappWindowRemaining(conversation, [message({ direction: "inbound", createdAt: "2026-11-07T09:00:00Z" })], now)).toBe(0);
  expect(whatsappWindowRemaining({ lastInboundAt: null }, [message({ direction: "inbound", createdAt: "2026-11-07T09:00:00Z" })], now)).toBe(23 * 3600000);
  expect(whatsappWindowRemaining({ lastInboundAt: null }, [message()], now)).toBe(0);
  expect(whatsappWindowRemaining({ lastInboundAt: "invalid" }, [], now)).toBe(0);
});

it("rejects executable attachment URLs and formats activity in Spanish", () => {
  expect(attachmentUrl("javascript:alert(1)")).toBeNull();
  expect(attachmentUrl("data:text/html,test")).toBeNull();
  expect(attachmentUrl("https://example.com/photo.png")).toBe("https://example.com/photo.png");
  expect(relativeActivity("2026-11-06T10:00:00Z", "es", new Date("2026-11-06T10:05:00Z").getTime())).toBe("hace 5 minutos");
});

it("shows actors, day separators, delivery errors, safe previews and retry actions", async () => {
  const retry = vi.fn();
  await render(<ConversationThread messages={[
    message({ id: "in", direction: "inbound", actorKind: "contact", attachments: [{ url: "https://example.com/photo.png", mimeType: "image/png", name: "Photo" }, { url: "javascript:alert(1)", name: "Unsafe" }] }),
    message({ id: "failed", deliveryStatus: "failed", providerReceipt: { error: "Provider rejected" }, createdAt: "2026-11-07T10:00:00Z" }),
  ]} busy={false} pending={null} windowClosed={false} onSend={vi.fn()} onRetry={retry} onReconcile={vi.fn()} />);
  expect(container.textContent).toContain("conversationsUx.actor.contact");
  expect(container.textContent).toContain("conversationsUx.actor.agent");
  expect(container.querySelectorAll("li > time")).toHaveLength(2);
  expect(container.querySelectorAll("img")).toHaveLength(1);
  expect(container.querySelectorAll("a")).toHaveLength(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Provider rejected");
  await act(async () => button("conversationsUx.retryMessage").click());
  expect(retry).toHaveBeenCalledWith(expect.objectContaining({ id: "failed" }));
});

it("sends on Enter, preserves Shift+Enter, shows a pending reply and locks duplicate submissions", async () => {
  let finish!: (value: Awaited<ReturnType<typeof conversationsApi.draft>>) => void;
  vi.mocked(conversationsApi.draft).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  vi.mocked(conversationsApi.send).mockResolvedValue({ mode: "direct", message: message(), action: null });
  const pending = vi.fn(); const changed = vi.fn(async () => {});
  await render(<ConversationComposer conversation={conversation} windowClosed={false} onChanged={changed} onPending={pending} />);
  const input = await type("Hola Ana");
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true })));
  expect(conversationsApi.draft).not.toHaveBeenCalled();
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(conversationsApi.draft).toHaveBeenCalledTimes(1);
  expect(input.disabled).toBe(true);
  expect(pending).toHaveBeenCalledWith("Hola Ana");
  await act(async () => finish(message({ id: "draft-a" })));
  expect(conversationsApi.send).toHaveBeenCalledWith("draft-a");
  expect(changed).toHaveBeenCalledTimes(1);
  expect(pending).toHaveBeenLastCalledWith(null);
  expect(input.value).toBe("");
});

it("retains text and the same idempotency key after a draft network failure", async () => {
  vi.mocked(conversationsApi.draft).mockRejectedValue(new Error("Offline"));
  await render(<ConversationComposer conversation={conversation} windowClosed={false} onChanged={async () => {}} onPending={vi.fn()} />);
  const input = await type("No perder");
  await act(async () => button("conversations.composer.send").click());
  expect(input.value).toBe("No perder");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Offline");
  await act(async () => button("conversations.composer.send").click());
  const calls = vi.mocked(conversationsApi.draft).mock.calls;
  expect(calls[0][1].idempotencyKey).toBe(calls[1][1].idempotencyKey);
});

it("blocks WhatsApp text sending outside the window while allowing draft saving", async () => {
  vi.mocked(conversationsApi.draft).mockResolvedValue(message({ deliveryStatus: "draft" }));
  await render(<ConversationComposer conversation={conversation} windowClosed={true} onChanged={async () => {}} onPending={vi.fn()} />);
  const input = await type("Para después");
  expect(button("conversations.composer.send").disabled).toBe(true);
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(conversationsApi.draft).not.toHaveBeenCalled();
  await act(async () => button("conversations.composer.saveDraft").click());
  expect(conversationsApi.draft).toHaveBeenCalledTimes(1);
  expect(conversationsApi.send).not.toHaveBeenCalled();
});

it("blocks WhatsApp text above 4096 characters", async () => {
  await render(<ConversationComposer conversation={conversation} windowClosed={false} onChanged={async () => {}} onPending={vi.fn()} />);
  const input = await type("a".repeat(4097));
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(button("conversations.composer.send").disabled).toBe(true);
});

it("clears the previous responder when handing to a human or agent and updates state", async () => {
  vi.mocked(conversationsApi.assign).mockResolvedValue(conversation);
  vi.mocked(conversationsApi.setState).mockResolvedValue(conversation);
  await render(<ConversationControls conversation={conversation} companyId="company-a" onChanged={async () => {}} onError={vi.fn()} />);
  await waitFor(() => !button("conversationsUx.takeOver").disabled);
  await act(async () => button("conversationsUx.takeOver").click());
  expect(conversationsApi.assign).toHaveBeenLastCalledWith(conversation.id, { assignedUserId: "human-a", assignedAgentId: null });
  await act(async () => button("conversationsUx.handToAgent").click());
  expect(conversationsApi.assign).toHaveBeenLastCalledWith(conversation.id, { assignedAgentId: "agent-a", assignedUserId: null });
  const status = container.querySelector("select")!;
  await act(async () => { status.value = "waiting_them"; status.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(conversationsApi.setState).toHaveBeenCalledWith(conversation.id, { status: "waiting_them" });
});

it("resolves contact and agent names and searches loaded contacts", async () => {
  await render(<ConversationList items={[{ ...conversation, contactId: "contact-a", subject: "Consulta" }]} search="ana" companyId="company-a" />);
  await waitFor(() => container.textContent!.includes("Ana"));
  expect(container.textContent).toContain("Luna");
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/conversations/conversation-a");
  await render(<ConversationList items={[{ ...conversation, contactId: "contact-a", subject: "Consulta" }]} search="missing" companyId="company-a" />);
  expect(container.textContent).toContain("conversationsUx.noSearchResults");
});
