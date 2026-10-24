import { useEffect } from "react";
import { CustomersBoard } from "./CustomersBoard";
import { CustomersProposal } from "./CustomersProposal";
import { CustomersTable } from "./CustomersTable";
import { DEMO_CUSTOMERS, setMoneyHidden, type DemoCustomer } from "./demo-data";
import { ARCHIVED_CUSTOMERS, LONG_TEXT_CUSTOMERS, makeManyCustomers } from "./scenario-data";
import { LoadError, LoadingStatus, PermissionNotice, Skeleton, VariantTabs, usePhase } from "./scenario-parts";

export type CustomersState =
  | "normal" | "cargando" | "error" | "muchos" | "textos-largos" | "sin-permisos" | "sin-resultados" | "archivados";
export type CustomersVariant = "a" | "b" | "c";

export const CUSTOMERS_VARIANT_SUMMARY: Record<CustomersVariant, { label: string; summary: string }> = {
  a: { label: "A · Tarjetas y panel", summary: "Contar la historia de cada cliente: tarjetas con su próximo paso y un panel con toda su gente, servicios y trabajo." },
  b: { label: "B · Tabla densa", summary: "Ver muchos clientes a la vez y trabajar rápido: columnas ordenables, edición en línea de salud y responsable, y acciones en lote." },
  c: { label: "C · Tablero por salud", summary: "Saber de un vistazo dónde está el riesgo: tres columnas por salud de la relación; arrastrar una tarjeta cambia su estado." },
};

function CustomersSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6" aria-busy="true">
      <LoadingStatus label="Cargando clientes…" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex w-full max-w-xs flex-col gap-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-full" /></div>
        <div className="flex gap-2"><Skeleton className="h-9 w-36" /><Skeleton className="h-9 w-32" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
      <div className="flex flex-wrap gap-3"><Skeleton className="h-10 w-full max-w-72" /><Skeleton className="h-10 min-w-40 flex-1" /></div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Skeleton className="h-3" /><Skeleton className="h-3" /><Skeleton className="h-3" /><Skeleton className="h-3" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function dataFor(state: CustomersState, customers: DemoCustomer[]): DemoCustomer[] {
  if (state === "muchos") return makeManyCustomers(180);
  if (state === "textos-largos") return [...LONG_TEXT_CUSTOMERS, ...DEMO_CUSTOMERS.slice(0, 3)];
  if (state === "archivados") return [...DEMO_CUSTOMERS, ...ARCHIVED_CUSTOMERS];
  return customers;
}

function Ready({ state, variant, customers }: { state: CustomersState; variant: CustomersVariant; customers: DemoCustomer[] }) {
  const data = dataFor(state, customers);
  const readOnly = state === "sin-permisos";
  const pageSize = state === "muchos" ? (variant === "a" ? 25 : 40) : undefined;
  const key = `${state}-${variant}`;
  return (
    <div className="flex min-w-0 flex-col">
      {readOnly ? (
        <div className="px-4 pt-4 sm:px-6 sm:pt-6">
          <PermissionNotice title="Estás viendo Clientes como miembro">
            Puedes consultar a los clientes y sus conversaciones. No ves importes ni puedes crear, importar o mover clientes: pídeselo a un administrador.
          </PermissionNotice>
        </div>
      ) : null}
      {variant === "a" ? (
        <CustomersProposal key={key} customers={data} pageSize={pageSize} canCreate={!readOnly} initialQuery={state === "sin-resultados" ? "Zzz Ferretería" : ""} initialFilter={state === "archivados" ? "archived" : "all"} />
      ) : variant === "b" ? (
        <CustomersTable key={key} customers={data} pageSize={pageSize} canCreate={!readOnly} initialQuery={state === "sin-resultados" ? "Zzz Ferretería" : ""} />
      ) : (
        <CustomersBoard key={key} customers={data} pageSize={pageSize} canCreate={!readOnly} />
      )}
    </div>
  );
}

/** Clientes in any state and any of the three designs. State and variant are the only inputs; data comes from the demo set. */
export function CustomersPage({ customers = DEMO_CUSTOMERS, state = "normal", variant = "a" }: {
  customers?: DemoCustomer[];
  state?: CustomersState;
  variant?: CustomersVariant;
}) {
  const initialPhase = state === "cargando" ? "loading" : state === "error" ? "error" : "ready";
  const { phase, retrying, retry } = usePhase(initialPhase);
  // Members without billing access see "—" for every amount.
  setMoneyHidden(state === "sin-permisos");
  useEffect(() => () => setMoneyHidden(false), []);

  if (phase === "loading") return <CustomersSkeleton />;
  if (phase === "error") {
    return (
      <div className="p-6">
        <LoadError
          title="No hemos podido cargar tus clientes"
          detail="La conexión con el servidor se interrumpió (error 503). Es temporal casi siempre."
          onRetry={retry}
          retrying={retrying}
        />
      </div>
    );
  }
  return <Ready state={state === "cargando" || state === "error" ? "normal" : state} variant={variant} customers={customers} />;
}

/** The three designs in tabs, each with a sentence about what it favours. */
export function CustomersVariants({ state = "normal" }: { state?: CustomersState }) {
  return (
    <VariantTabs
      items={(["a", "b", "c"] as const).map((variant) => ({
        id: variant,
        label: CUSTOMERS_VARIANT_SUMMARY[variant].label,
        summary: CUSTOMERS_VARIANT_SUMMARY[variant].summary,
        render: () => <CustomersPage variant={variant} state={state} />,
      }))}
    />
  );
}
