# Tag Filter (Cloud / On-Premises) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global URL-based tag filter (`all`, `all_clouds`, `all_onpremises`) that filters assets by the presence/absence of the word `cloud` in the `Tags` column, applied to Dashboard, Ativos, Vulnerabilidades and Relatórios.

**Architecture:** A shared `TagFilter` component reads/writes `?tagFilter=` in the URL. Each affected route validates the param and forwards it to server functions. Server functions pass it to `queries.server.ts`, where a helper appends the corresponding SQL predicate on `All_Assets."Tags"`.

**Tech Stack:** TanStack Start + React Router v1, React Query, `postgres` SQL template literals, Bun, TypeScript, shadcn/ui Select.

## Global Constraints
- Use existing shadcn/ui `Select` component for the dropdown.
- Do not suppress type errors (`as any`, `@ts-ignore`).
- Follow existing search-param patterns in each route (`validateSearch`, `useNavigate`, `Route.useSearch`).
- Keep filter value in URL so it persists across navigation.
- Use case-insensitive matching for the word `cloud`.

---

### Task 1: Add tag-filter type and SQL helper

**Files:**
- Modify: `src/server/queries.server.ts`
- Modify: `src/lib/constants.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `type TagFilter = "all" | "all_clouds" | "all_onpremises"` and `function tagFilterSql(tagFilter: TagFilter | undefined)`

- [ ] **Step 1.1: Define the type in constants**

Add to `src/lib/constants.ts` (append at the bottom):

```ts
export const TAG_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "all_clouds", label: "Cloud" },
  { value: "all_onpremises", label: "On-Premises" },
] as const;

export type TagFilter = (typeof TAG_FILTER_OPTIONS)[number]["value"];
```

- [ ] **Step 1.2: Add SQL helper in queries.server.ts**

At the top of `src/server/queries.server.ts`, after the existing helpers, add:

```ts
import type { TagFilter } from "@/lib/constants";

function tagFilterSql(tagFilter: TagFilter | undefined) {
  if (tagFilter === "all_clouds") {
    return sql`AND a."Tags" ILIKE ${"%cloud%"}`;
  }
  if (tagFilter === "all_onpremises") {
    return sql`AND (a."Tags" IS NULL OR a."Tags" NOT ILIKE ${"%cloud%"})`;
  }
  return sql``;
}
```

- [ ] **Step 1.3: Commit**

```bash
$env:GIT_MASTER='1'; git add src/lib/constants.ts src/server/queries.server.ts
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): add TagFilter type and SQL helper" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 2: Apply tag filter to team and asset queries

**Files:**
- Modify: `src/server/queries.server.ts`

**Interfaces:**
- Consumes: `TagFilter` type and `tagFilterSql` helper from Task 1
- Produces: updated function signatures that accept `tagFilter`

- [ ] **Step 2.1: Update `getTeamKpis`, `getTeamChartSev`, `getTeamSla`, `getTeamRaw`**

Change each signature from `(team: string)` to `({ team, tagFilter }: { team: string; tagFilter?: TagFilter })`.

Inside each query, add the tag filter after the team regex predicate. Example for `getTeamKpis`:

```ts
export async function getTeamKpis({ team, tagFilter }: { team: string; tagFilter?: TagFilter }) {
  const tagSql = tagFilterSql(tagFilter);
  const [row] = await sql`
    SELECT
      ...
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      AND a."Tags" ~* ${teamRegex(team)}
      ${tagSql}
  `;
  return row as { ... };
}
```

Do the same for `getTeamChartSev`, `getTeamSla`, and `getTeamRaw`.

- [ ] **Step 2.2: Update `getTeamData`**

```ts
export async function getTeamData({
  team,
  tagFilter,
}: {
  team: string;
  tagFilter?: TagFilter;
}): Promise<TeamData> {
  const [kpis, chartSev, slaData, raw] = await Promise.all([
    getTeamKpis({ team, tagFilter }),
    getTeamChartSev({ team, tagFilter }),
    getTeamSla({ team, tagFilter }),
    getTeamRaw({ team, tagFilter }),
  ]);
  ...
}
```

- [ ] **Step 2.3: Update `getQids`, `getAssets`, `getReports`**

Add `tagFilter?: TagFilter` to each function's input object. Build `const tagSql = tagFilterSql(tagFilter);` and inject `${tagSql}` into the `WHERE` clause after the existing filters.

For `getReports`, also apply the tag filter in the `teamRows` query (currently it only uses `osFilter`).

- [ ] **Step 2.4: Commit**

```bash
$env:GIT_MASTER='1'; git add src/server/queries.server.ts
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): apply tagFilter to server queries" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 3: Wire server functions to accept tagFilter

**Files:**
- Modify: `src/lib/data.fn.ts`

**Interfaces:**
- Consumes: updated `getTeamData`, `getQids`, `getAssets`, `getReports` signatures
- Produces: updated server function validators and handlers

- [ ] **Step 3.1: Update schemas and handlers**

```ts
import type { TagFilter } from "@/lib/constants";

export const fetchTeamData = createServerFn({ method: "GET" })
  .validator(z.object({ team: z.string(), tagFilter: z.enum(["all", "all_clouds", "all_onpremises"]).optional() }))
  .handler(async ({ data }) => {
    const { getTeamData } = await import("../server/queries.server");
    return await getTeamData(data);
  });

const qidsFilterSchema = z.object({
  sev: z.string().optional(),
  team: z.string().optional(),
  q: z.string().optional(),
  tagFilter: z.enum(["all", "all_clouds", "all_onpremises"]).optional(),
});

const assetsFilterSchema = z.object({
  team: z.string().optional(),
  q: z.string().optional(),
  tagFilter: z.enum(["all", "all_clouds", "all_onpremises"]).optional(),
});

const reportsFilterSchema = z.object({
  team: z.string().optional(),
  os: z.string().optional(),
  tagFilter: z.enum(["all", "all_clouds", "all_onpremises"]).optional(),
});
```

- [ ] **Step 3.2: Commit**

```bash
$env:GIT_MASTER='1'; git add src/lib/data.fn.ts
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): pass tagFilter through server functions" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 4: Update query options in sla-data.ts

**Files:**
- Modify: `src/lib/sla-data.ts`

**Interfaces:**
- Consumes: updated `fetchTeamData`, `fetchQids`, `fetchAssets`, `fetchReports` validators
- Produces: updated `overviewQueryOptions`, `qidsQueryOptions`, `assetsQueryOptions`, `reportsQueryOptions`

- [ ] **Step 4.1: Update each query options signature**

```ts
export const overviewQueryOptions = (team: string, tagFilter?: TagFilter) =>
  queryOptions({
    queryKey: ["overview", team, tagFilter],
    queryFn: () => fetchTeamData({ data: { team, tagFilter } }),
  });

export const qidsQueryOptions = (filters: { sev?: string; team?: string; q?: string; tagFilter?: TagFilter }) =>
  queryOptions({
    queryKey: ["qids", filters],
    queryFn: () => fetchQids({ data: filters }),
  });

export const assetsQueryOptions = (filters: { team?: string; q?: string; tagFilter?: TagFilter }) =>
  queryOptions({
    queryKey: ["assets", filters],
    queryFn: () => fetchAssets({ data: filters }),
  });

export const reportsQueryOptions = (filters: {
  team?: string | undefined;
  os?: string | undefined;
  tagFilter?: TagFilter;
}) =>
  queryOptions({
    queryKey: ["reports", filters],
    queryFn: () => fetchReports({ data: filters }),
  });
```

- [ ] **Step 4.2: Commit**

```bash
$env:GIT_MASTER='1'; git add src/lib/sla-data.ts
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): accept tagFilter in query options" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 5: Create the TagFilter UI component

**Files:**
- Create: `src/components/TagFilter.tsx`

**Interfaces:**
- Consumes: `TAG_FILTER_OPTIONS` and `TagFilter` from constants
- Produces: `<TagFilter />` component that reads/writes `tagFilter` URL param

- [ ] **Step 5.1: Implement the component**

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TAG_FILTER_OPTIONS, type TagFilter } from "@/lib/constants";

export function TagFilter() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate({ strict: false });
  const value = (search?.tagFilter as TagFilter) ?? "all";

  const setTagFilter = (next: TagFilter) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        tagFilter: next === "all" ? undefined : next,
      }),
    });
  };

  return (
    <div className="min-w-[140px]">
      <span className="stencil mb-2 block text-[10px] text-muted-foreground">Ambiente</span>
      <Select value={value} onValueChange={(v) => setTagFilter(v as TagFilter)}>
        <SelectTrigger className="h-9 w-full border-border bg-input text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TAG_FILTER_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 5.2: Commit**

```bash
$env:GIT_MASTER='1'; git add src/components/TagFilter.tsx
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): add TagFilter selector component" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 6: Render TagFilter inside Shell

**Files:**
- Modify: `src/components/Shell.tsx`

**Interfaces:**
- Consumes: `<TagFilter />` component
- Produces: Shell renders the global filter next to the page title/subtitle

- [ ] **Step 6.1: Import and place the selector**

Add import:

```ts
import { TagFilter } from "@/components/TagFilter";
```

Place it inside the `<header>`, below the mobile nav. For example, after line 89 (`</nav>`), add:

```tsx
<div className="mt-4 flex items-end justify-between gap-4">
  <TagFilter />
</div>
```

Or align it to the right by wrapping in `ml-auto`. Choose placement that matches the brutalist header.

- [ ] **Step 6.2: Commit**

```bash
$env:GIT_MASTER='1'; git add src/components/Shell.tsx
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): render TagFilter in Shell" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 7: Update Dashboard route

**Files:**
- Modify: `src/routes/index.tsx`

**Interfaces:**
- Consumes: `overviewQueryOptions(team, tagFilter)`
- Produces: dashboard reads `tagFilter` from URL and passes it to the query

- [ ] **Step 7.1: Update search schema and query call**

Add to `validateSearch`:

```ts
tagFilter: z.enum(["all", "all_clouds", "all_onpremises"]).optional(),
```

Or use a shared schema import if created.

Read it inside `Overview`:

```ts
const tagFilter = search.tagFilter ?? "all";
const { data, isLoading, isError } = useQuery(overviewQueryOptions(team, tagFilter));
```

Also update `goToVulns` so it carries the current `tagFilter` when navigating:

```ts
const goToVulns = (extra: { sev?: string; q?: string } = {}) =>
  navigate({
    to: "/vulnerabilidades",
    search: { team, tagFilter: tagFilter === "all" ? undefined : tagFilter, sev: extra.sev, q: extra.q },
  });
```

- [ ] **Step 7.2: Commit**

```bash
$env:GIT_MASTER='1'; git add src/routes/index.tsx
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): wire tagFilter on dashboard" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 8: Update Ativos route

**Files:**
- Modify: `src/routes/ativos.tsx`

**Interfaces:**
- Consumes: `assetsQueryOptions({ team, q, tagFilter })`

- [ ] **Step 8.1: Update search schema and component**

Add `tagFilter` to `AtivosSearch` and `validateSearch`.

Read it:

```ts
const tagFilter = search.tagFilter ?? "all";
```

Pass it to the query:

```ts
const { data: rows = [] } = useQuery(assetsQueryOptions({ team, q: debouncedQ, tagFilter }));
```

Update the "Limpar tudo" calls to also reset `tagFilter`.

- [ ] **Step 8.2: Commit**

```bash
$env:GIT_MASTER='1'; git add src/routes/ativos.tsx
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): wire tagFilter on ativos" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 9: Update Vulnerabilidades route

**Files:**
- Modify: `src/routes/vulnerabilidades.tsx`

**Interfaces:**
- Consumes: `qidsQueryOptions({ sev, team, q, tagFilter })`

- [ ] **Step 9.1: Update search schema and component**

Add `tagFilter` to `VulnSearch` and `validateSearch`.

Read it and pass to query:

```ts
const tagFilter = search.tagFilter ?? "all";
const { data: rows = [] } = useQuery(qidsQueryOptions({ sev, team, q: debouncedQ, tagFilter }));
```

Update clear actions to reset `tagFilter` too.

- [ ] **Step 9.2: Commit**

```bash
$env:GIT_MASTER='1'; git add src/routes/vulnerabilidades.tsx
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): wire tagFilter on vulnerabilidades" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 10: Update Relatórios route

**Files:**
- Modify: `src/routes/relatorios.tsx`

**Interfaces:**
- Consumes: `reportsQueryOptions({ team, os, tagFilter })`

- [ ] **Step 10.1: Update search schema, query call and filters object**

Add `tagFilter` to `RelatoriosSearch` and `validateSearch`.

Read it:

```ts
const tagFilter = search.tagFilter ?? "all";
```

Update the `filters` memo:

```ts
const filters = useMemo(
  () => ({
    team: team === "Todas" ? undefined : team,
    os: os || undefined,
    tagFilter: tagFilter === "all" ? undefined : tagFilter,
  }),
  [team, os, tagFilter],
);
```

Update clear actions to reset `tagFilter`.

- [ ] **Step 10.2: Commit**

```bash
$env:GIT_MASTER='1'; git add src/routes/relatorios.tsx
$env:GIT_MASTER='1'; git commit -m "feat(tag-filter): wire tagFilter on relatorios" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 11: Verify and final commit

**Files:**
- All modified files

- [ ] **Step 11.1: Run typecheck**

```bash
cd packages/opencode && bun typecheck
```

If there is no `packages/opencode`, run from project root:

```bash
bunx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 11.2: Run lint**

```bash
bun run lint
```

Expected: no lint errors.

- [ ] **Step 11.3: Manual smoke test**

1. Start dev server: `bun dev`
2. Open `http://localhost:3000`
3. Change the "Ambiente" selector to `Cloud` — URL should update to `/?tagFilter=all_clouds` and numbers should change.
4. Navigate to Ativos, Vulnerabilidades, Relatórios — verify `tagFilter` stays in URL and results reflect the selection.
5. Select `On-Premises` and confirm only non-cloud tags are shown.
6. Select `Todos` and confirm `tagFilter` is removed from URL.

- [ ] **Step 11.4: Final push**

```bash
$env:GIT_MASTER='1'; git push origin main
```

---

## Spec coverage check

- `all` shows everything → default value, no SQL predicate added. ✅ Task 2
- `all_clouds` shows tags containing `cloud` → `ILIKE '%cloud%'`. ✅ Task 2
- `all_onpremises` shows tags without `cloud` → `NOT ILIKE '%cloud%' OR NULL`. ✅ Task 2
- Global across Dashboard, Ativos, Vulnerabilidades, Relatórios → Shell component + each route. ✅ Tasks 5-10
- URL-based persistence → `useNavigate` + `useSearch` in `TagFilter`. ✅ Task 5

## Placeholder scan

No TBDs, TODOs, or vague steps. Each step includes exact file paths and code snippets.

## Type consistency check

- `TagFilter` type defined in `src/lib/constants.ts` and imported where needed.
- Query option signatures consistently accept `tagFilter?: TagFilter`.
- Server function validators use `z.enum(["all", "all_clouds", "all_onpremises"]).optional()`.
