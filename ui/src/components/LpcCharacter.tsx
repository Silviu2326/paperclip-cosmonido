import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CHARACTER_STATES, LPC_POSES, LPC_SHEET_COLUMNS, agentSpriteSheetUrl, type CharacterState, type LpcAgentAppearance } from "@paperclipai/shared";
import { cn } from "@/lib/utils";
import { AgentAvatar, avatarSizeClasses, type AgentAvatarProps } from "./AgentAvatar";

export interface LpcCharacterProps extends Omit<AgentAvatarProps, "pose" | "appearance"> {
  appearance: LpcAgentAppearance;
  state?: CharacterState;
  motion?: "auto" | "still";
}

/** Frame geometry for one sheet row, in percentages so the element size alone scales the art. */
export function lpcSpriteStyle(state: CharacterState): CSSProperties & Record<"--lpc-end", string> {
  const pose = LPC_POSES[state];
  const rows = CHARACTER_STATES.length;
  const row = CHARACTER_STATES.indexOf(state);
  const frames = pose.frames.length;
  const lastColumn = LPC_SHEET_COLUMNS - 1;
  return {
    backgroundSize: `${LPC_SHEET_COLUMNS * 100}% ${rows * 100}%`,
    backgroundPositionY: `${(row / (rows - 1)) * 100}%`,
    backgroundPositionX: "0%",
    "--lpc-end": `${((frames - 1) / lastColumn) * 100}%`,
    animationDuration: `${frames / pose.fps}s`,
    // jump-none needs at least two steps; a single frame simply holds.
    animationTimingFunction: frames > 1 ? `steps(${frames}, jump-none)` : "step-end",
    animationPlayState: frames > 1 ? "running" : "paused",
  };
}

/**
 * Live pixel-art character: a CSS sprite animation over the agent's lpc-v1
 * sheet. The still portrait stays underneath until the sheet has loaded, and
 * remains the only rendering offscreen, under reduced motion, or with
 * motion="still". No canvas, WebGL, or per-frame JavaScript.
 */
export function LpcCharacter({ appearance, agent, size = 256, state = "idle", muted = false, motion = "auto", className, label, name }: LpcCharacterProps) {
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const sheetUrl = useMemo(() => agentSpriteSheetUrl(appearance, muted), [appearance, muted]);
  const animate = visible && !reduced && motion === "auto" && state !== "rest";
  useEffect(() => {
    if (typeof matchMedia !== "function" || typeof IntersectionObserver !== "function") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches); change(); media.addEventListener("change", change);
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false));
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); media.removeEventListener("change", change); };
  }, []);
  useEffect(() => {
    if (!animate || loadedUrl === sheetUrl) return;
    let disposed = false;
    const image = new Image();
    image.onload = () => { if (!disposed) setLoadedUrl(sheetUrl); };
    image.onerror = () => { if (!disposed) setLoadedUrl(null); };
    image.src = sheetUrl;
    return () => { disposed = true; };
  }, [animate, sheetUrl, loadedUrl]);
  const live = animate && loadedUrl === sheetUrl;
  return <span ref={root} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    className={cn("relative inline-block shrink-0", avatarSizeClasses[size], className)}>
    <AgentAvatar agent={agent} appearance={appearance} size={size < 64 ? 64 : size} name={name} pose={state} muted={muted} className={cn("size-full", live && "invisible")} />
    {live && <span data-slot="lpc-sprite" className="lpc-sprite absolute inset-0" style={{ ...lpcSpriteStyle(state), backgroundImage: `url("${sheetUrl}")` }} />}
  </span>;
}
