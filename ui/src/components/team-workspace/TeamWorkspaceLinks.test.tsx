// @vitest-environment jsdom

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n";
import { DEFAULT_LOCALE } from "../../i18n/locales";
import {
  AddTeamButton,
  AgentAutonomyLink,
  BackToRoutinesLink,
  BackToTeamLink,
  ProceduresLink,
  TEAM_WORKSPACE_PATHS,
  TeamQuickLinks,
  TemplateLibraryNav,
  autonomyHrefForAgent,
} from "./TeamWorkspaceLinks";

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; children: ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("TeamWorkspaceLinks", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  function render(node: ReactNode) {
    flushSync(() => root.render(node));
  }

  function hrefs(): string[] {
    return Array.from(container.querySelectorAll("a")).map((anchor) => anchor.getAttribute("href") ?? "");
  }

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    flushSync(() => root.unmount());
    container.remove();
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });

  it("sends the add-team action to the real preparation flow, not the draft-only editor", () => {
    render(<AddTeamButton />);
    expect(hrefs()).toEqual(["/productization#team"]);
    expect(hrefs()).not.toContain(TEAM_WORKSPACE_PATHS.advancedEditor);
  });

  it("offers skills, autonomy and office as quiet roster links", () => {
    render(<TeamQuickLinks />);
    expect(hrefs()).toEqual(["/skills", "/autonomy", "/office"]);
  });

  it("links an agent to Autonomy filtered by that agent id", () => {
    expect(autonomyHrefForAgent("agent 1/ü")).toBe("/autonomy?agent=agent%201%2F%C3%BC");
    render(<AgentAutonomyLink agentId="agent-1" />);
    expect(hrefs()).toEqual(["/autonomy?agent=agent-1"]);
  });

  it("connects routines and procedures in both directions", () => {
    render(<><ProceduresLink /><BackToRoutinesLink /><BackToTeamLink /></>);
    expect(hrefs()).toEqual(["/playbooks", "/routines", "/agents/all"]);
  });

  it("renders the current template-library view as text and links the others", () => {
    render(<TemplateLibraryNav current="builder" />);
    const current = container.querySelector('[aria-current="page"]');
    expect(current?.tagName).toBe("SPAN");
    expect(hrefs()).toEqual([
      "/agents/all",
      "/productization#team",
      "/portable-catalog",
      "/public-catalog",
    ]);
  });

  it("marks only one view as current for every library view", () => {
    for (const view of ["create", "private", "shared", "builder"] as const) {
      render(<TemplateLibraryNav current={view} />);
      expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(hrefs()).toHaveLength(4);
    }
  });
});
