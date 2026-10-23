import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { assignmentService } from "./assignments.js";

const companyId = "00000000-0000-4000-8000-000000000001";

describe("assignment list issue privacy", () => {
  it("applies the root read predicate before pagination and keeps records with a missing root", async () => {
    const events: string[] = [];
    let whereClause: any;
    const query = {
      from() { events.push("from"); return this; },
      leftJoin() { events.push("leftJoin"); return this; },
      where(value: unknown) { events.push("where"); whereClause = value; return this; },
      orderBy() { events.push("orderBy"); return this; },
      limit() { events.push("limit"); return Promise.resolve([]); },
    };
    const readCondition = sql<boolean>`issues.visibility = 'open'`;

    await assignmentService({ select: () => query } as any).list(companyId, { limit: 5, issueReadCondition: readCondition });

    expect(events).toEqual(["from", "leftJoin", "where", "orderBy", "limit"]);
    const compiled = new PgDialect().sqlToQuery(whereClause);
    expect(compiled.sql).toContain('"issues"."id" is null');
    expect(compiled.sql).toContain("issues.visibility = 'open'");
  });
});
