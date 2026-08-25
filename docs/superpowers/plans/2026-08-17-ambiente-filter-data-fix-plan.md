# Filtro de Ambiente, Dados On-Prem e Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir persistência do filtro de ambiente, exibir dados on-premise completos e condizentes com o banco, aplicar o filtro em todas as páginas, adicionar paginação e otimizar queries N+1.

**Architecture:** Manter a arquitetura atual (TanStack Start + server functions + postgres), mas refatorar `queries.server.ts` para fornecer consultas agregadas únicas quando nenhum time específico é solicitado. O `tagFilter` continua sendo um search param global, lido pelas rotas e repassado às server functions. Paginação é implementada via search params `page`/`pageSize` em Vulnerabilidades e Ativos.

**Tech Stack:** React 19, TanStack Router/Start, @tanstack/react-query, postgres, TypeScript, Tailwind CSS v4, Bun.

## Global Constraints

- Não usar `as any`, `@ts-ignore` ou `@ts-expect-error`.
- Não deletar testes para fazê-los passar.
- Não commitar sem pedido explícito do usuário.
- Seguir o estilo do projeto: evitar `else`, preferir `const`, não alias imports, usar `@/*`.
- snake_case para colunas em schema não se aplica aqui (tabelas legado já existem).
- As queries devem ser condizentes com os dados reais do banco Qualys.

---

## Task 1: Persistir `tagFilter` nos links do menu

**Files:**

- Modify: `src/components/Shell.tsx`

**Interfaces:**

- Consumes: current search params via `useRouterState`.
- Produces: `<Link to={n.to} search={{ tagFilter }}>` preservando o filtro.

- [ ] **Step 1: Ler `tagFilter` do estado do roteador**

```tsx
const search = useRouterState({ select: (s) => s.location.search });
const tagFilter = search.tagFilter;
```

- [ ] **Step 2: Alterar o mapeamento de links para incluir search params**

Substituir:

```tsx
<Link
  key={n.to}
  to={n.to}
  className={`...`}
>
```

Por:

```tsx
<Link
  key={n.to}
  to={n.to}
  search={tagFilter ? { tagFilter } : undefined}
  className={`...`}
>
```

Fazer a mesma alteração na navegação mobile (`nav className="mt-4 flex flex-wrap gap-2 lg:hidden"`).

- [ ] **Step 3: Verificar navegação**

Rodar `bun dev` (ou `npm run dev`), acessar a app, selecionar "On-Prem" no filtro de ambiente e clicar em cada item do menu. Confirmar que a URL mantém `?tagFilter=full-on-premise`.

---

## Task 2: Criar queries agregadas para overview "Todas"

**Files:**

- Modify: `src/server/queries.server.ts`

**Interfaces:**

- Consumes: `tagFilter` opcional.
- Produces: `getOverviewKpis`, `getOverviewChartSev`, `getOverviewSla`, `getOverviewRaw` que retornam os mesmos shapes das funções por time, mas sem filtro de time.

- [ ] **Step 1: Implementar `getOverviewKpis`**

```ts
export async function getOverviewKpis({ tagFilter }: { tagFilter?: TagFilter | undefined }) {
  const tagSql = tagFilterSql(tagFilter);
  const [row] = await sql`
    SELECT
      COUNT(*)::int as "vulns",
      COUNT(*) FILTER (WHERE kb."Solution" IS NOT NULL)::int as "vulns_corr",
      COUNT(*) FILTER (WHERE kb."Solution" IS NULL)::int as "vulns_nao_corr",
      COUNT(DISTINCT v."QID")::int as "qids",
      COUNT(DISTINCT v."QG_HostID")::int as "assets",
      COALESCE(ROUND(AVG(v."Severity"::numeric / 5.0 * 100), 1), 0)::float as "qds",
      COALESCE(ROUND(AVG(v."Severity"::numeric / 5.0 * 100) FILTER (WHERE kb."Solution" IS NOT NULL), 1), 0)::float as "qds_corr",
      COUNT(DISTINCT kb."Category")::int as "workfronts"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${tagSql}
  `;
  return row as TeamData["kpis"];
}
```

- [ ] **Step 2: Implementar `getOverviewChartSev`**

```ts
export async function getOverviewChartSev({ tagFilter }: { tagFilter?: TagFilter | undefined }) {
  const tagSql = tagFilterSql(tagFilter);
  const rows = await sql`
    SELECT ${severityLabelExpr()} as "sev", COUNT(*)::int as "total"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${tagSql}
    GROUP BY ${severityLabelExpr()}
  `;
  const map = new Map(rows.map((r) => [r["sev"], r["total"]]));
  return SEVERITY_ORDER.map((s) => map.get(s) ?? 0);
}
```

- [ ] **Step 3: Implementar `getOverviewSla`**

```ts
export async function getOverviewSla({ tagFilter }: { tagFilter?: TagFilter | undefined }) {
  const tagSql = tagFilterSql(tagFilter);
  const rows = await sql`
    WITH base AS (
      SELECT ${severityLabelExpr()} as sev_label, kb."Solution", ${ageExpr()} as age, ${thresholdExpr()} as threshold
      FROM vulnerabilities v
      JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
      WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${tagSql}
    )
    SELECT
      sev_label as "sev",
      COUNT(*) FILTER (WHERE age <= threshold AND "Solution" IS NOT NULL)::int as "DentroSLA_Corr",
      COUNT(*) FILTER (WHERE age <= threshold AND "Solution" IS NULL)::int as "DentroSLA_NaoCorr",
      COUNT(*) FILTER (WHERE age > threshold AND "Solution" IS NOT NULL)::int as "ForaSLA_Corr",
      COUNT(*) FILTER (WHERE age > threshold AND "Solution" IS NULL)::int as "ForaSLA_NaoCorr"
    FROM base
    GROUP BY sev_label
  `;
  const result: Record<string, SlaBucket> = {};
  for (const s of SEVERITY_ORDER) {
    const row = rows.find((r) => r["sev"] === s);
    result[s] = row
      ? {
          DentroSLA_Corr: row["DentroSLA_Corr"],
          DentroSLA_NaoCorr: row["DentroSLA_NaoCorr"],
          ForaSLA_Corr: row["ForaSLA_Corr"],
          ForaSLA_NaoCorr: row["ForaSLA_NaoCorr"],
        }
      : { DentroSLA_Corr: 0, DentroSLA_NaoCorr: 0, ForaSLA_Corr: 0, ForaSLA_NaoCorr: 0 };
  }
  return result;
}
```

- [ ] **Step 4: Implementar `getOverviewRaw`**

```ts
export async function getOverviewRaw({ tagFilter }: { tagFilter?: TagFilter | undefined }) {
  const tagSql = tagFilterSql(tagFilter);
  const rows = await sql`
    WITH base AS (
      SELECT ${severityLabelExpr()} as sev_label, v."QID", COALESCE(kb."Category", 'Unknown') as "action", ${ageExpr()} as age
      FROM vulnerabilities v
      JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
      WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${tagSql}
    )
    SELECT
      sev_label as "sev",
      "action",
      COUNT(*)::int as "total",
      ROUND(AVG(age)::numeric, 1)::float as "avg_age",
      COUNT(DISTINCT "QID")::int as "qids"
    FROM base
    GROUP BY sev_label, "action"
  `;
  const result: Record<string, SeverityBlock> = {};
  for (const s of SEVERITY_ORDER) {
    result[s] = { total: 0, actions: {} };
  }
  for (const r of rows) {
    const block = result[r["sev"]];
    if (!block) continue;
    block.total += r["total"];
    block.actions[r["action"]] = {
      total: r["total"],
      avg_age: r["avg_age"],
      qids: r["qids"],
    };
  }
  return result;
}
```

- [ ] **Step 5: Implementar `getOverview`**

```ts
export async function getOverview({
  tagFilter,
}: {
  tagFilter?: TagFilter | undefined;
}): Promise<TeamData> {
  const [kpis, chartSev, slaData, raw] = await Promise.all([
    getOverviewKpis({ tagFilter }),
    getOverviewChartSev({ tagFilter }),
    getOverviewSla({ tagFilter }),
    getOverviewRaw({ tagFilter }),
  ]);
  const trends: Record<string, Trend> = {
    vulns: { diff: 0, pct: 0 },
    qids: { diff: 0, pct: 0 },
    assets: { diff: 0, pct: 0 },
    qds: { diff: 0, pct: 0 },
    qds_corr: { diff: 0, pct: 0 },
    workfronts: { diff: 0, pct: 0 },
  };
  return { kpis, trends, chartSev, slaData, raw };
}
```

- [ ] **Step 6: Verificar tipos**

Rodar `bun typecheck` (ou `npx tsc --noEmit` se não houver script). Esperado: sem erros de tipo em `queries.server.ts`.

---

## Task 3: Expor `getOverview` via server function e atualizar options

**Files:**

- Modify: `src/lib/data.fn.ts`
- Modify: `src/lib/sla-data.ts`

**Interfaces:**

- Consumes: `getOverview` de `queries.server.ts`.
- Produces: `fetchOverview` já existe, mas precisa usar a nova função; `overviewAllQueryOptions` continua a mesma assinatura.

- [ ] **Step 1: Atualizar `fetchOverview` em `data.fn.ts`**

```ts
export const fetchOverview = createServerFn({ method: "GET" })
  .validator(z.object({ tagFilter: tagFilterSchema }))
  .handler(async ({ data }) => {
    const { getOverview } = await import("../server/queries.server");
    return await getOverview(data);
  });
```

- [ ] **Step 2: Garantir que `overviewAllQueryOptions` em `sla-data.ts` continue funcionando**

Não precisa alterar, pois `fetchOverview` mantém a mesma assinatura. Apenas verificar que `queryKey` e `queryFn` estão corretos.

---

## Task 4: Atualizar `index.tsx` para passar `tagFilter` corretamente

**Files:**

- Modify: `src/routes/index.tsx`

**Interfaces:**

- Consumes: `overviewAllQueryOptions(tagFilter)`.

- [ ] **Step 1: Verificar uso da query**

A linha existente já está correta:

```tsx
const queryOptions =
  team === "Todas" ? overviewAllQueryOptions(tagFilter) : overviewQueryOptions(team, tagFilter);
```

Apenas confirmar que `tagFilter` está sendo lido corretamente de `Route.useSearch()`.

- [ ] **Step 2: Testar overview**

Acessar `/` com `?tagFilter=full-on-premise`. Confirmar que o card "Vulnerabilidades" mostra 13.625 e "Ativos distintos" mostra 47.

---

## Task 5: Aplicar `tagFilter` em SLA e Squads

**Files:**

- Modify: `src/server/queries.server.ts`
- Modify: `src/lib/sla-data.ts`
- Modify: `src/lib/data.fn.ts`
- Modify: `src/routes/sla.tsx`
- Modify: `src/routes/squads.tsx`

**Interfaces:**

- Consumes: `tagFilter` opcional.
- Produces: `getAllTeamsData(tagFilter?)` retorna `Record<string, TeamData>` filtrado.

- [ ] **Step 1: Modificar `getAllTeamsData` para aceitar `tagFilter`**

```ts
export async function getAllTeamsData({
  tagFilter,
}: {
  tagFilter?: TagFilter | undefined;
} = {}): Promise<Record<string, TeamData>> {
  const result: Record<string, TeamData> = {};
  for (const team of TEAM_NAMES) {
    result[team] = await getTeamData({ team, tagFilter });
  }
  return result;
}
```

- [ ] **Step 2: Otimizar `getAllTeamsData` com queries agregadas (opcional, se tempo permitir)**

Em vez de iterar por time, fazer 4 queries agregadas por time de uma só vez:

```ts
export async function getAllTeamsData({
  tagFilter,
}: {
  tagFilter?: TagFilter | undefined;
} = {}): Promise<Record<string, TeamData>> {
  const tagSql = tagFilterSql(tagFilter);
  const teamExpr = extractTeamExpr();

  const [kpisRows, chartRows, slaRows, rawRows] = await Promise.all([
    sql`
      SELECT ${teamExpr} as "team",
        COUNT(*)::int as "vulns",
        COUNT(*) FILTER (WHERE kb."Solution" IS NOT NULL)::int as "vulns_corr",
        COUNT(*) FILTER (WHERE kb."Solution" IS NULL)::int as "vulns_nao_corr",
        COUNT(DISTINCT v."QID")::int as "qids",
        COUNT(DISTINCT v."QG_HostID")::int as "assets",
        COALESCE(ROUND(AVG(v."Severity"::numeric / 5.0 * 100), 1), 0)::float as "qds",
        COALESCE(ROUND(AVG(v."Severity"::numeric / 5.0 * 100) FILTER (WHERE kb."Solution" IS NOT NULL), 1), 0)::float as "qds_corr",
        COUNT(DISTINCT kb."Category")::int as "workfronts"
      FROM vulnerabilities v
      JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
      WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${tagSql}
      GROUP BY ${teamExpr}
    `,
    // ... similar para chartSev, sla, raw
  ]);

  // Montar Record<string, TeamData> a partir das 4 listas.
}
```

Se optar pela otimização completa, incluir queries para `chartSev`, `slaData` e `raw`. Caso contrário, manter a iteração por time como quick-win.

- [ ] **Step 3: Atualizar `data.fn.ts`**

```ts
const allTeamsFilterSchema = z.object({ tagFilter: tagFilterSchema });

export const fetchAllTeamsData = createServerFn({ method: "GET" })
  .validator(allTeamsFilterSchema)
  .handler(async ({ data }) => {
    const { getAllTeamsData } = await import("../server/queries.server");
    return await getAllTeamsData(data);
  });
```

- [ ] **Step 4: Atualizar `sla-data.ts`**

```ts
export const squadsQueryOptions = (tagFilter?: TagFilter | undefined) =>
  queryOptions({
    queryKey: ["squads", tagFilter],
    queryFn: () => fetchAllTeamsData({ data: { tagFilter } }),
  });

export const slaQueryOptions = (tagFilter?: TagFilter | undefined) =>
  queryOptions({
    queryKey: ["sla", tagFilter],
    queryFn: () => fetchAllTeamsData({ data: { tagFilter } }),
  });
```

- [ ] **Step 5: Atualizar `sla.tsx`**

Adicionar:

```tsx
type SlaSearch = {
  tagFilter?: ("full" | "full-cloud" | "full-on-premise") | undefined;
};

export const Route = createFileRoute("/sla")({
  validateSearch: (search: Record<string, unknown>): SlaSearch => ({
    tagFilter:
      search["tagFilter"] === "full" ||
      search["tagFilter"] === "full-cloud" ||
      search["tagFilter"] === "full-on-premise"
        ? search["tagFilter"]
        : undefined,
  }),
  // ... head
  component: Sla,
});
```

No componente:

```tsx
const search = Route.useSearch();
const tagFilter = search.tagFilter ?? "full";
const { data: teams = {}, isLoading, isError } = useQuery(slaQueryOptions(tagFilter));
```

- [ ] **Step 6: Atualizar `squads.tsx`**

Mesmo padrão de `sla.tsx`.

- [ ] **Step 7: Verificar**

Acessar `/sla?tagFilter=full-on-premise` e `/squads?tagFilter=full-on-premise`. Confirmar que os números mudam em relação ao "Full".

---

## Task 6: Corrigir agrupamento e adicionar paginação em Ativos

**Files:**

- Modify: `src/server/queries.server.ts`
- Modify: `src/lib/sla-data.ts`
- Modify: `src/lib/data.fn.ts`
- Modify: `src/routes/ativos.tsx`

**Interfaces:**

- Consumes: `page`, `pageSize` opcionais.
- Produces: `{ rows: AssetRow[], total: number, page: number, pageSize: number }`.

- [ ] **Step 1: Modificar `getAssets` em `queries.server.ts`**

```ts
export async function getAssets({
  team,
  q,
  tagFilter,
  page = 1,
  pageSize = 50,
}: {
  team?: string | undefined;
  q?: string | undefined;
  tagFilter?: TagFilter | undefined;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: AssetRow[]; total: number; page: number; pageSize: number }> {
  const teamFilter = squadFilterSql(team);
  const qFilter = q
    ? sql`AND (a."IP" ILIKE ${`%${q}%`} OR a."DNS" ILIKE ${`%${q}%`} OR a."OS" ILIKE ${`%${q}%`})`
    : sql``;
  const tagSql = tagFilterSql(tagFilter);
  const offset = (page - 1) * pageSize;

  const [countRow] = await sql`
    SELECT COUNT(DISTINCT v."QG_HostID")::int as "total"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${qFilter}
      ${tagSql}
  `;

  const rows = await sql`
    SELECT
      a."IP" as "ip",
      COALESCE(a."DNS", '') as "dns",
      COALESCE(a."OS", '') as "os",
      ${extractTeamExpr()} as "team",
      COUNT(*)::int as "vulns",
      MAX(${ageExpr()})::int as "maxAge",
      COUNT(*) FILTER (WHERE v."Severity"::int = 5)::int as "crit"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${qFilter}
      ${tagSql}
    GROUP BY a."QG_HostID", a."IP", a."DNS", a."OS", a."Tags"
    ORDER BY vulns DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  return {
    rows: rows.map((r) => ({
      ip: r["ip"],
      dns: r["dns"],
      os: r["os"],
      team: r["team"],
      vulns: r["vulns"],
      maxAge: r["maxAge"],
      crit: r["crit"],
    })),
    total: countRow.total,
    page,
    pageSize,
  };
}
```

- [ ] **Step 2: Atualizar tipos em `sla-data.ts`**

```ts
export type AssetsResponse = {
  rows: AssetRow[];
  total: number;
  page: number;
  pageSize: number;
};

export const assetsQueryOptions = (filters: {
  team?: string;
  q?: string;
  tagFilter?: TagFilter | undefined;
  page?: number;
  pageSize?: number;
}) =>
  queryOptions({
    queryKey: ["assets", filters],
    queryFn: () => fetchAssets({ data: filters }),
  });
```

- [ ] **Step 3: Atualizar schema em `data.fn.ts`**

```ts
const assetsFilterSchema = z.object({
  team: z.string().optional(),
  q: z.string().optional(),
  tagFilter: tagFilterSchema,
  page: z.number().optional(),
  pageSize: z.number().optional(),
});
```

- [ ] **Step 4: Atualizar `ativos.tsx`**

Adicionar `page` e `pageSize` no search schema e no componente. Renderizar controles de paginação.

```tsx
type AtivosSearch = {
  q?: string | undefined;
  team?: string | undefined;
  tagFilter?: ("full" | "full-cloud" | "full-on-premise") | undefined;
  page?: number | undefined;
};

export const Route = createFileRoute("/ativos")({
  validateSearch: (search: Record<string, unknown>): AtivosSearch => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
    team: typeof search["team"] === "string" ? search["team"] : undefined,
    tagFilter:
      search["tagFilter"] === "full" ||
      search["tagFilter"] === "full-cloud" ||
      search["tagFilter"] === "full-on-premise"
        ? search["tagFilter"]
        : undefined,
    page: typeof search["page"] === "number" ? search["page"] : undefined,
  }),
  // ...
});
```

No componente:

```tsx
const page = search.page ?? 1;
const pageSize = 50;
const { data, isLoading, isError } = useQuery(
  assetsQueryOptions({ team, q: debouncedQ, tagFilter, page, pageSize }),
);
const rows = data?.rows ?? [];
const total = data?.total ?? 0;
const totalPages = Math.ceil(total / pageSize);

// Renderizar: <span>{rows.length} de {total} ativos</span>
// Botões: Anterior / Próxima desabilitados nas extremidades.
```

- [ ] **Step 5: Verificar**

Acessar `/ativos?tagFilter=full-on-premise`. Confirmar que mostra "X de 47 ativos" e a paginação funciona.

---

## Task 7: Adicionar paginação em Vulnerabilidades

**Files:**

- Modify: `src/server/queries.server.ts`
- Modify: `src/lib/sla-data.ts`
- Modify: `src/lib/data.fn.ts`
- Modify: `src/routes/vulnerabilidades.tsx`

**Interfaces:**

- Consumes: `page`, `pageSize` opcionais.
- Produces: `{ rows: QidRow[], total: number, page: number, pageSize: number }`.

- [ ] **Step 1: Modificar `getQids` em `queries.server.ts`**

```ts
export async function getQids({
  sev,
  team,
  q,
  tagFilter,
  page = 1,
  pageSize = 50,
}: {
  sev?: string | undefined;
  team?: string | undefined;
  q?: string | undefined;
  tagFilter?: TagFilter | undefined;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: QidRow[]; total: number; page: number; pageSize: number }> {
  const teamFilter = squadFilterSql(team);
  const sevFilter = sev && sev !== "Todas" ? sql`AND ${severityLabelExpr()} = ${sev}` : sql``;
  const qFilter = q
    ? sql`AND (kb."Title" ILIKE ${`%${q}%`} OR kb."Category" ILIKE ${`%${q}%`} OR v."QID" ILIKE ${`%${q}%`})`
    : sql``;
  const tagSql = tagFilterSql(tagFilter);
  const teamExpr = team && team !== "Todas" ? sql`${team}` : extractTeamExpr();
  const offset = (page - 1) * pageSize;

  const [countRow] = await sql`
    SELECT COUNT(*)::int as "total"
    FROM (
      SELECT v."QID", ${teamExpr} as "team", COALESCE(kb."Category", 'Unknown') as "action", ${severityLabelExpr()} as "sev"
      FROM vulnerabilities v
      JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
      LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
      WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
        AND v."Severity"::int IN (1,2,3,4,5)
        ${teamFilter}
        ${sevFilter}
        ${qFilter}
        ${tagSql}
      GROUP BY v."QID", ${teamExpr}, COALESCE(kb."Category", 'Unknown'), ${severityLabelExpr()}
    ) sub
  `;

  const rows = await sql`
    SELECT
      v."QID"::int as "qid",
      MAX(kb."Title") as "title",
      ${severityLabelExpr()} as "sev",
      ${teamExpr} as "team",
      COALESCE(kb."Category", 'Unknown') as "action",
      COUNT(*)::int as "count",
      COUNT(*) FILTER (WHERE kb."Solution" IS NOT NULL)::int as "corr",
      COUNT(*) FILTER (WHERE kb."Solution" IS NULL)::int as "naoCorr",
      MAX(${ageExpr()})::int as "age",
      MAX(kb."Solution") as "solution"
    FROM vulnerabilities v
    JOIN "All_Assets" a ON v."QG_HostID" = a."QG_HostID"
    LEFT JOIN "KnowledgeBase" kb ON v."QID" = kb."QID"
    WHERE v."Status" IN ${sql(ACTIVE_STATUSES)}
      AND v."Severity"::int IN (1,2,3,4,5)
      ${teamFilter}
      ${sevFilter}
      ${qFilter}
      ${tagSql}
    GROUP BY v."QID", ${teamExpr}, COALESCE(kb."Category", 'Unknown'), ${severityLabelExpr()}
    ORDER BY count DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  return {
    rows: rows.map((r) => ({
      qid: r["qid"],
      title: r["title"] ?? "",
      sev: r["sev"],
      team: r["team"],
      action: r["action"],
      count: r["count"],
      corr: r["corr"],
      naoCorr: r["naoCorr"],
      age: r["age"],
      solution: r["solution"] ?? "",
    })),
    total: countRow.total,
    page,
    pageSize,
  };
}
```

- [ ] **Step 2: Atualizar tipos em `sla-data.ts`**

```ts
export type QidsResponse = {
  rows: QidRow[];
  total: number;
  page: number;
  pageSize: number;
};

export const qidsQueryOptions = (filters: {
  sev?: string;
  team?: string;
  q?: string;
  tagFilter?: TagFilter | undefined;
  page?: number;
  pageSize?: number;
}) =>
  queryOptions({
    queryKey: ["qids", filters],
    queryFn: () => fetchQids({ data: filters }),
  });
```

- [ ] **Step 3: Atualizar schema em `data.fn.ts`**

```ts
const qidsFilterSchema = z.object({
  sev: z.string().optional(),
  team: z.string().optional(),
  q: z.string().optional(),
  tagFilter: tagFilterSchema,
  page: z.number().optional(),
  pageSize: z.number().optional(),
});
```

- [ ] **Step 4: Atualizar `vulnerabilidades.tsx`**

Adicionar `page` no search schema e controles de paginação.

```tsx
type VulnSearch = {
  q?: string | undefined;
  sev?: string | undefined;
  team?: string | undefined;
  tagFilter?: ("full" | "full-cloud" | "full-on-premise") | undefined;
  page?: number | undefined;
};
```

No componente:

```tsx
const page = search.page ?? 1;
const pageSize = 50;
const { data, isLoading, isError } = useQuery(
  qidsQueryOptions({ sev, team, q: debouncedQ, tagFilter, page, pageSize }),
);
const rows = data?.rows ?? [];
const total = data?.total ?? 0;
const totalPages = Math.ceil(total / pageSize);
```

- [ ] **Step 5: Verificar**

Acessar `/vulnerabilidades?tagFilter=full-on-premise`. Confirmar paginação e total condizente.

---

## Task 8: Adicionar paginação em Relatórios (se aplicável)

**Files:**

- Modify: `src/server/queries.server.ts`
- Modify: `src/lib/sla-data.ts`
- Modify: `src/lib/data.fn.ts`
- Modify: `src/routes/relatorios.tsx`

**Interfaces:**

- Mesmo padrão de Ativos/Vulnerabilidades para a lista de assets do relatório.

- [ ] **Step 1: Adicionar paginação em `getReports` (apenas `assets`)**

```ts
export async function getReports({
  team,
  os,
  tagFilter,
  page = 1,
  pageSize = 50,
}: {
  team?: string | undefined;
  os?: string | undefined;
  tagFilter?: TagFilter | undefined;
  page?: number;
  pageSize?: number;
}): Promise<ReportData & { assetsTotal: number; assetsPage: number; assetsPageSize: number }> {
  // ... existing filters
  const offset = (page - 1) * pageSize;

  // Count total assets
  const [assetsCount] = await sql`... COUNT(DISTINCT a."QG_HostID") ...`;

  // Add LIMIT/OFFSET to assets query
  const assets = await sql`... LIMIT ${pageSize} OFFSET ${offset}`;

  return {
    // ... existing fields
    assetsTotal: assetsCount.total,
    assetsPage: page,
    assetsPageSize: pageSize,
  };
}
```

- [ ] **Step 2: Atualizar `sla-data.ts`, `data.fn.ts` e `relatorios.tsx`**

Seguir o mesmo padrão das outras rotas.

---

## Task 9: Verificação final

- [ ] **Step 1: Typecheck**

Rodar `bun typecheck` (ou `npx tsc --noEmit`). Esperado: zero erros.

- [ ] **Step 2: Lint**

Rodar `bun run lint`. Esperado: zero erros.

- [ ] **Step 3: Testes manuais no browser**

1. Acessar `/` com "Full" → anotar números.
2. Selecionar "On-Prem" → verificar que overview mostra 13.625 vulns / 47 ativos.
3. Navegar para Vulnerabilidades, Ativos, SLA, Squads, Relatórios → confirmar que `tagFilter=full-on-premise` persiste na URL e os dados mudam.
4. Em Vulnerabilidades e Ativos, testar paginação (próxima/anterior).
5. Aplicar filtro de time "All Cloud" + Ambiente "On-Prem" → deve retornar vazio (interseção nula), demonstrando prioridade do ambiente.
6. Limpar filtros → voltar ao estado "Full".

- [ ] **Step 4: Medir performance**

Abrir DevTools → Network e recarregar o overview "Todas" + "On-Prem". Confirmar que a server function retorna em < 3s (vs > 10s anteriormente).

- [ ] **Step 5: Commit (somente se solicitado)**

Se o usuário pedir commit:

```bash
git add .
git commit -m "fix(overview): persist tagFilter, fix on-prem aggregation, add pagination, optimize queries"
```

---

## Spec Coverage Check

- Persistência do filtro: Task 1.
- Correção overview "Todas": Tasks 2, 3, 4.
- tagFilter em SLA/Squads: Task 5.
- Paginação: Tasks 6, 7, 8.
- Correção agrupamento Ativos: Task 6.
- Otimização queries: Tasks 2, 5.
