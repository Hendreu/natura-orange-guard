# Task 4: Rebuild `/vulnerabilidades` route

**Goal:** Transform `src/routes/vulnerabilidades.tsx` into a Qualys-style vulnerability view with top KPI cards, a left sidebar of quick filters, and an aggregated-by-QID table.

**Files to modify:**

- `src/routes/vulnerabilidades.tsx`

**Dependencies from earlier tasks:**

- `src/components/FilterGroup.tsx` (Task 3)
- `qidsQueryOptions` and `vulnerabilityStatsQueryOptions` from `src/lib/sla-data.ts` (Task 2)
- `QidRow` type includes `status: string`

**Changes:**

1. Replace imports with:

```tsx
import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
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
} from "@/lib/sla-data";
```

2. Update search schema and validation:

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

3. Add status label map near the top:

```ts
const statusLabel: Record<string, string> = {
  Active: "Ativa",
  New: "Nova",
  "Re-Opened": "Reaberta",
  Fixed: "Corrigida",
};
```

4. Inside `Vulnerabilidades` component, read search params and derive state:

```ts
const search = Route.useSearch();
const navigate = useNavigate({ from: "/vulnerabilidades" });
const q = search.q ?? "";
const sev = search.sev ?? "Todas";
const team = search.team ?? "Todas";
const tagFilter = search.tagFilter ?? "full";
const categories = search.categories ?? [];
const statuses = search.statuses ?? ["Active", "New", "Re-Opened"];
const [open, setOpen] = useState<number | null>(null);
const [qInput, setQInput] = useState(q);
const debouncedQ = useDebouncedValue(qInput, 300);

const setParam = (key: keyof VulnSearch, value: string) =>
  navigate({
    search: (prev: VulnSearch) => ({
      ...prev,
      [key]: value && value !== "Todas" ? value : undefined,
    }),
  });

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

5. Keep the existing `useEffect` pair that syncs `qInput` with URL `q`.

6. Query data:

```ts
const {
  data: rows = [],
  isLoading,
  isError,
} = useQuery(qidsQueryOptions({ sev, team, q: debouncedQ, tagFilter, categories, statuses }));

const { data: stats, isLoading: statsLoading } = useQuery(
  vulnerabilityStatsQueryOptions({ team, tagFilter, categories, statuses, q: debouncedQ }),
);
```

7. Derive filter options:

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

8. Render the page:

```tsx
<Shell
  title="Vulnerabilidades"
  subtitle="Visão operacional de vulnerabilidades — filtros por severidade, categoria e status."
>
  <section className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
    <StatSlab label="Total Detections" value={stats?.total ?? 0} accent />
    <StatSlab label="Critical Vulns" value={stats?.critical ?? 0} />
    <StatSlab label="Critical Patchable" value={stats?.criticalPatchable ?? 0} />
    <StatSlab label="CISA KEV" value={stats?.cisaKev ?? 0} />
    <StatSlab label="Ransomware" value={stats?.ransomware ?? 0} />
  </section>

  <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
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
          ) : isError ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center">
                <p className="stencil text-sm text-critica">Erro ao carregar vulnerabilidades</p>
              </td>
            </tr>
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
                  <td className="px-3 py-2">{statusLabel[r.status] ?? r.status}</td>
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

9. Remove the old `Filter` helper component at the bottom of the file.

**Verification:**

- Run `bun run build`.
- Run `bun dev`, open `http://localhost:3000/vulnerabilidades`, and verify:
  - Top cards show numbers.
  - Sidebar filters work and update the table.
  - URL params update when filters change.
  - Table rows expand to show solution.

**Report file:** `.superpowers/sdd/task-4-report.md`
