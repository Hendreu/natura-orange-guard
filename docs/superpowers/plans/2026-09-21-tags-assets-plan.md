# Correlação real tags ↔ assets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o filtro legado `tagFilter` (`full`/`full-cloud`/`full-on-premise`) por uma relação real com a tabela `tags` via tabela de junção `asset_tags`, permitindo filtro multi-select com AND.

**Architecture:** Criar tabela `asset_tags` no banco; o ETL a repopula após cada carga de `All_Assets`; as queries passam a receber `tags: number[]` e filtram assets que possuam todas as tags selecionadas via `EXISTS` em `asset_tags`; a UI substitui o dropdown de 3 opções por um multi-select de tags reais.

**Tech Stack:** TypeScript, TanStack Start (`createServerFn`), React Query, `postgres` driver, PostgreSQL 16, shadcn/ui (Command, Popover, Badge), Tailwind v4.

## Global Constraints

- Manter `src/server/queries.server.ts` como único módulo SQL do servidor.
- Manter `src/lib/data.fn.ts` como única superfície `createServerFn`.
- Nunca importar `src/lib/db.ts` de componentes clientes.
- Usar `Bun.file()` / APIs Bun quando possível no ETL.
- Não usar `any`; usar inferência de tipos do TypeScript.
- Evitar `else`; preferir early returns.
- Preferir arrays funcionais (`map`, `filter`, `flatMap`) sobre `for`.
- Commits frequentes, um por task entregável.

---

## File map

| File | Responsibility |
|---|---|
| `scripts/migrations/0001_asset_tags.sql` | Cria tabela `asset_tags` e índice. |
| `scripts/etl.ts` | Adiciona `rebuildAssetTags()` após carga de `All_Assets`. |
| `src/server/queries.server.ts` | Novos helpers `assetTagFilterSql`/`assetCteSql`; novo `getTags`; remove `tagFilter`/`TagFilter`. |
| `src/lib/data.fn.ts` | Schemas Zod com `tags: number[]`; novos `fetchTags`. |
| `src/lib/sla-data.ts` | Tipos e `queryOptions` com `tags` em vez de `tagFilter`; `tagsQueryOptions`. |
| `src/lib/constants.ts` | Remove `TAG_FILTER_OPTIONS` e `TagFilter`. |
| `src/components/TagFilter.tsx` | Multi-select de tags reais usando Command+Popover. |
| `src/routes/index.tsx` | Search schema com `tags`; passa `tags` para queries. |
| `src/routes/ativos.tsx` | Search schema com `tags`; passa `tags` para query. |
| `src/routes/vulnerabilidades.tsx` | Search schema com `tags`; passa `tags` para queries. |
| `src/routes/relatorios.tsx` | Search schema com `tags`; passa `tags` para query. |
| `src/routes/hardening.tsx` | Search schema com `tags`; passa `tags` para query (se aplicável). |

---

### Task 1: Migration SQL para `asset_tags`

**Files:**
- Create: `scripts/migrations/0001_asset_tags.sql`

**Interfaces:**
- Produces: tabela `asset_tags(asset_id bigint, tag_id bigint)` com PK e FKs.

- [ ] **Step 1: Criar migration**

```sql
CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id BIGINT NOT NULL,
  tag_id   BIGINT NOT NULL,
  PRIMARY KEY (asset_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag_id);

ALTER TABLE asset_tags
  ADD CONSTRAINT fk_asset_tags_asset FOREIGN KEY (asset_id) REFERENCES "All_Assets"("ID") ON DELETE CASCADE,
  ADD CONSTRAINT fk_asset_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Aplicar migration no banco**

Run:
```bash
$env:DATABASE_URL = 'postgresql://qualys_natura_gv:...'; psql "$env:DATABASE_URL" -f scripts/migrations/0001_asset_tags.sql
```

Expected: comando termina sem erros.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrations/0001_asset_tags.sql
git commit -m "chore(db): create asset_tags junction table"
```

---

### Task 2: Atualizar ETL para popular `asset_tags`

**Files:**
- Modify: `scripts/etl.ts:263-275`

**Interfaces:**
- Consumes: tabela `All_Assets` recém-carregada.
- Produces: `asset_tags` preenchida com base em `All_Assets."Tags"` ↔ `tags.name`.

- [ ] **Step 1: Adicionar helper `rebuildAssetTags`**

Insira antes de `main()`:

```ts
async function rebuildAssetTags() {
  console.log("[REBUILD] asset_tags");
  await sql`TRUNCATE asset_tags`;
  const [{ count }] = await sql`
    INSERT INTO asset_tags (asset_id, tag_id)
    SELECT DISTINCT a."ID", t.id
    FROM "All_Assets" a
    CROSS JOIN LATERAL UNNEST(string_to_array(TRIM(a."Tags"), ',')) AS tag_name
    JOIN tags t ON LOWER(t.name) = LOWER(tag_name)
    WHERE a."Tags" IS NOT NULL
      AND TRIM(a."Tags") <> ''
    ON CONFLICT DO NOTHING
    RETURNING asset_id
  `;
  console.log(`[REBUILT] ${count ?? 0} asset_tag rows`);
  await sql`ANALYZE asset_tags`;
}
```

- [ ] **Step 2: Chamar helper no fluxo do ETL**

Modifique `main()`:

```ts
async function main() {
  console.log(
    `ETL starting — source: ${SOURCE_DIR}, incoming: ${INCOMING_DIR}, days_back: ${DAYS_BACK}`,
  );
  await collectCsvs();
  for (const cfg of CONFIG) {
    await loadTable(cfg);
  }
  await rebuildAssetTags();
  console.log("Refreshing materialized views...");
  await refreshViews();
  await recordSync();
  console.log("ETL complete.");
  process.exit(0);
}
```

- [ ] **Step 3: Testar ETL localmente (dry-run manual)**

Run:
```bash
bun run etl
```

Expected: log mostra `[REBUILT] N asset_tag rows` com N > 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/etl.ts
git commit -m "chore(etl): rebuild asset_tags after All_Assets load"
```

---

### Task 3: Atualizar queries do servidor

**Files:**
- Modify: `src/server/queries.server.ts:1-1130`

**Interfaces:**
- Consumes: `tags: number[]` de `src/lib/data.fn.ts`.
- Produces: `getTags()`; novas assinaturas com `tags` em vez de `tagFilter`.

- [ ] **Step 1: Remover import e helpers legados**

No topo, remova:
```ts
import type { TagFilter } from "@/lib/constants";
```

Remova as funções:
```ts
function tagFilterSql(...) {}
function teamViewKey(...) {}
```

Mantenha `squadFilterSql` (regras de squad), mas remova os branches `All Cloud`/`All On-Prem` baseados em `Tags` ILIKE; eles devem continuar usando `a.is_cloud`.

- [ ] **Step 2: Adicionar novo helper `assetTagFilterSql`**

```ts
function assetTagFilterSql(tags: number[]) {
  if (tags.length === 0) return sql``;
  return sql`AND EXISTS (
    SELECT 1
    FROM asset_tags at
    WHERE at.asset_id = a."ID"
      AND at.tag_id = ANY(${tags})
    GROUP BY at.asset_id
    HAVING COUNT(DISTINCT at.tag_id) = ${tags.length}
  )`;
}
```

- [ ] **Step 3: Atualizar `assetCteSql`**

```ts
function assetCteSql(
  team: string | undefined,
  tags: number[],
  extraCols = sql``,
) {
  const teamFilter =
    !team || team === "Todas"
      ? sql``
      : team === "All Cloud"
        ? sql`AND a.is_cloud = true`
        : team === "All On-Prem"
          ? sql`AND a.is_cloud = false`
          : sql`AND a.team = ${team}`;
  const tagFilter = assetTagFilterSql(tags);
  return sql`WITH filtered_assets AS MATERIALIZED (SELECT DISTINCT ON (a."QG_HostID") a."QG_HostID", a.team, a.is_cloud ${extraCols} FROM "All_Assets" a WHERE TRUE ${teamFilter} ${tagFilter})`;
}
```

- [ ] **Step 4: Adicionar `getTags`**

```ts
export async function getTags() {
  return sql<{ id: string; name: string }[]>`
    SELECT id, name
    FROM tags
    ORDER BY name
  `;
}
```

- [ ] **Step 5: Atualizar assinaturas das funções exportadas**

Substituir `tagFilter?: TagFilter | undefined` por `tags?: number[] | undefined` em:

- `getTeamKpis`
- `getTeamChartSev`
- `getTeamSla`
- `getTeamRaw`
- `getTeamData`
- `getOverview`
- `getQids`
- `getVulnerabilityStats`
- `getAssets`
- `getReports`

Em cada função, substituir `assetCteSql(team, tagFilter, ...)` por `assetCteSql(team, tags ?? [], ...)`.

Para `getTeamKpis`, `getTeamChartSev`, `getTeamSla`, `getTeamRaw`, simplifique o caminho de materialized view: se `tags.length === 0`, use as views existentes; senão, caia no CTE. Exemplo para `getTeamKpis`:

```ts
export async function getTeamKpis({
  team,
  tags = [],
}: {
  team?: string;
  tags?: number[];
}) {
  if (tags.length === 0) {
    // manter lógica atual de mv_overview / mv_team_overview
  }
  const cte = assetCteSql(team, tags);
  // ... restante
}
```

- [ ] **Step 6: Commit**

```bash
git add src/server/queries.server.ts
git commit -m "feat(server): replace tagFilter with real tag IDs via asset_tags"
```

---

### Task 4: Atualizar server functions

**Files:**
- Modify: `src/lib/data.fn.ts`

**Interfaces:**
- Consumes: novas assinaturas de `src/server/queries.server.ts`.
- Produces: `fetchTags`; schemas com `tags: number[]`.

- [ ] **Step 1: Substituir schemas**

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tagsSchema = z.array(z.coerce.number()).default([]);

export const fetchTeamData = createServerFn({ method: "GET" })
  .validator(z.object({ team: z.string(), tags: tagsSchema }))
  .handler(async ({ data }) => {
    const { getTeamData } = await import("../server/queries.server");
    return await getTeamData(data);
  });

export const fetchOverview = createServerFn({ method: "GET" })
  .validator(z.object({ tags: tagsSchema }))
  .handler(async ({ data }) => {
    const { getOverview } = await import("../server/queries.server");
    return await getOverview(data);
  });

export const fetchAllTeamsData = createServerFn({ method: "GET" }).handler(async () => {
  const { getAllTeamsData } = await import("../server/queries.server");
  return await getAllTeamsData();
});

const qidsFilterSchema = z.object({
  sev: z.array(z.string()).optional(),
  team: z.string().optional(),
  q: z.string().optional(),
  tags: tagsSchema,
  categories: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
});

export const fetchQids = createServerFn({ method: "GET" })
  .validator(qidsFilterSchema)
  .handler(async ({ data }) => {
    const { getQids } = await import("../server/queries.server");
    return await getQids(data);
  });

const assetsFilterSchema = z.object({
  team: z.string().optional(),
  q: z.string().optional(),
  tags: tagsSchema,
});

export const fetchAssets = createServerFn({ method: "GET" })
  .validator(assetsFilterSchema)
  .handler(async ({ data }) => {
    const { getAssets } = await import("../server/queries.server");
    return await getAssets(data);
  });

export const fetchHardening = createServerFn({ method: "GET" })
  .validator(z.object({ tags: tagsSchema }))
  .handler(async ({ data }) => {
    const { getHardening } = await import("../server/queries.server");
    return await getHardening(data);
  });

const reportsFilterSchema = z.object({
  team: z.string().optional(),
  os: z.string().optional(),
  tags: tagsSchema,
});

export const fetchReports = createServerFn({ method: "GET" })
  .validator(reportsFilterSchema)
  .handler(async ({ data }) => {
    const { getReports } = await import("../server/queries.server");
    return await getReports(data);
  });

const statsFilterSchema = z.object({
  team: z.string().optional(),
  tags: tagsSchema,
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

export const fetchLastSync = createServerFn({ method: "GET" }).handler(async () => {
  const { getLastSync } = await import("../server/queries.server");
  return await getLastSync();
});

export const fetchTags = createServerFn({ method: "GET" }).handler(async () => {
  const { getTags } = await import("../server/queries.server");
  return await getTags();
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data.fn.ts
git commit -m "feat(fn): add fetchTags and replace tagFilter with tags array"
```

---

### Task 5: Atualizar React Query options e tipos

**Files:**
- Modify: `src/lib/sla-data.ts`
- Modify: `src/lib/constants.ts`

**Interfaces:**
- Consumes: `fetch*` e `fetchTags` de `src/lib/data.fn.ts`.
- Produces: `tagsQueryOptions`; queryOptions atualizadas sem `TagFilter`.

- [ ] **Step 1: Remover `TagFilter` de `sla-data.ts`**

```ts
import { TEAM_NAMES, SEVERITY_ORDER } from "./constants";
```

- [ ] **Step 2: Adicionar tipo de Tag e `tagsQueryOptions`**

```ts
export type Tag = {
  id: number;
  name: string;
};

export const tagsQueryOptions = () =>
  queryOptions({
    queryKey: ["tags"],
    queryFn: () => fetchTags({}),
  });
```

- [ ] **Step 3: Atualizar todas as queryOptions**

Substituir `tagFilter?: TagFilter | undefined` por `tags?: number[]` em:

- `overviewQueryOptions(team, tags = [])`
- `overviewAllQueryOptions(tags = [])`
- `qidsQueryOptions(filters: { ..., tags?: number[] })`
- `assetsQueryOptions(filters: { ..., tags?: number[] })`
- `reportsQueryOptions(filters: { ..., tags?: number[] })`
- `vulnerabilityStatsQueryOptions(filters: { ..., tags?: number[] })`

Atualizar `queryKey` e `queryFn` correspondentes.

- [ ] **Step 4: Remover `TAG_FILTER_OPTIONS` de `constants.ts`**

Remova:
```ts
export const TAG_FILTER_OPTIONS = [...] as const;
export type TagFilter = (typeof TAG_FILTER_OPTIONS)[number]["value"];
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/sla-data.ts src/lib/constants.ts
git commit -m "feat(data): replace TagFilter with tags number array and add tags query"
```

---

### Task 6: Refatorar componente `TagFilter` para multi-select real

**Files:**
- Modify: `src/components/TagFilter.tsx`

**Interfaces:**
- Consumes: `tagsQueryOptions`, `useQuery`, router search `tags`.
- Produces: UI multi-select que navega com `search.tags: number[]`.

- [ ] **Step 1: Reimplementar TagFilter**

```tsx
import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagsQueryOptions } from "@/lib/sla-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

export function TagFilter() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search });
  const selected: number[] = Array.isArray(search.tags) ? search.tags : [];
  const [open, setOpen] = useState(false);
  const { data: tags = [] } = useQuery(tagsQueryOptions());

  const toggle = (id: number) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    navigate({
      search: (prev) => ({
        ...prev,
        tags: next.length ? next : undefined,
      }),
    });
  };

  const clear = () =>
    navigate({
      search: (prev) => ({ ...prev, tags: undefined }),
    });

  const selectedNames = selected
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="min-w-[200px]">
      <span className="stencil mb-2 block text-[10px] text-muted-foreground">Tags</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-input px-3 text-xs text-foreground outline-none focus:border-primary focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className={cn("truncate", !selectedNames.length && "text-muted-foreground")}>
              {selectedNames.length ? selectedNames.join(", ") : "Selecionar tags"}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0">
          <Command>
            <CommandInput placeholder="Buscar tag..." />
            <CommandList>
              <CommandEmpty>Nenhuma tag encontrada.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => {
                  const active = selected.includes(tag.id);
                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => toggle(tag.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate text-xs">{tag.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedNames.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedNames.map((name) => (
            <Badge key={name} variant="secondary" className="text-[10px]">
              {name}
              <button
                type="button"
                onClick={() => {
                  const id = tags.find((t) => t.name === name)?.id;
                  if (id) toggle(id);
                }}
                className="ml-1 inline-flex"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            onClick={clear}
            className="text-[10px] text-muted-foreground underline"
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TagFilter.tsx
git commit -m "feat(ui): replace tagFilter dropdown with real tag multi-select"
```

---

### Task 7: Atualizar rotas

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/ativos.tsx`
- Modify: `src/routes/vulnerabilidades.tsx`
- Modify: `src/routes/relatorios.tsx`
- Modify: `src/routes/hardening.tsx`

**Interfaces:**
- Consumes: queryOptions e `search.tags`.
- Produces: search schemas com `tags?: number[]`.

- [ ] **Step 1: Criar helper compartilhado de parse de tags (opcional)**

Se preferir, adicione em `src/lib/search.ts`:

```ts
export function parseNumberArray(value: unknown): number[] | undefined {
  if (typeof value === "string" && value) return value.split(",").map(Number).filter((n) => !Number.isNaN(n));
  if (Array.isArray(value)) return value.map(Number).filter((n) => !Number.isNaN(n));
  return undefined;
}
```

- [ ] **Step 2: Atualizar `src/routes/index.tsx`**

Search schema:
```ts
const indexSearchSchema = z.object({
  tags: z.array(z.coerce.number()).default([]),
});
```

Uso:
```ts
const tags = search.tags ?? [];
const queryOptions =
  team === "Todas" ? overviewAllQueryOptions(tags) : overviewQueryOptions(team, tags);
```

Atualize `goToVulns` para passar `tags` em vez de `tagFilter`.

- [ ] **Step 3: Atualizar `src/routes/ativos.tsx`**

Search schema:
```ts
type AtivosSearch = {
  q?: string | undefined;
  team?: string | undefined;
  tags?: number[] | undefined;
};

export const Route = createFileRoute("/ativos")({
  validateSearch: (search: Record<string, unknown>): AtivosSearch => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    team: typeof search["team"] === "string" ? search["team"] : undefined,
    tags: parseNumberArray(search["tags"]),
  }),
  // ...
});
```

Uso:
```ts
const tags = search.tags ?? [];
const { data: rows = [] } = useQuery(assetsQueryOptions({ team, q: debouncedQ, tags }));
```

- [ ] **Step 4: Atualizar `src/routes/vulnerabilidades.tsx`**

Search schema:
```ts
type VulnSearch = {
  q?: string | undefined;
  sev?: string[] | undefined;
  team?: string | undefined;
  tags?: number[] | undefined;
  categories?: string[] | undefined;
  statuses?: string[] | undefined;
};
```

```ts
validateSearch: (search: Record<string, unknown>): VulnSearch => ({
  q: typeof search["q"] === "string" ? search["q"] : undefined,
  sev: parseArray(search["sev"]),
  team: typeof search["team"] === "string" ? search["team"] : undefined,
  tags: parseNumberArray(search["tags"]),
  categories: parseArray(search["categories"]),
  statuses: parseArray(search["statuses"]),
}),
```

Uso:
```ts
const tags = search.tags ?? [];
useQuery(qidsQueryOptions({ sev: selectedSevs, team, q: debouncedQ, tags, categories, statuses }));
useQuery(vulnerabilityStatsQueryOptions({ team, tags, categories, statuses, q: debouncedQ }));
```

- [ ] **Step 5: Atualizar `src/routes/relatorios.tsx`**

Search schema:
```ts
type RelatoriosSearch = {
  team?: string | undefined;
  os?: string | undefined;
  q?: string | undefined;
  tags?: number[] | undefined;
};
```

Uso:
```ts
const tags = search.tags ?? [];
const { data } = useQuery(reportsQueryOptions({ team, os: debouncedOs, q: debouncedQ, tags }));
```

- [ ] **Step 6: Atualizar `src/routes/hardening.tsx`**

Se a rota usar filtro de tags, adicione `tags` ao search schema e passe para `hardeningQueryOptions`. Caso contrário, ignore esta task.

- [ ] **Step 7: Commit**

```bash
git add src/routes/*.tsx
git commit -m "feat(routes): replace tagFilter search param with tags number array"
```

---

### Task 8: Build e verificação

**Files:**
- All modified files.

- [ ] **Step 1: Rodar typecheck/build**

Run:
```bash
cd packages/opencode && bun typecheck
```

Ou, se não houver `packages/opencode` neste projeto:
```bash
bun run build
```

Expected: build completo sem erros de TypeScript relacionados a `tagFilter`/`TagFilter`.

- [ ] **Step 2: Rodar lint**

Run:
```bash
bun run lint
```

Expected: sem erros.

- [ ] **Step 3: Verificar queries no banco**

Run:
```bash
$env:DATABASE_URL = 'postgresql://...'; bun run etl
```

Expected: ETL termina, `asset_tags` populada.

- [ ] **Step 4: Commit final / ajustes**

```bash
git add .
git commit -m "feat(tags): wire real tag filter across routes"
```

---

## Self-review

**Spec coverage:**
- Tabela de junção `asset_tags` → Task 1.
- ETL repopula `asset_tags` → Task 2.
- Queries usam `tags: number[]` com AND → Task 3.
- Server functions e React Query → Tasks 4 e 5.
- UI multi-select → Task 6.
- Rotas atualizadas → Task 7.
- Build/verificação → Task 8.

**Placeholder scan:**
- Nenhum TBD/TODO no plano.

**Type consistency:**
- `tags` é `number[]` em todos os schemas, queryOptions e server functions.
- `TagFilter` e `TAG_FILTER_OPTIONS` são removidos em Task 5.

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-21-tags-assets-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
