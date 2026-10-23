# S95 business home — customer portfolio evidence

The customer portfolio integration coverage is authored in
`server/src/services/productization/customer-portfolio.integration.test.ts`.
It uses the repository's embedded PostgreSQL test helper and inserts actual
company, customer, project, assignment, cost, review and commitment rows. The
cases cover company scoping and foreign-cursor rejection, current/previous
30-day cost attribution with unpriced-event counts and attention state, and
25-row keyset pagination. The populated-page cases also count calls through the
real Drizzle client to guard against per-customer query growth; they do not
mock SQL results.

The narrow test command was first attempted in the sandbox, where embedded
PostgreSQL could not start (`uv_os_get_passwd returned ENOMEM`). On the root's
authorization, the same command was then rerun outside the sandbox against its
private temporary PostgreSQL cluster:

```text
pnpm --filter @paperclipai/server exec vitest run src/services/productization/customer-portfolio.integration.test.ts --reporter=verbose
```

Result: **3 passed, 0 failed, 0 skipped**. The cases ran against real rows in
the temporary PostgreSQL database. This is fixture-level integration evidence;
it does not establish query-plan performance or behavior under production-scale
data.

The tests cover fixture-scale correctness and the service's bounded ORM call
shape. They do not measure query latency, table-scale plans, concurrent writes,
or performance under a large production dataset.
