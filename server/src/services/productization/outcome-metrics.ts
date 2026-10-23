import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import type { OutcomeMetrics } from "@paperclipai/shared/productization/outcome-metrics";

type Row = Record<string, unknown>;
function rowsOf(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  const rows = (result as { rows?: Row[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Two adjacent UTC intervals, one aggregate query, no per-customer N+1 reads. */
export function outcomeMetricsService(db: Db) {
  return {
    async read(companyId: string, days: number): Promise<OutcomeMetrics> {
      const to = new Date();
      const from = new Date(to.getTime() - days * 86_400_000);
      const previousFrom = new Date(from.getTime() - days * 86_400_000);
      const rows = rowsOf(await db.execute(sql`
        with periods as (
          select 'current'::text as period, ${from.toISOString()}::timestamptz as start_at, ${to.toISOString()}::timestamptz as end_at
          union all select 'previous', ${previousFrom.toISOString()}::timestamptz, ${from.toISOString()}::timestamptz
        ), first_acceptance as (
          select g.id, g.created_at, min(r.reviewed_at) as accepted_at
          from goals g join deliverable_reviews r on r.goal_id = g.id and r.company_id = g.company_id
          where g.company_id = ${companyId} and g.kind = 'assignment'
            and r.state = 'accepted' and r.reviewed_at >= g.created_at
          group by g.id, g.created_at
        )
        select p.period,
          (select count(*) from goals g where g.company_id = ${companyId} and g.kind = 'assignment' and g.created_at >= p.start_at and g.created_at < p.end_at) as assignments,
          (select count(*) from first_acceptance a where a.accepted_at >= p.start_at and a.accepted_at < p.end_at) as accepted,
          (select avg(extract(epoch from (a.accepted_at - a.created_at)) * 1000) from first_acceptance a where a.accepted_at >= p.start_at and a.accepted_at < p.end_at) as acceptance_ms,
          (select count(*) from deliverable_reviews r where r.company_id = ${companyId} and r.state = 'changes_requested' and r.reviewed_at >= p.start_at and r.reviewed_at < p.end_at) as corrections,
          (select count(*) from leads l where l.company_id = ${companyId} and l.created_at >= p.start_at and l.created_at < p.end_at) as leads,
          (select count(*) from leads l where l.company_id = ${companyId} and l.converted_at >= p.start_at and l.converted_at < p.end_at) as converted,
          (select count(*) from calendar_events e where e.company_id = ${companyId} and e.status = 'confirmed' and e.external_id is not null and e.starts_at >= p.start_at and e.starts_at < p.end_at) as meetings,
          (select count(*) from opportunities o where o.company_id = ${companyId} and o.status = 'won' and o.closed_at >= p.start_at and o.closed_at < p.end_at) as won,
          (select count(*) from cost_events c where c.company_id = ${companyId} and c.goal_id is null and c.occurred_at >= p.start_at and c.occurred_at < p.end_at) as unattributed_cost_events,
          (select sum(c.cost_cents) / nullif(count(distinct a.id), 0) from first_acceptance a join cost_events c on c.goal_id = a.id and c.company_id = ${companyId}
            where a.accepted_at >= p.start_at and a.accepted_at < p.end_at and c.occurred_at <= a.accepted_at and c.cost_status <> 'unpriced') as cost_per_priced_result
        from periods p
      `));
      const current = rows.find(row => row.period === "current") ?? {};
      const previous = rows.find(row => row.period === "previous") ?? {};
      const definitions: Array<[string, "count" | "milliseconds" | "usd_cents", string, string]> = [
        ["assignments", "count", "goals.created_at; kind=assignment", "Encargos creados; no acredita inicio de ejecución."],
        ["accepted", "count", "deliverable_reviews.reviewed_at; state=accepted", "Un encargo por su primera aceptación registrada; sin revisión no se cuenta."],
        ["acceptance_ms", "milliseconds", "goals.created_at → primera deliverable_reviews.reviewed_at aceptada", "Media de los encargos con primera aceptación en el periodo; sin muestra queda vacío."],
        ["corrections", "count", "deliverable_reviews; changes_requested", "Decisiones de pedir cambios; puede haber varias versiones por encargo."],
        ["leads", "count", "leads.created_at", "Entradas registradas; no equivale a personas únicas entre todos los sistemas."],
        ["converted", "count", "leads.converted_at", "Conversiones registradas; no equivale a ventas ni pagos."],
        ["meetings", "count", "calendar_events.starts_at; confirmed + external_id", "Reservas con recibo de proveedor; una reunión confirmada no demuestra asistencia."],
        ["won", "count", "opportunities.closed_at; status=won", "Oportunidades ganadas; no equivale a dinero cobrado."],
        ["unattributed_cost_events", "count", "cost_events.goal_id IS NULL", "Sin atribución directa a objetivo; el informe de costes S1 puede resolver atribución por tarea."],
        ["cost_per_priced_result", "usd_cents", "cost_events.goal_id → encargos aceptados", "Sólo encargos con coste directo valorado hasta aceptación; excluye costes sin precio, sin goal_id y atribución por descendientes. No representa el coste completo."],
      ];
      return {
        companyId, generatedAt: new Date().toISOString(),
        current: { from: from.toISOString(), to: to.toISOString() }, previous: { from: previousFrom.toISOString(), to: from.toISOString() },
        metrics: definitions.map(([key, unit, source, coverage]) => ({ key, unit, source, coverage, current: numberOrNull(current[key]), previous: numberOrNull(previous[key]) })),
      };
    },
  };
}
