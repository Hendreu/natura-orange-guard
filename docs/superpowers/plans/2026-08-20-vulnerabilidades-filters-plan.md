# Vulnerability Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `/vulnerabilidades` into a Qualys-style vulnerability view with top KPI cards, a sidebar of quick filters, and an aggregated-by-QID table, while keeping the home page as a strategic overview.

**Architecture:** Add new filter dimensions (`categories`, `statuses`, `q`) and a stats endpoint to the existing server query layer. Expose them through `data.fn.ts` and `sla-data.ts`. Build a reusable checkbox filter group and rebuild the `/vulnerabilidades` route with cards, sidebar, and table. Reuse existing materialized-view fast path when no filters are applied, falling back to live SQL when filters are active.

**Tech Stack:** TanStack Start + React 19, Recharts (not used here), shadcn/ui, postgres.js, Tailwind CSS v4, Bun.

## Global Constraints

- Use `Bun` for all commands.
- Do not import `server-only`; keep DB code in `src/server/queries.server.ts` and load it dynamically from `src/lib/data.fn.ts`.
- Do not add new dependencies unless unavoidable.
- Follow existing naming: `QG_HostID`, `QID`, `kb_summary.qid`, severity labels in Portuguese.
- Quote uppercase Postgres identifiers in raw SQL (`"Status"`, `"QG_HostID"`).
- Type-check with `bun typecheck` from the repo root is not available; rely on editor diagnostics and `bun run build`.

## File Map

| File                              | Responsibility                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/server/queries.server.ts`    | Add `categories`/`statuses` filters to `getQids`; add `getVulnerabilityStats`.                  |
| `src/lib/data.fn.ts`              | Add `fetchVulnerabilityStats` server function. Extend `fetchQids` validator.                    |
| `src/lib/sla-data.ts`             | Add `VulnerabilityStats` type; add `vulnerabilityStatsQueryOptions`; extend `qidsQueryOptions`. |
| `src/components/FilterGroup.tsx`  | Reusable checkbox filter group with count badges.                                               |
| `src/routes/vulnerabilidades.tsx` | New layout: KPI cards, sidebar filters, aggregated table.                                       |
| `src/routes/index.tsx`            | Add a card linking to `/vulnerabilidades`.                                                      |

---

### Task 1: Extend backend queries

**Files:**

- Modify: `src/server/queries.server.ts`

**Interfaces:**

- Consumes: existing `assetCteSql`, `severityLabelExpr`, `statusFilterSql`, `extractTeamExpr`.
- Produces:
  - `getQids({ sev, team, q, tagFilter, categories, statuses })`
  - `getVulnerabilityStats({ team, tagFilter, categories, statuses, q })`

**Step 1: Add missing boolean columns to `kb_summary`**

Run once against the database:

```sql
ALTER TABLE kb_summary
ADD COLUMN IF NOT EXISTS cisa_kev boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ransomware boolean DEFAULT false;
```

These columns are referenced by `getVulnerabilityStats`. Until the ETL supplies real data, `NULL` values are treated as non-matching, so the cards show `0`.

**Step 2: Recreate `mv_top_qids` with a `status` column**

Run once against the database:

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

This adds the `status` column needed by the new table, without changing the existing column set otherwise.

**Step 3: Add helper for category/status filters**

Insert near the other filter helpers:

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

**Step 4: Change `getQids` signature and body**

Find the `export async function getQids` block and replace its parameter destructuring and usage.

Old signature:

```ts
export async function getQids({
  sev,
  team,
  q,
  tagFilter,
}: {
  sev?: string | undefined;
  team?: string | undefined;
  q?: string | undefined;
  tagFilter?: TagFilter | undefined;
}): Promise<QidRow[]> {
```

New signature:

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

Inside the function, after the fast path guard, add:

```ts
const catFilter = categoriesFilterSql(categories);
const statusFilter = statusesFilterSql(statuses);
```

In the live query `SELECT` list, add:

```ts
MAX(v."Status") as "Status",
```

Append the filters to the `WHERE` clause in both the fast-path and live-query branches. The live query ends with:

```ts
    WHERE ${statusFilterSql()}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${sevFilter}
      ${qFilter}
      ${catFilter}
      ${statusFilter}
    GROUP BY v."QID", ${teamExpr}, COALESCE(kb.category, 'Unknown'), ${severityLabelExpr()}
```

For the fast path, only apply filters when `categories`/`statuses`/`q` are empty; otherwise fall through to the live query. If the fast path currently returns `mv_top_qids`, keep it but add a guard so it is only used when `!categories && !statuses && !q`.

Update the row mapping in both branches to include:

```ts
status: r["Status"] ?? "",
```

**Step 5: Add `getVulnerabilityStats`**

Add after `getQids`:

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
  const sevFilter = sql``;
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

**Step 6: Verify file has no TypeScript errors**

Run:

```bash
bun run build
```

Expected: build succeeds or fails only on unrelated errors.

---

### Task 2: Expose server functions and query options

**Files:**

- Modify: `src/lib/data.fn.ts`
- Modify: `src/lib/sla-data.ts`

**Interfaces:**

- Consumes: `getQids` and `getVulnerabilityStats` from `src/server/queries.server.ts`.
- Produces:
  - `fetchQids` accepts `categories?: string[]` and `statuses?: string[]`.
  - `fetchVulnerabilityStats` server function.
  - `qidsQueryOptions` and `vulnerabilityStatsQueryOptions`.

**Step 1: Update `src/lib/data.fn.ts`**

Extend `qidsFilterSchema`:

```ts
const qidsFilterSchema = z.object({
  sev: z.string().optional(),
  team: z.string().optional(),
  q: z.string().optional(),
  tagFilter: tagFilterSchema,
  categories: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
});
```

Add after `fetchReports`:

```ts
const statsFilterSchema = z.object({
  team: z.string().optional(),
  tagFilter: tagFilterSchema,
  categories: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  q: z.string().optional(),
});

export const fetchVulnerabilityStats = createServerFn({ method: "GET" })
  .validator(statsFilterSchema)
  .handler(async ({ data }) => {
    const { getVulnerabilityStats } = await import("../server/queries.server");
    return await getVulnerabilityStats(data);
  });
```

**Step 2: Update `src/lib/sla-data.ts`**

Add type:

```ts
export type VulnerabilityStats = {
  total: number;
  critical: number;
  criticalPatchable: number;
  cisaKev: number;
  ransomware: number;
};
```

Import `fetchVulnerabilityStats`:

```ts
import {
  fetchTeamData,
  fetchOverview,
  fetchAllTeamsData,
  fetchQids,
  fetchAssets,
  fetchHardening,
  fetchReports,
  fetchVulnerabilityStats,
} from "./data.fn";
```

Update `qidsQueryOptions`:

```ts
export const qidsQueryOptions = (filters: {
  sev?: string;
  team?: string;
  q?: string;
  tagFilter?: TagFilter | undefined;
  categories?: string[];
  statuses?: string[];
}) =>
  queryOptions({
    queryKey: ["qids", filters],
    queryFn: () => fetchQids({ data: filters }),
  });
```

Add:

```ts
export const vulnerabilityStatsQueryOptions = (filters: {
  team?: string;
  tagFilter?: TagFilter | undefined;
  categories?: string[];
  statuses?: string[];
  q?: string;
}) =>
  queryOptions({
    queryKey: ["vulnerability-stats", filters],
    queryFn: () => fetchVulnerabilityStats({ data: filters }),
  });
```

**Step 3: Type check**

Run:

```bash
bun run build
```

---

### Task 3: Create `FilterGroup` component

**Files:**

- Create: `src/components/FilterGroup.tsx`

**Interfaces:**

- Consumes: list of `{ value: string; label: string; count: number }`.
- Produces: `FilterGroup` React component that calls `onChange(selected: string[])`.

**Step 1: Write component**

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type FilterOption = {
  value: string;
  label: string;
  count: number;
};

export function FilterGroup({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div className="space-y-2">
      <h4 className="stencil text-[10px] uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[11px] transition-colors hover:bg-steel",
              selected.includes(o.value) && "bg-steel",
            )}
          >
            <span className="flex items-center gap-2">
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
                className="h-3.5 w-3.5"
              />
              <span className="text-foreground">{o.label}</span>
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {o.count.toLocaleString("pt-BR")}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

Make sure `src/components/ui/checkbox.tsx` exists. If it does not, use a native `<input type="checkbox" />` instead.

**Step 2: Verify import path**

Run:

```bash
bun run build
```

---

### Task 4: Rebuild `/vulnerabilidades` route

**Files:**

- Modify: `src/routes/vulnerabilidades.tsx`

**Interfaces:**

- Consumes: `qidsQueryOptions`, `vulnerabilityStatsQueryOptions`, `FilterGroup`, `StatSlab`, `severityToken`, `severityOrder`, `fmt`, `teamNames`.
- Produces: updated route component with cards, sidebar, filters, table.

**Step 1: Update imports**

```tsx
import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Shell } from "@/components/Shell";
import { StatSlab } from "@/components/StatSlab";
import { FilterGroup } from "@/components/FilterGroup";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  fmt,
  qidsQueryOptions,
  vulnerabilityStatsQueryOptions,
  severityOrder,
  severityToken,
  teamNames,
  type QidRow,
} from "@/lib/sla-data";
```

**Step 2: Update search schema and validation**

```ts
type VulnSearch = {
  q?: string | undefined;
  sev?: string | undefined;
  team?: string | undefined;
  tagFilter?: ("full" | "full-cloud" | "full-on-premise") | undefined;
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
};

const parseArray = (value: unknown): string[] | undefined => {
  if (typeof value === "string" && value) return value.split(",");
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return undefined;
};

export const Route = createFileRoute("/vulnerabilidades")({
  validateSearch: (search: Record<string, unknown>): VulnSearch => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    sev: typeof search["sev"] === "string" ? search["sev"] : undefined,
    team: typeof search["team"] === "string" ? search["team"] : undefined,
    tagFilter:
      search["tagFilter"] === "full" ||
      search["tagFilter"] === "full-cloud" ||
      search["tagFilter"] === "full-on-premise"
        ? search["tagFilter"]
        : undefined,
    categories: parseArray(search["categories"]),
    statuses: parseArray(search["statuses"]),
  }),
```

**Step 3: Replace the component body**

Read `search`, initialize local state, derive query options for stats and rows, and render the new layout.

Key state:

```ts
const search = Route.useSearch();
const navigate = useNavigate({ from: "/vulnerabilidades" });
const q = search.q ?? "";
const sev = search.sev ?? "Todas";
const team = search.team ?? "Todas";
const tagFilter = search.tagFilter ?? "full";
const categories = search.categories ?? [];
const statuses = search.statuses ?? ["Active", "New", "Re-Opened"];
const [qInput, setQInput] = useState(q);
const debouncedQ = useDebouncedValue(qInput, 300);
```

Setters for array filters:

```ts
const setCategories = (values: string[]) =>
  navigate({
    search: (prev: VulnSearch) => ({
      ...prev,
      categories: values.length ? values : undefined,
    }),
  });

const setStatuses = (values: string[]) =>
  navigate({
    search: (prev: VulnSearch) => ({
      ...prev,
      statuses: values.length ? values : undefined,
    }),
  });
```

Keep existing `setParam` for scalar fields.

Derive filter options from rows:

```ts
const categoryOptions = useMemo(() => {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    map.set(r.action, (map.get(r.action) ?? 0) + r.count);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([value, count]) => ({ value, label: value, count }));
}, [rows]);

const statusOptions = useMemo(
  () =>
    ["Active", "New", "Re-Opened", "Fixed"].map((value) => ({
      value,
      label: statusLabel[value] ?? value,
      count: rows.filter((r) => r.status === value).reduce((a, r) => a + r.count, 0),
    })),
  [rows],
);
```

Add a `statusLabel` map near the top of the file:

```ts
const statusLabel: Record<string, string> = {
  Active: "Ativa",
  New: "Nova",
  "Re-Opened": "Reaberta",
  Fixed: "Corrigida",
};
```

Render layout:

```tsx
<Shell
  title="Vulnerabilidades"
  subtitle="Visão operacional de vulnerabilidades — filtros por severidade, categoria e status."
>
  {/* KPI cards */}
  <section className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
    <StatSlab label="Total Detections" value={stats?.total ?? 0} accent />
    <StatSlab label="Critical Vulns" value={stats?.critical ?? 0} />
    <StatSlab label="Critical Patchable" value={stats?.criticalPatchable ?? 0} />
    <StatSlab label="CISA KEV" value={stats?.cisaKev ?? 0} />
    <StatSlab label="Ransomware" value={stats?.ransomware ?? 0} />
  </section>

  <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
    {/* Sidebar filters */}
    <aside className="slab space-y-5 p-4">
      <div>
        <span className="stencil mb-2 block text-[10px] text-muted-foreground">Busca</span>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="QID, título ou categoria..."
            className="h-9 w-full rounded-md border border-border bg-input pr-3 pl-9 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>
      </div>

      <FilterGroup
        title="Severidade"
        options={severityOrder.map((s) => ({ value: s, label: s, count: 0 }))}
        selected={sev !== "Todas" ? [sev] : []}
        onChange={(vals) => setParam("sev", vals[0] ?? "")}
      />

      <FilterGroup
        title="Categoria"
        options={categoryOptions}
        selected={categories}
        onChange={setCategories}
      />

      <FilterGroup
        title="Status"
        options={statusOptions}
        selected={statuses}
        onChange={setStatuses}
      />

      <button
        onClick={() =>
          navigate({
            search: () => ({
              q: undefined,
              sev: undefined,
              team: undefined,
              tagFilter: undefined,
              categories: undefined,
              statuses: undefined,
            }),
          })
        }
        className="stencil w-full border border-border px-3 py-2 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        Limpar tudo
      </button>
    </aside>

    {/* Table */}
    <div className="slab overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-secondary">
            {["QID", "Título", "Squad", "Sev", "Status", "Vulns", "Idade", "Solução"].map((h) => (
              <th key={h} className="stencil px-3 py-3 text-left text-[10px] text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading || statsLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-border/60">
                <td colSpan={8} className="px-3 py-2">
                  <div className="h-6 w-full animate-pulse bg-steel" />
                </td>
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center">
                <p className="stencil text-sm text-muted-foreground">Nenhum resultado</p>
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <Fragment key={`${r.qid}-${r.team}-${r.action}`}>
                <tr
                  onClick={() => setOpen(open === r.qid ? null : r.qid)}
                  className="cursor-pointer border-b border-border/60 hover:bg-steel"
                >
                  <td className="px-3 py-2 font-bold text-primary">{r.qid}</td>
                  <td className="max-w-[420px] truncate px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.team}</td>
                  <td className="px-3 py-2">
                    <span
                      className="stencil px-2 py-1 text-[9px] text-background"
                      style={{ background: severityToken[r.sev] }}
                    >
                      {r.sev}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 font-bold">{fmt(r.count)}</td>
                  <td
                    className={`px-3 py-2 ${r.age > 180 ? "text-critica" : "text-muted-foreground"}`}
                  >
                    {r.age}d
                  </td>
                  <td className="px-3 py-2">{r.solution ? "Sim" : "—"}</td>
                </tr>
                {open === r.qid && (
                  <tr className="border-b border-border">
                    <td colSpan={8} className="bg-secondary px-5 py-4">
                      <p className="stencil mb-2 text-[10px] text-primary">Frente: {r.action}</p>
                      <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                        {r.solution || "Sem solução registrada."}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
</Shell>
```

**Step 2: Update `QidRow` type to include `status`**

In `src/lib/sla-data.ts`, add `status: string;` to `QidRow`.

Also update `getQids` in `queries.server.ts` to return `status: r["Status"] ?? ""`.

**Step 3: Build and visually verify**

Run:

```bash
bun run build
bun dev
```

Open `http://localhost:3000/vulnerabilidades` and confirm:

- Cards render with numbers.
- Sidebar filters show categories/statuses.
- Selecting filters updates the table and URL params.

---

### Task 5: Add home link card

**Files:**

- Modify: `src/routes/index.tsx`

**Interfaces:**

- Consumes: existing `data.kpis.vulns`.
- Produces: new `StatSlab` that navigates to `/vulnerabilidades`.

**Step 1: Add navigation import**

`useNavigate` is already imported. Use it in the component.

**Step 2: Insert a new card in the KPI row**

Find the section with the four `StatSlab` components and add a fifth:

```tsx
<StatSlab
  label="Inventário de vulns"
  value={data.kpis.vulns}
  trend={data.trends["vulns"]}
  action="ver tabela"
  onClick={() => navigate({ to: "/vulnerabilidades" })}
/>
```

Update the grid class from `lg:grid-cols-4` to `lg:grid-cols-5` if the layout allows, or keep it as an additional row.

**Step 3: Verify click navigates**

Run `bun dev`, click the card, and confirm it opens `/vulnerabilidades`.

---

### Task 6: Final verification

**Step 1: Lint and format**

```bash
bun run lint
bun run format
```

**Step 2: Production build**

```bash
bun run build
```

**Step 3: Visual QA checklist**

- Cards align on top.
- Filters update counts/table.
- Empty state works.
- Mobile layout does not break (sidebar stacks below cards on small screens).
- Home link card navigates correctly.

---

## Spec coverage check

| Spec requirement                                                 | Task          |
| ---------------------------------------------------------------- | ------------- |
| Rota `/vulnerabilidades` com cards no topo                       | Task 4        |
| Filtros rápidos de Severity, Category, Status                    | Tasks 1, 3, 4 |
| Search por QID/título/categoria                                  | Tasks 1, 4    |
| Cards: Total, Critical, Critical Patchable, CISA KEV, Ransomware | Tasks 1, 2, 4 |
| Tabela agregada por QID                                          | Task 4        |
| Home permanece overview e linka pra vulns                        | Task 5        |
| CISA KEV/Ransomware com fallback 0                               | Tasks 1, 4    |

## Placeholder scan

No TBD, TODO, or vague steps. All code snippets, commands, and file paths are explicit.

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-20-vulnerabilidades-filters-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
