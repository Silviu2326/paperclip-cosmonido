import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { resolveAgentAppearance, type Agent, type OfficeLayout } from "@paperclipai/shared";
import { agentUrl } from "@/lib/utils";
import { useNavigate } from "@/lib/router";
import { useTranslation } from "@/i18n";
import type { OfficeAtlases, OfficeCatalog } from "./catalog";
import { OfficeEngine, type EngineAgent } from "./engine";

export interface OfficeCanvasProps {
  layout: OfficeLayout;
  catalog: OfficeCatalog;
  atlases: OfficeAtlases;
  agents: readonly Agent[];
}

interface Hover { id: string; name: string; x: number; y: number }

export function toEngineAgents(agents: readonly Agent[]): EngineAgent[] {
  return agents.map(agent => ({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    appearance: agent.appearance ? resolveAgentAppearance(agent.appearance, agent.id) : null,
  }));
}

/**
 * The office on a canvas (contract 7). The engine owns the drawing loop; this component sizes it to
 * the container, reports the agent under the pointer and opens the agent page on click. Agent names
 * are also listed as links for keyboard and screen-reader users.
 */
export function OfficeCanvas({ layout, catalog, atlases, agents }: OfficeCanvasProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OfficeEngine | null>(null);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const [hover, setHover] = useState<Hover | null>(null);

  // The engine is created once per mounted canvas; later prop changes go through its setters.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const engine = new OfficeEngine({ canvas, catalog, atlases, layout, agents: toEngineAgents(agentsRef.current) });
    engineRef.current = engine;
    const fit = () => engine.resize(container.clientWidth, container.clientHeight, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    fit();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(container);
    engine.start();
    return () => {
      observer?.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
    // Mount-only: the setters below keep the engine in sync with later props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setLayout(layout, catalog, atlases);
  }, [layout, catalog, atlases]);

  useEffect(() => {
    engineRef.current?.setAgents(toEngineAgents(agents));
  }, [agents]);

  const pointerPosition = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handleMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPosition(event);
    const agent = engineRef.current?.agentAt(x, y) ?? null;
    if (!agent) { setHover(null); return; }
    setHover({ id: agent.id, name: agent.name, x, y });
  };

  const handleClick = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPosition(event);
    const agent = engineRef.current?.agentAt(x, y) ?? null;
    const target = agent ? agentsRef.current.find(candidate => candidate.id === agent.id) : undefined;
    if (target) navigate(agentUrl(target));
  };

  return (
    <div ref={containerRef} className="relative h-full min-h-96 w-full overflow-hidden rounded-lg border bg-muted/30">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t("office.canvasLabel")}
        className={hover ? "block h-full w-full cursor-pointer" : "block h-full w-full"}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
        onClick={handleClick}
      />
      {hover ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.name}
        </div>
      ) : null}
      <ul className="sr-only">
        {agents.map(agent => (
          <li key={agent.id}>
            <a href={agentUrl(agent)} onClick={event => { event.preventDefault(); navigate(agentUrl(agent)); }}>
              {t("office.agentLink", { name: agent.name })}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
