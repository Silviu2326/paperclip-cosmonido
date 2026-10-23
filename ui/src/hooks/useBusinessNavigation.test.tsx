// @vitest-environment jsdom
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { businessNavigationKey, useBusinessNavigation } from "./useBusinessNavigation";

const scope = vi.hoisted(() => ({ company: "company-a", user: "user-a" as string | null, settled: true }));
vi.mock("@/api/companies-query", () => ({ useAccountIdentity: () => ({ userId: scope.user, settled: scope.settled }) }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: scope.company }) }));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
function Preferences() {
  const { preferences, update } = useBusinessNavigation();
  return <button onClick={() => update({ business: !preferences.business })}>{JSON.stringify(preferences)}</button>;
}
const render = () => flushSync(() => root.render(<Preferences />));
beforeEach(() => {
  scope.company = "company-a"; scope.user = "user-a"; scope.settled = true;
  window.localStorage.clear(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { flushSync(() => root.unmount()); container.remove(); window.localStorage.clear(); });

it("updates the current browser immediately and keeps preferences separate by user and company", () => {
  render();
  flushSync(() => container.querySelector("button")!.click());
  expect(container.textContent).toContain('"business":false');
  expect(window.localStorage.getItem(businessNavigationKey("company-a", "user-a"))).toContain('"business":false');
  scope.user = "user-b"; render();
  expect(container.textContent).toContain('"business":true');
  scope.user = "user-a"; scope.company = "company-b"; render();
  expect(container.textContent).toContain('"business":true');
  scope.company = "company-a"; render();
  expect(container.textContent).toContain('"business":false');
});

it("does not save a preference while the account identity is unresolved", () => {
  scope.settled = false; render();
  flushSync(() => container.querySelector("button")!.click());
  expect(window.localStorage.length).toBe(0);
});

it("recovers from malformed saved values without hiding business entry points", () => {
  window.localStorage.setItem(businessNavigationKey(scope.company, scope.user), '{"business":"false","agenda":true}');
  render();
  expect(container.textContent).toContain('"business":true');
  expect(container.textContent).toContain('"agenda":true');
});
