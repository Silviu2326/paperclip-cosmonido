// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LPC_HAIR_STYLES, appearanceForLpc, appearanceForPalette, encodeLpcSpec, type LpcCharacter } from "@paperclipai/shared";
import { LpcCharacterEditorDialog, initialLpcCharacter, thumbnailCharacter } from "./LpcCharacterEditor";

vi.mock("@paperclipai/shared/cliplab/runtime", () => ({ createCharacter: vi.fn() }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const character: LpcCharacter = {
  bodyType: "female", skin: "brown", eyes: "green", hair: "bob", hairColor: "pink", torso: "cardigan", torsoColor: "teal",
  legs: "formal", legsColor: "navy", feet: "boots", feetColor: "leather",
};
let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("pixel-art character editor", () => {
  it("builds thumbnails that follow only the fields affecting the option", () => {
    const hair = thumbnailCharacter(character, "hair", "afro");
    expect(hair).toMatchObject({ hair: "afro", bodyType: "female", skin: "brown", eyes: "green", hairColor: "pink" });
    expect(hair.torso).not.toBe(character.torso);
    expect(thumbnailCharacter({ ...character, torsoColor: "red" }, "hair", "afro")).toEqual(hair);
    const torso = thumbnailCharacter(character, "torso", "polo");
    expect(torso).toMatchObject({ torso: "polo", torsoColor: "teal", bodyType: "female" });
    expect(torso.hair).not.toBe("bob");
    expect(initialLpcCharacter(appearanceForLpc(character))).toEqual(character);
    expect(initialLpcCharacter(appearanceForPalette("deep-tide")).bodyType).toBeDefined();
  });
  it("renders the live preview, body tab swatches and hair thumbnails from the agent's character", async () => {
    const client = new QueryClient();
    const agent = { id: "agent-1", name: "Walter", companyId: "company-1", appearance: appearanceForLpc(character, "deep-tide") };
    await act(async () => root.render(
      <QueryClientProvider client={client}><LpcCharacterEditorDialog agent={agent} open onOpenChange={() => {}} /></QueryClientProvider>,
    ));
    const dialog = document.body;
    expect(dialog.querySelector(`img[src*="${encodeLpcSpec(character)}/idle.png"]`)).not.toBeNull();
    expect(dialog.querySelectorAll('[role=radiogroup][aria-label="Tono de piel"] [role=radio]')).toHaveLength(7);
    expect(dialog.querySelectorAll('[role=radiogroup][aria-label="Cuerpo"] [role=radio]')).toHaveLength(2);
    // Radix tabs activate on pointer down, not click.
    const hairTab = dialog.querySelectorAll("[role=tab]")[1] as HTMLElement;
    await act(async () => { hairTab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); hairTab.focus(); });
    const hairTiles = dialog.querySelectorAll('[role=radiogroup][aria-label="Pelo"] [role=radio]');
    expect(hairTiles).toHaveLength(LPC_HAIR_STYLES.length);
    const checked = dialog.querySelector('[role=radiogroup][aria-label="Pelo"] [role=radio][aria-checked="true"] img') as HTMLImageElement;
    expect(checked.getAttribute("src")).toContain("/api/agent-avatars/lpc-v1/");
    expect(checked.getAttribute("src")).toContain(".bob.pink.");
    expect(checked.getAttribute("src")).toContain("size=48&scale=2");
  });
});
