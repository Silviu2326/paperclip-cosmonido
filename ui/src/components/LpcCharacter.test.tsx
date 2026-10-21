// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHARACTER_STATES, LPC_POSES, LPC_SHEET_COLUMNS, appearanceForLpc, encodeLpcSpec, type LpcCharacter as LpcCharacterSpec } from "@paperclipai/shared";
import { AgentAvatar } from "./AgentAvatar";
import { AgentCharacter } from "./AgentCharacter";
import { lpcSpriteStyle } from "./LpcCharacter";

const createCharacter = vi.hoisted(() => vi.fn());
vi.mock("@paperclipai/shared/cliplab/runtime", () => ({ createCharacter }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const character: LpcCharacterSpec = {
  bodyType: "female", skin: "brown", eyes: "green", hair: "bob", hairColor: "pink", torso: "cardigan", torsoColor: "teal",
  legs: "formal", legsColor: "navy", feet: "boots", feetColor: "leather",
};
const appearance = appearanceForLpc(character, "deep-tide");
const spec = encodeLpcSpec(character);
let root: Root; let host: HTMLDivElement; let observers: Array<(entries: any[]) => void>; let reduced = false;
let images: Array<{ src: string; onload?: () => void; onerror?: () => void }>;
beforeEach(() => {
  vi.clearAllMocks(); observers = []; reduced = false; images = [];
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: (entries: any[]) => void) { observers.push(callback); } observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("Image", class { onload?: () => void; onerror?: () => void; private _src = ""; constructor() { images.push(this as any); } set src(value: string) { this._src = value; (this as any).src_ = value; } get src() { return this._src; } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function show() { await act(async () => { for (const observer of observers) observer([{ isIntersecting: true }]); }); }

describe("lpc-v1 agent presentation", () => {
  it("renders pixel-art portraits as plain images with the lpc-v1 URL", async () => {
    await act(async () => root.render(<AgentAvatar appearance={appearance} size={24} />));
    const image = host.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(`/api/agent-avatars/lpc-v1/${spec}/rest.png?size=24&scale=1`);
    expect(image.getAttribute("srcset")).toContain(`/${spec}/rest.png?size=24&scale=2`);
    expect(image.classList.contains("pixel-art")).toBe(true);
    expect(host.querySelector("canvas")).toBeNull();
  });
  it("animates with a CSS sprite over the sheet once visible and loaded, never starting the ClipLab renderer", async () => {
    await act(async () => root.render(<AgentCharacter appearance={appearance} state="working" size={96} />));
    expect(host.querySelector("[data-slot=lpc-sprite]")).toBeNull();
    expect(host.querySelector("img")?.getAttribute("src")).toContain(`/${spec}/working.png`);
    await show();
    expect(images.map(image => image.src)).toEqual([`/api/agent-avatars/lpc-v1/${spec}/sheet.png`]);
    await act(async () => { images[0]!.onload?.(); });
    const sprite = host.querySelector("[data-slot=lpc-sprite]") as HTMLElement;
    expect(sprite).not.toBeNull();
    expect(sprite.style.backgroundImage).toContain(`/${spec}/sheet.png`);
    expect(sprite.style.animationTimingFunction).toBe(`steps(${LPC_POSES.working.frames.length}, jump-none)`);
    expect(host.querySelector("[data-slot=agent-avatar]")?.classList.contains("invisible")).toBe(true);
    expect(createCharacter).not.toHaveBeenCalled();
  });
  it("keeps the still portrait under reduced motion and for the resting state", async () => {
    reduced = true;
    await act(async () => root.render(<AgentCharacter appearance={appearance} state="working" size={96} />));
    await show();
    expect(images).toHaveLength(0);
    expect(host.querySelector("[data-slot=lpc-sprite]")).toBeNull();
    reduced = false;
    await act(async () => root.render(<AgentCharacter appearance={appearance} state="rest" size={96} muted />));
    await show();
    expect(images).toHaveLength(0);
    expect(host.querySelector("img")?.getAttribute("src")).toContain("muted=1");
  });
  it("draws the saved scene as a CSS backdrop and lets callers hide it", async () => {
    const withScene = appearanceForLpc(character, "deep-tide", "sunset");
    await act(async () => root.render(<><AgentCharacter appearance={withScene} size={96} /><AgentCharacter appearance={withScene} scene="none" size={96} /><AgentAvatar appearance={withScene} size={24} /></>));
    const roots = host.querySelectorAll("[data-scene]");
    expect(roots[0]?.classList.contains("lpc-scene-sunset")).toBe(true);
    expect(roots[1]?.classList.contains("lpc-scene")).toBe(false);
    // Portrait URLs never carry the scene: it is presentation only.
    for (const image of host.querySelectorAll("img")) expect(image.getAttribute("src")).not.toContain("sunset");
  });
  it("derives sprite geometry from the shared sheet contract", () => {
    const rows = CHARACTER_STATES.length;
    const style = lpcSpriteStyle("sleepy");
    expect(style.backgroundSize).toBe(`${LPC_SHEET_COLUMNS * 100}% ${rows * 100}%`);
    expect(style.backgroundPositionY).toBe(`${(CHARACTER_STATES.indexOf("sleepy") / (rows - 1)) * 100}%`);
    expect(style["--lpc-end"]).toBe(`${((LPC_POSES.sleepy.frames.length - 1) / (LPC_SHEET_COLUMNS - 1)) * 100}%`);
    expect(style.animationDuration).toBe(`${LPC_POSES.sleepy.frames.length / LPC_POSES.sleepy.fps}s`);
    expect(lpcSpriteStyle("rest").animationPlayState).toBe("paused");
  });
});
