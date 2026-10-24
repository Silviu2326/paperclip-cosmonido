import { MessageCircle } from "lucide-react";
import { ErrorState, ForbiddenState, LoadingNote, Skeleton, useRetryable } from "../conversations/states";
import { ChatProposal } from "./ChatProposal";
import { chatScenarioData, type ChatScenario } from "./scenarios";
import { ChatDocument, ChatFloating } from "./variants";

export type ChatVariant = "a" | "b" | "c";

const VARIANT_NOTE: Record<ChatVariant, string> = {
  a: "A · Pantalla de chat: lista de agentes, hilo con tarjetas de trabajo y panel de encargos y archivos.",
  b: "B · Asistente flotante: disponible desde cualquier página y consciente de lo que estás viendo.",
  c: "C · Hilo como documento: lectura limpia y todo lo que hizo el agente plegado en una línea.",
};

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[420px] min-w-0 flex-col gap-4 p-4 sm:p-6"><h1 className="text-2xl font-semibold">Chat</h1>{children}</div>;
}

function PageSkeleton() {
  return (
    <div className="flex h-dvh min-h-0" aria-busy="true">
      <div className="flex w-full flex-col gap-3 border-r border-border p-3 lg:w-80 lg:shrink-0">
        <Skeleton className="h-7 w-24" /><Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-3 p-2"><Skeleton className="h-10 w-10 shrink-0 rounded-xl" delay={index * 0.08} /><div className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-1/2" delay={index * 0.08} /><Skeleton className="h-3 w-5/6" delay={index * 0.08} /></div></div>)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-6 max-lg:hidden">
        <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><Skeleton className="h-5 w-40" delay={0.1} /></div>
        <Skeleton className="h-14 w-2/3" delay={0.1} /><Skeleton className="ml-auto h-10 w-1/2" delay={0.2} /><Skeleton className="h-20 w-3/5" delay={0.3} />
        <div className="mt-auto flex flex-col gap-2"><LoadingNote label="Cargando tus conversaciones…" /><Skeleton className="h-14 w-full" /></div>
      </div>
    </div>
  );
}

/** Chat with agents: a design variant and a state. */
export function ChatBoard({ variant = "a", scenario = "normal" }: { variant?: ChatVariant; scenario?: ChatScenario }) {
  const retry = useRetryable(scenario === "error" ? "error" : "ok");
  if (scenario === "cargando" || retry.phase === "retrying") return <PageSkeleton />;
  if (scenario === "error" && retry.phase === "error") return <Frame><ErrorState what="tus conversaciones" onRetry={retry.retry} detail="El chat no pudo conectarse." /></Frame>;
  if (scenario === "sin-permisos") return <Frame><ForbiddenState what="el chat con agentes" /></Frame>;
  const data = chatScenarioData(scenario);
  const key = `${variant}-${scenario}`;
  if (variant === "b") return <ChatFloating key={key} agents={data.agents} conversations={data.conversations} initialAgentId={data.initialAgentId ?? "a-ceo"} />;
  if (variant === "c") return <ChatDocument key={key} agents={data.agents} conversations={data.conversations} initialAgentId={data.initialAgentId ?? "a-ceo"} />;
  return <ChatProposal key={key} agents={data.agents} conversations={data.conversations} initialAgentId={data.initialAgentId} pageSize={data.pageSize} behavior={data.behavior} />;
}

/** The three layouts one under the other. */
export function ChatCompare() {
  return (
    <div className="flex min-w-0 flex-col gap-10 pb-10">
      {(["a", "b", "c"] as const).map((variant) => (
        <section key={variant} className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold sm:px-6"><MessageCircle className="h-4 w-4" />{VARIANT_NOTE[variant]}</p>
          <ChatBoard variant={variant} />
        </section>
      ))}
    </div>
  );
}
