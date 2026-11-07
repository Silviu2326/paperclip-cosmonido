import { Calendar, MessagesSquare, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton, Banner, ErrorState, ForbiddenState, LoadingNote, useRetryable } from "./states";
import { ConversationsProposal } from "./ConversationsProposal";
import { ConversationsDrawer, ConversationsMailbox } from "./variants";
import { DEMO_THREADS, type Channel, type DemoThread } from "./demo-data";
import { longTextThreads, longThread, manyThreads, overdueThreads, type ConversationsScenario } from "./scenarios";

export type ConversationsVariant = "a" | "b" | "c";

const VARIANT_NOTE: Record<ConversationsVariant, string> = {
  a: "A · Tres paneles: lista, hilo y contexto del cliente siempre a la vista.",
  b: "B · Dos paneles: leer y responder primero; el contexto del cliente se abre en un cajón.",
  c: "C · Bandeja agrupada por cliente: toda la relación de un vistazo, lectura al lado.",
};

function PageSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6" aria-busy="true">
      <div className="flex items-end justify-between gap-3"><div className="flex flex-col gap-2"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-44" delay={0.1} /></div><Skeleton className="h-9 w-24" /></div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,300px)]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 p-2"><Skeleton className="h-10 w-10 shrink-0 rounded-xl" delay={index * 0.08} /><div className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-2/3" delay={index * 0.08} /><Skeleton className="h-3 w-1/2" delay={index * 0.08} /><Skeleton className="h-3 w-full" delay={index * 0.08} /></div></div>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border p-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="ml-auto h-12 w-2/3" delay={0.1} /><Skeleton className="h-12 w-1/2" delay={0.2} /><Skeleton className="ml-auto h-12 w-3/5" delay={0.3} /><Skeleton className="mt-6 h-20 w-full" delay={0.4} /></div>
        <div className="flex flex-col gap-3 max-xl:hidden"><Skeleton className="h-40 w-full" /><Skeleton className="h-28 w-full" delay={0.15} /></div>
      </div>
      <LoadingNote label="Cargando conversaciones…" />
    </div>
  );
}

function Frame({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{title}</h1>{subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}</div><Button variant="outline"><Calendar className="h-4 w-4" />Agenda</Button></header>
      {children}
    </div>
  );
}

function dataFor(scenario: ConversationsScenario): { threads: DemoThread[]; pageSize: number; disconnected: Channel[]; banner: React.ReactNode } {
  switch (scenario) {
    case "muchos": return { threads: manyThreads(), pageSize: 25, disconnected: [], banner: null };
    case "textos-largos": return { threads: longTextThreads(), pageSize: 0, disconnected: [], banner: null };
    case "hilo-largo": return { threads: longThread(), pageSize: 0, disconnected: [], banner: null };
    case "fuera-de-plazo": {
      const threads = overdueThreads();
      return { threads, pageSize: 0, disconnected: [], banner: <Banner tone="danger" icon={Zap} action={<Button size="sm">Responder la más antigua</Button>}>{threads.length} conversaciones han superado su plazo de respuesta. Los clientes llevan esperando hasta {threads.length * 3} horas.</Banner> };
    }
    case "canal-desconectado": return { threads: DEMO_THREADS, pageSize: 0, disconnected: ["whatsapp"], banner: <Banner tone="warning" action={<Button size="sm" variant="outline">Reconectar WhatsApp</Button>}>WhatsApp perdió la conexión hace 12 minutos. Los mensajes que lleguen se guardarán y no podrás responder por ese canal hasta reconectarlo.</Banner> };
    default: return { threads: DEMO_THREADS, pageSize: 0, disconnected: [], banner: null };
  }
}

/** Conversaciones with a design variant and a state. */
export function ConversationsBoard({ variant = "a", scenario = "normal" }: { variant?: ConversationsVariant; scenario?: ConversationsScenario }) {
  const retry = useRetryable(scenario === "error" ? "error" : "ok");
  if (scenario === "cargando" || retry.phase === "retrying") return <PageSkeleton />;
  if (scenario === "error" && retry.phase === "error") return <Frame title="Conversaciones"><ErrorState what="las conversaciones" onRetry={retry.retry} /></Frame>;
  if (scenario === "sin-permisos") return <Frame title="Conversaciones"><ForbiddenState what="las conversaciones con clientes" /></Frame>;
  const { threads, pageSize, disconnected, banner } = dataFor(scenario);
  const key = `${variant}-${scenario}`;
  return (
    <div className="flex min-w-0 flex-col">
      {banner ? <div className="px-4 pt-4 sm:px-6 sm:pt-6">{banner}</div> : null}
      {variant === "b" ? <ConversationsDrawer key={key} threads={threads} disconnected={disconnected} />
        : variant === "c" ? <ConversationsMailbox key={key} threads={threads} disconnected={disconnected} />
        : <ConversationsProposal key={key} threads={threads} pageSize={pageSize} disconnected={disconnected} />}
    </div>
  );
}

/** The three layouts one under the other, each with the sentence that says what it prioritises. */
export function ConversationsCompare() {
  return (
    <div className="flex min-w-0 flex-col gap-10 pb-10">
      {(["a", "b", "c"] as const).map((variant) => (
        <section key={variant} className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold sm:px-6"><MessagesSquare className="h-4 w-4" />{VARIANT_NOTE[variant]}</p>
          <ConversationsBoard variant={variant} />
        </section>
      ))}
    </div>
  );
}
