# Task 1: Extend backend queries

**Goal:** Add category/status filters to `getQids`, add a new `getVulnerabilityStats` function, and run the required database migrations.

**Files to modify:**

- `src/server/queries.server.ts`

**Database migrations to run once (use `bun -e` or psql with `DATABASE_URL`):**

```sql
ALTER TABLE kb_summary
ADD COLUMN IF NOT EXISTS cisa_kev boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ransomware boolean DEFAULT false;
```

```sql
DROP MATERIALIZED VIEW IF EXISTS mv_top_qids CASCADE;

CREATE MATERIALIZED VIEW mv_top_qids AS
WITH base AS (
  SELECT
    v."QID"::int AS qid,
    MAX(kb.title) AS title,
    CASE v."Severity"::int
      WHEN 5 THEN 'Crítica'
      WHEN 4 THEN 'Alta'
      WHEN 3 THEN 'Média'
      ELSE 'Baixa'
    END AS sev,
    COALESCE(a.team, 'Unknown') AS team,
    COALESCE(kb.category, 'Unknown') AS action,
    COUNT(*)::int AS count,
    COUNT(*) FILTER (WHERE kb.solution IS NOT NULL)::int AS corr,
    COUNT(*) FILTER (WHERE kb.solution IS NULL)::int AS "naoCorr",
    MAX(ROUND(EXTRACT(EPOCH FROM (now() - v."First_Found_Datetime"::timestamp)) / 86400)::int) AS age,
    MAX(kb.solution) AS solution,
    MAX(v."Status") AS status
  FROM vulnerabilities v
  JOIN (
    SELECT DISTINCT ON ("QG_HostID") "QG_HostID", team
    FROM "All_Assets"
  ) a ON v."QG_HostID" = a."QG_HostID"
  LEFT JOIN kb_summary kb ON v."QID" = kb.qid
  GROUP BY v."QID", a.team, kb.category, v."Severity"
  ORDER BY COUNT(*)::int DESC
  LIMIT 120
)
SELECT * FROM base;
```

**Changes to `src/server/queries.server.ts`:**

1. Add helper functions near the other filter helpers:

```ts
function categoriesFilterSql(categories?: string[]) {
  if (!categories || categories.length === 0) return sql``;
  return sql`AND COALESCE(kb.category, 'Unknown') IN ${sql(categories)}`;
}

function statusesFilterSql(statuses?: string[]) {
  if (!statuses || statuses.length === 0) return sql``;
  return sql`AND v."Status" IN ${sql(statuses)}`;
}
```

2. Update `getQids` signature:

```ts
export async function getQids({
  sev,
  team,
  q,
  tagFilter,
  categories,
  statuses,
}: {
  sev?: string | undefined;
  team?: string | undefined;
  q?: string | undefined;
  tagFilter?: TagFilter | undefined;
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
}): Promise<QidRow[]> {
```

3. Inside `getQids`, after the fast-path guard, define:

```ts
const catFilter = categoriesFilterSql(categories);
const statusFilter = statusesFilterSql(statuses);
```

4. The fast path (`SELECT * FROM mv_top_qids`) must only run when `!categories && !statuses && !q` (in addition to the existing team/sev/tagFilter guard). If any of those are present, fall through to the live query.

5. In the live query `SELECT` list, add:

```ts
MAX(v."Status") as "Status",
```

6. Append `${catFilter}` and `${statusFilter}` to the live query `WHERE` clause.

7. Update the fast-path row mapping to include `status: r["status"] ?? ""` and the live-query mapping to include `status: r["Status"] ?? ""`.

8. Add `getVulnerabilityStats` after `getQids`:

```ts
export type VulnerabilityStats = {
  total: number;
  critical: number;
  criticalPatchable: number;
  cisaKev: number;
  ransomware: number;
};

export async function getVulnerabilityStats({
  team,
  tagFilter,
  categories,
  statuses,
  q,
}: {
  team?: string | undefined;
  tagFilter?: TagFilter | undefined;
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
  q?: string | undefined;
}): Promise<VulnerabilityStats> {
  const cte = assetCteSql(team, tagFilter);
  const qFilter = q
    ? sql`AND (kb.title ILIKE ${`%${q}%`} OR kb.category ILIKE ${`%${q}%`} OR v."QID"::text ILIKE ${`%${q}%`})`
    : sql``;
  const catFilter = categoriesFilterSql(categories);
  const statusFilter = statusesFilterSql(statuses);

  const [row] = await sql`
    ${cte}
    SELECT
      COUNT(*)::int as "total",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5)::int as "critical",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5 AND kb.solution IS NOT NULL)::int as "criticalPatchable",
      COUNT(*) FILTER (WHERE kb.cisa_kev = true)::int as "cisaKev",
      COUNT(*) FILTER (WHERE kb.ransomware = true)::int as "ransomware"
    FROM vulnerabilities v
    JOIN filtered_assets a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN kb_summary kb ON v."QID" = kb.qid
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${qFilter}
      ${catFilter}
      ${statusFilter}
  `;

  return {
    total: row?.total ?? 0,
    critical: row?.critical ?? 0,
    criticalPatchable: row?.criticalPatchable ?? 0,
    cisaKev: row?.cisaKev ?? 0,
    ransomware: row?.ransomware ?? 0,
  };
}
```

**Verification:**

- Run `bun run build` and ensure it succeeds.
- Run a quick smoke query via `bun -e` to confirm `getQids` and `getVulnerabilityStats` return data without errors.

**Report file:** `.superpowers/sdd/task-1-report.md`
