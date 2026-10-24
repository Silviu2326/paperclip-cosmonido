import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ChevronLeft, ChevronRight, MessagesSquare, Plus, Repeat, Sparkles, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { Avatar, CustomerPanel, HEALTH, Pill } from "./CustomersProposal";
import { euros, type DemoCustomer } from "./demo-data";
import { LoadMoreButton, useLoadMore } from "./scenario-parts";

type Health = DemoCustomer["health"];
const COLUMNS: { id: Health; hint: string }[] = [
  { id: "good", hint: "La relación va bien" },
  { id: "watch", hint: "Hay algo que vigilar" },
  { id: "risk", hint: "Puede perderse" },
];
const monthlyOf = (customer: DemoCustomer) => customer.services.filter((service) => service.status !== "paused").reduce((sum, service) => sum + service.monthlyCents, 0);

function BoardCard({ customer, index, canMove, onMove, onOpen, selected, onDragStart }: {
  customer: DemoCustomer; index: number; canMove: boolean; onMove: (direction: -1 | 1) => void; onOpen: () => void; selected: boolean; onDragStart: () => void;
}) {
  const tokens = useMotionTokens();
  const health = HEALTH[customer.health];
  const position = COLUMNS.findIndex((column) => column.id === customer.health);
  const monthly = monthlyOf(customer);
  return (
    <div draggable={canMove} onDragStart={canMove ? onDragStart : undefined} className="min-w-0">
    <motion.article
      layout
      layoutId={customer.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
      className={cn("group relative flex min-w-0 flex-col gap-2 rounded-xl border bg-background p-3 shadow-sm", canMove && "cursor-grab active:cursor-grabbing", selected ? "border-transparent" : "border-border")}
      style={selected ? { boxShadow: `0 0 0 2px ${health.color}` } : undefined}
    >
      <button onClick={onOpen} className="flex min-w-0 items-start gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar name={customer.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{customer.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{customer.contacts[0]?.name ?? "Sin contacto"}</span>
        </span>
        {customer.unreadConversations ? <Pill color="var(--agent-7a)" strong><MessagesSquare className="h-3 w-3" />{customer.unreadConversations}</Pill> : null}
      </button>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Repeat className="h-3 w-3" />{monthly ? `${euros(monthly)}/mes` : "Sin servicios"}</span>
        <span>{customer.activeTasks} {customer.activeTasks === 1 ? "tarea" : "tareas"}</span>
      </div>
      {customer.nextAction ? (
        <p className="flex items-start gap-1.5 rounded-lg px-2 py-1 text-xs" style={{ background: tint(health.color, 14) }}>
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" style={{ color: readable(health.color) }} /><span className="min-w-0 break-words">{customer.nextAction}</span>
        </p>
      ) : null}
      {canMove ? (
        <div className="absolute bottom-1.5 right-1.5 flex gap-0.5 rounded-lg bg-background/90 opacity-0 shadow-sm transition-opacity duration-(--motion-duration-fast) focus-within:opacity-100 group-hover:opacity-100">
          <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Mover ${customer.name} a la izquierda`} disabled={position === 0} onClick={() => onMove(-1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Mover ${customer.name} a la derecha`} disabled={position === COLUMNS.length - 1} onClick={() => onMove(1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      ) : null}
    </motion.article>
    </div>
  );
}

/** Variant C: a board by relationship health. Drag a customer (or use the arrows) to change how the relationship is going. */
export function CustomersBoard({ customers, pageSize, canCreate = true }: { customers: DemoCustomer[]; pageSize?: number; canCreate?: boolean }) {
  const tokens = useMotionTokens();
  const [rows, setRows] = useState(customers.filter((customer) => !customer.archived));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<Health | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; from: Health; name: string; to: Health } | null>(null);
  const opened = rows.find((customer) => customer.id === openId) ?? null;
  const pages = {
    good: useLoadMore(rows.filter((customer) => customer.health === "good"), pageSize),
    watch: useLoadMore(rows.filter((customer) => customer.health === "watch"), pageSize),
    risk: useLoadMore(rows.filter((customer) => customer.health === "risk"), pageSize),
  };

  function move(id: string, to: Health) {
    const current = rows.find((customer) => customer.id === id);
    if (!current || current.health === to) return;
    setRows((list) => list.map((customer) => customer.id === id ? { ...customer, health: to } : customer));
    setUndo({ id, from: current.health, name: current.name, to });
    window.setTimeout(() => setUndo((value) => value?.id === id ? null : value), 4500);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{rows.length} clientes · {euros(rows.reduce((sum, customer) => sum + monthlyOf(customer), 0))}/mes · arrastra una tarjeta para cambiar su salud</p>
        </div>
        {canCreate ? <div className="flex gap-2"><Button variant="outline"><Upload className="h-4 w-4" />Importar</Button><Button><Plus className="h-4 w-4" />Nuevo cliente</Button></div> : null}
      </header>

      <div className={cn("grid min-w-0 gap-4", opened ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]" : "")}>
        <LayoutGroup id="customers-board">
          <div className="grid min-w-0 gap-3 md:grid-cols-3">
            {COLUMNS.map((column) => {
              const health = HEALTH[column.id];
              const list = pages[column.id];
              const total = rows.filter((customer) => customer.health === column.id);
              const over = overColumn === column.id;
              return (
                <section
                  key={column.id}
                  aria-label={`${health.label}: ${total.length} clientes`}
                  onDragOver={(event) => { event.preventDefault(); setOverColumn(column.id); }}
                  onDragLeave={() => setOverColumn((value) => value === column.id ? null : value)}
                  onDrop={() => { if (dragId) move(dragId, column.id); setDragId(null); setOverColumn(null); }}
                  className="flex min-w-0 flex-col gap-2 rounded-2xl border border-transparent p-2 transition-colors duration-(--motion-duration-fast)"
                  style={{ background: tint(health.color, over ? 24 : 10), borderColor: over ? health.color : "transparent" }}
                >
                  <div className="flex items-baseline justify-between gap-2 px-1.5 pt-1">
                    <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: health.color }} />{health.label}<span className="text-xs font-normal text-muted-foreground tabular-nums">{total.length}</span></h2>
                    <span className="text-xs text-muted-foreground tabular-nums">{euros(total.reduce((sum, customer) => sum + monthlyOf(customer), 0))}/mes</span>
                  </div>
                  <p className="px-1.5 text-xs text-muted-foreground">{column.hint}</p>
                  <div className="flex min-h-24 flex-col gap-2">
                    {list.visible.map((customer, index) => (
                      <BoardCard
                        key={customer.id}
                        customer={customer}
                        index={index}
                        canMove={canCreate}
                        selected={customer.id === openId}
                        onOpen={() => setOpenId(customer.id === openId ? null : customer.id)}
                        onMove={(direction) => move(customer.id, COLUMNS[COLUMNS.findIndex((item) => item.id === customer.health) + direction]!.id)}
                        onDragStart={() => setDragId(customer.id)}
                      />
                    ))}
                    {total.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Suelta aquí un cliente</p> : null}
                    <LoadMoreButton remaining={list.remaining} onClick={list.more} noun="clientes" />
                  </div>
                </section>
              );
            })}
          </div>
        </LayoutGroup>
        <AnimatePresence>
          {opened ? (
            <motion.div key={opened.id} className="min-w-0 xl:sticky xl:top-4 xl:self-start" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }}>
              <CustomerPanel customer={opened} onClose={() => setOpenId(null)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {undo ? (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }}
            className="fixed bottom-6 left-1/2 z-40 flex max-w-full -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            <span className="max-w-xs truncate"><strong>{undo.name}</strong> pasa a «{HEALTH[undo.to].label}»</span>
            <Button size="sm" variant="ghost" onClick={() => { move(undo.id, undo.from); setUndo(null); }}><Undo2 className="h-3.5 w-3.5" />Deshacer</Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
