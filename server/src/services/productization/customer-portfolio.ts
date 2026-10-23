import { and, asc, eq, gt, sql } from "drizzle-orm";
import { customers, type Db } from "@paperclipai/db";
import type { CustomerPortfolio } from "@paperclipai/shared/productization/customer-portfolio";
import { notFound } from "../../errors.js";

function rowsOf(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value : (value as { rows?: Record<string, unknown>[] })?.rows ?? []; }
const numeric = (value: unknown) => value == null ? null : Math.max(0, Number(value));

/** Bounded customer page + one grouped query; no per-client query loop. */
export function customerPortfolioService(db: Db) {
  return { async read(companyId: string, days: number, cursor?: string): Promise<CustomerPortfolio> {
    if (cursor && !(await db.select({ id: customers.id }).from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, cursor))).limit(1))[0]) throw notFound("Customer cursor not found");
    const page = await db.select({ id: customers.id, name: customers.name }).from(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.status, "active"), cursor ? gt(customers.id, cursor) : undefined)).orderBy(asc(customers.id)).limit(26);
    const visible = page.slice(0, 25), to = new Date(), from = new Date(to.getTime() - days * 86_400_000), previousFrom = new Date(from.getTime() - days * 86_400_000);
    const rows = visible.length ? rowsOf(await db.execute(sql`
      with selected as (select id from customers where company_id = ${companyId} and id in (${sql.join(visible.map(c => sql`${c.id}::uuid`), sql`, `)})),
      selected_projects as (select p.id, p.customer_id from projects p join selected s on s.id=p.customer_id where p.company_id=${companyId}),
      work as (select g.id, p.customer_id, g.status from goals g join selected_projects p on p.id=g.project_id where g.company_id=${companyId} and g.kind='assignment'),
      costs as (
        select coalesce(p.customer_id, g.customer_id) customer_id, c.cost_cents, c.cost_status, c.occurred_at
        from cost_events c
        left join selected_projects p on p.id=c.project_id
        left join work g on g.id=c.goal_id
        where c.company_id=${companyId} and c.occurred_at >= ${previousFrom.toISOString()}::timestamptz and c.occurred_at < ${to.toISOString()}::timestamptz
          and (p.customer_id is not null or g.customer_id is not null)
      ), totals as (
        select customer_id,
          sum(cost_cents) filter (where occurred_at>=${from.toISOString()}::timestamptz and cost_status<>'unpriced') current_cost,
          sum(cost_cents) filter (where occurred_at<${from.toISOString()}::timestamptz and cost_status<>'unpriced') previous_cost,
          count(*) filter (where cost_status='unpriced' and occurred_at>=${from.toISOString()}::timestamptz) unpriced
        from costs group by customer_id
      ), work_counts as (select customer_id,count(*) filter (where status='active') active from work group by customer_id),
      reviews as (select w.customer_id,count(*) pending from deliverable_reviews r join work w on w.id=r.goal_id where r.company_id=${companyId} and r.state='pending' group by w.customer_id),
      overdue as (select c.customer_id,count(*) due from commitments c join selected s on s.id=c.customer_id where c.company_id=${companyId} and c.who='us' and c.status='open' and c.due_at<${to.toISOString()}::timestamptz group by c.customer_id)
      select s.id,coalesce(w.active,0) active,coalesce(r.pending,0) pending,coalesce(o.due,0) due,t.current_cost,t.previous_cost,coalesce(t.unpriced,0) unpriced
      from selected s left join work_counts w on w.customer_id=s.id left join reviews r on r.customer_id=s.id left join overdue o on o.customer_id=s.id left join totals t on t.customer_id=s.id
    `)) : [];
    const byId = new Map(rows.map(row => [String(row.id), row]));
    return { companyId, generatedAt: to.toISOString(), days, current: { from: from.toISOString(), to: to.toISOString() }, previous: { from: previousFrom.toISOString(), to: from.toISOString() }, nextCursor: page.length > 25 ? visible.at(-1)!.id : null,
      coverage: "Estado actual de encargos, revisiones y compromisos propios con customer_id directo. Coste USD atribuido directamente por proyecto o encargo; excluye eventos sin vínculo y sin precio. No mide satisfacción, margen, facturas ni coste completo.",
      items: visible.map(customer => { const row = byId.get(customer.id) ?? {}; const activeAssignments=Number(row.active ?? 0), pendingReviews=Number(row.pending ?? 0), overdueCommitments=Number(row.due ?? 0); return { customerId: customer.id, name: customer.name, activeAssignments, pendingReviews, overdueCommitments, currentCostCents:numeric(row.current_cost), previousCostCents:numeric(row.previous_cost), unpricedEvents:Number(row.unpriced ?? 0), state:pendingReviews || overdueCommitments ? "needs_attention" : activeAssignments ? "work_active" : "no_open_work" }; }),
    };
  } };
}
