// @vitest-environment jsdom
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLanguagePreferenceSync } from "./LanguagePreferenceControl";

const language = vi.hoisted(() => ({
  language: "es",
  loadLanguages: vi.fn(),
  changeLanguage: vi.fn(),
}));
vi.mock("@/i18n", () => ({
  useTranslation: () => ({ i18n: language, t: (key: string) => key }),
}));

function Preference({ userId }: { userId: string | null }) {
  useLanguagePreferenceSync(userId);
  return null;
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let finishDownload: () => void;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.localStorage.setItem("paperclip.locale.previous-user", "pt-BR");
  language.language = "es";
  language.loadLanguages.mockImplementation(() => new Promise<void>((resolve) => { finishDownload = resolve; }));
  language.changeLanguage.mockResolvedValue(undefined);
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  window.localStorage.clear();
  vi.clearAllMocks();
});

it("applies the saved language only after its dictionary is available", async () => {
  flushSync(() => root.render(<Preference userId="previous-user" />));
  expect(language.loadLanguages).toHaveBeenCalledWith("pt-BR");
  expect(language.changeLanguage).not.toHaveBeenCalled();
  finishDownload();
  await vi.waitFor(() => expect(language.changeLanguage).toHaveBeenCalledWith("pt-BR"));
});

it("does not apply a previous account's pending language after switching users", async () => {
  flushSync(() => root.render(<Preference userId="previous-user" />));
  expect(language.loadLanguages).toHaveBeenCalledWith("pt-BR");
  flushSync(() => root.render(<Preference userId="next-user" />));
  finishDownload();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(language.changeLanguage).not.toHaveBeenCalled();
});
