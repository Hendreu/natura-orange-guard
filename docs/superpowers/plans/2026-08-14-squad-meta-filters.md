# Meta-filtros de Squad e Visão Geral "Todas" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover `SemTime-Cloud`/`SemTime-OnPrem` da lista de squads, adicionar `All Cloud`/`All On-Prem` como filtros de squad e adicionar `Todas` na Visão Geral.

**Architecture:** Centralizar a lógica de filtro de squad em um helper `squadFilterSql` que reconhece `Todas`, `All Cloud`, `All On-Prem` e times específicos. Criar uma query de overview sem filtro de time para a Visão Geral.

**Tech Stack:** TypeScript, React, TanStack Start, postgres (SQL), Bun.

## Global Constraints

- Manter o filtro `Ambiente` inalterado.
- Não alterar valores internos do filtro Ambiente (`full`, `full-cloud`, `full-on-premise`).
- Preservar URLs e bookmarks existentes.
- Não quebrar as páginas Vulnerabilidades, Ativos e Relatórios.
- Seguir o estilo de imports e formatação existente.

---

### Task 1: Remover SemTime-Cloud e SemTime-OnPrem de TEAM_NAMES

**Files:**
- Modify: `src/lib/constants.ts:22` e `src/lib/constants.ts:29`

**Interfaces:**
- Consumes: nenhum.
- Produces: `TEAM_NAMES` sem os itens removidos.

- [ ] **Step 1: Abrir `src/lib/constants.ts`**

  Localizar e remover as linhas:
  ```ts
  "SemTime-Cloud",
  ```
  e
  ```ts
  "SemTime-OnPrem",
  ```

- [ ] **Step 2: Verificar o arquivo resultante**

  Resultado esperado (trecho):
  ```ts
  export const TEAM_NAMES = [
    "On-Prem",
    "Wintel",
    "Workstation",
    "Cloud",
    "Cloud-Middleware",
    "Unix",
    "Varejo-PDV",
    "Varejo",
    "Varejo-Deskservers",
    "Workstation-RPA",
    "Varejo-Notebooks",
    "Cloud-ETL",
    "Cloud-Observability",
    "Cloud-Unix",
    "Cloud-SAP",
    "EASM",
    "Gera-HML",
    "Gera",
    "Cloud-DBA",
    "Cloud-Wintel",
    "InfraCD",
    "Cloud-CMDB",
    "Cloud-Cyber",
    "Cloud-Backup",
    "Network",
    "Renee-Migração",
    "Middleware",
    "Cloud-IDAM",
    "Cloud-SRE",
    "Cloud-ZTNA",
    "Cloud-Pilares",
    "Cloud-Coedados",
    "Cloud-Network",
    "Cloud-Panorama",
    "Cloud-Modernops",
    "Cloud-Devops-COE",
  ] as const;
  ```

- [ ] **Step 3: Rodar lint no arquivo**

  Run: `cmd /c "bun eslint src/lib/constants.ts"`
  Expected: no output (exit 0).

---

### Task 2: Criar helper squadFilterSql e aplicar nas queries

**Files:**
- Modify: `src/server/queries.server.ts`

**Interfaces:**
- Consumes: `team` string dos parâmetros das funções.
- Produces: SQL fragment usado em `getQids`, `getAssets`, `getReports`.

- [ ] **Step 1: Adicionar helper `squadFilterSql` após `tagFilterSql`**

  ```ts
  function squadFilterSql(team: string | undefined) {
    if (!team || team === "Todas") return sql``;
    if (team === "All Cloud") return sql`AND a."Tags" ILIKE ${"%cloud%"}`;
    if (team === "All On-Prem") return sql`AND (a."Tags" IS NULL OR a."Tags" NOT ILIKE ${"%cloud%"})`;
    return sql`AND a."Tags" ~* ${teamRegex(team)}`;
  }
  ```

- [ ] **Step 2: Substituir `teamFilter` em `getQids`**

  De:
  ```ts
  const teamFilter = team && team !== "Todas" ? sql`AND a."Tags" ~* ${teamRegex(team)}` : sql``;
  ```
  Para:
  ```ts
  const teamFilter = squadFilterSql(team);
  ```

  E manter `const teamExpr = team && team !== "Todas" ? sql`${team}` : extractTeamExpr();` inalterado.

- [ ] **Step 3: Substituir `teamFilter` em `getAssets`**

  De:
  ```ts
  const teamFilter = team && team !== "Todas" ? sql`AND a."Tags" ~* ${teamRegex(team)}` : sql``;
  ```
  Para:
  ```ts
  const teamFilter = squadFilterSql(team);
  ```

- [ ] **Step 4: Substituir `teamFilter` em `getReports`**

  De:
  ```ts
  const teamFilter = team && team !== "Todas" ? sql`AND a."Tags" ~* ${teamRegex(team)}` : sql``;
  ```
  Para:
  ```ts
  const teamFilter = squadFilterSql(team);
  ```

  Também substituir a segunda ocorrência em `teamRows` (mesmo padrão).

- [ ] **Step 5: Verificar lint no arquivo**

  Run: `cmd /c "bun eslint src/server/queries.server.ts"`
  Expected: no output.

---

### Task 3: Adicionar função de overview sem filtro de time

**Files:**
- Modify: `src/server/queries.server.ts`

**Interfaces:**
- Consumes: `tagFilter` opcional.
- Produces: `getOverview({ tagFilter }): Promise<TeamData>`.

- [ ] **Step 1: Refatorar `getTeamKpis` para aceitar `team` opcional**

  ```ts
  export async function getTeamKpis({
    team,
    tagFilter,
  }: {
    team?: string;
    tagFilter?: TagFilter | undefined;
  }) {
    const teamSql = squadFilterSql(team);
    const teamExpr = team && team !== "Todas" ? sql`${team}` : extractTeamExpr();
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
        ${teamSql}
        ${tagSql}
    `;
  ```

  (Replicar o padrão nas outras 3 funções internas: `getTeamChartSev`, `getTeamSla`, `getTeamRaw`.)

- [ ] **Step 2: Criar `getOverview` usando as funções refatoradas com `team` omitido**

  ```ts
  export async function getOverview({
    tagFilter,
  }: {
    tagFilter?: TagFilter | undefined;
  }): Promise<TeamData> {
    const [kpis, chartSev, slaData, raw] = await Promise.all([
      getTeamKpis({ tagFilter }),
      getTeamChartSev({ tagFilter }),
      getTeamSla({ tagFilter }),
      getTeamRaw({ tagFilter }),
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

- [ ] **Step 3: Verificar lint**

  Run: `cmd /c "bun eslint src/server/queries.server.ts"`
  Expected: no output.

---

### Task 4: Adicionar fetchOverview em data.fn.ts

**Files:**
- Modify: `src/lib/data.fn.ts`

**Interfaces:**
- Consumes: `tagFilter` opcional.
- Produz: server function `fetchOverview`.

- [ ] **Step 1: Adicionar após fetchTeamData**

  ```ts
  export const fetchOverview = createServerFn({ method: "GET" })
    .validator(z.object({ tagFilter: tagFilterSchema }))
    .handler(async ({ data }) => {
      const { getOverview } = await import("../server/queries.server");
      return await getOverview(data);
    });
  ```

- [ ] **Step 2: Verificar lint**

  Run: `cmd /c "bun eslint src/lib/data.fn.ts"`
  Expected: no output.

---

### Task 5: Adicionar overviewAllQueryOptions em sla-data.ts

**Files:**
- Modify: `src/lib/sla-data.ts`

**Interfaces:**
- Consumes: `fetchOverview`.
- Produces: `overviewAllQueryOptions`.

- [ ] **Step 1: Adicionar após overviewQueryOptions**

  ```ts
  export const overviewAllQueryOptions = (tagFilter?: TagFilter | undefined) =>
    queryOptions({
      queryKey: ["overview-all", tagFilter],
      queryFn: () => fetchOverview({ data: { tagFilter } }),
    });
  ```

- [ ] **Step 2: Verificar lint**

  Run: `cmd /c "bun eslint src/lib/sla-data.ts"`
  Expected: no output.

---

### Task 6: Atualizar Visão Geral (index.tsx)

**Files:**
- Modify: `src/routes/index.tsx`

**Interfaces:**
- Consumes: `overviewAllQueryOptions`, `overviewQueryOptions`.
- Produces: seletor com `Todas`, `All Cloud`, `All On-Prem` e times.

- [ ] **Step 1: Atualizar schema de busca**

  ```ts
  const indexSearchSchema = z.object({
    tagFilter: z.enum(["full", "full-cloud", "full-on-premise"]).optional(),
  });
  ```
  (permanece inalterado)

- [ ] **Step 2: Alterar estado inicial do squad para `"Todas"`**

  ```ts
  const [team, setTeam] = useState("Todas");
  ```

- [ ] **Step 3: Usar a query correta com base no time selecionado**

  ```ts
  const tagFilter = search.tagFilter ?? "full";
  const queryOptions = team === "Todas"
    ? overviewAllQueryOptions(tagFilter)
    : overviewQueryOptions(team, tagFilter);
  const { data, isLoading, isError } = useQuery(queryOptions);
  ```

- [ ] **Step 4: Atualizar as opções do seletor de squad**

  ```ts
  {["Todas", "All Cloud", "All On-Prem", ...teamNames].map((t) => (
    <CommandItem
      key={t}
      value={t}
      onSelect={() => {
        setTeam(t);
        setTeamOpen(false);
      }}
      // ...
    >
      {t}
    </CommandItem>
  ))}
  ```

- [ ] **Step 5: Atualizar o contador "de X squads"**

  Quando `team === "Todas"`, mostrar texto adequado ou esconder o contador. Exemplo:
  ```tsx
  <span className="stencil text-[9px] text-muted-foreground">
    {team === "Todas" ? "todos os squads" : `de ${teamNames.length} squads`}
  </span>
  ```

- [ ] **Step 6: Verificar lint**

  Run: `cmd /c "bun eslint src/routes/index.tsx"`
  Expected: no output.

---

### Task 7: Adicionar All Cloud / All On-Prem nos filtros de squad das outras páginas

**Files:**
- Modify: `src/routes/vulnerabilidades.tsx`
- Modify: `src/routes/ativos.tsx`
- Modify: `src/routes/relatorios.tsx`

**Interfaces:**
- Consumes: `teamNames`.
- Produces: dropdowns com as novas opções.

- [ ] **Step 1: Atualizar `vulnerabilidades.tsx`**

  Alterar:
  ```ts
  options={["Todas", ...teamNames]}
  ```
  Para:
  ```ts
  options={["Todas", "All Cloud", "All On-Prem", ...teamNames]}
  ```

- [ ] **Step 2: Atualizar `ativos.tsx`**

  Alterar o map de opções do Select de Squad:
  ```ts
  {["Todas", ...teamNames].map((t) => (...))}
  ```
  Para:
  ```ts
  {["Todas", "All Cloud", "All On-Prem", ...teamNames].map((t) => (...))}
  ```

- [ ] **Step 3: Atualizar `relatorios.tsx`**

  Alterar o map de opções do Select de Time:
  ```ts
  {teamNames.map((t) => (...))}
  ```
  Para:
  ```ts
  {["All Cloud", "All On-Prem", ...teamNames].map((t) => (
    <SelectItem key={t} value={t} className="text-xs">
      {t}
    </SelectItem>
  ))}
  ```

  Nota: o Select de Time em relatórios já tem um `<SelectItem value="Todas">Todas</SelectItem>` separado; manter ele e adicionar as novas opções depois.

- [ ] **Step 4: Verificar lint em cada arquivo**

  Run:
  ```bash
  cmd /c "bun eslint src/routes/vulnerabilidades.tsx"
  cmd /c "bun eslint src/routes/ativos.tsx"
  cmd /c "bun eslint src/routes/relatorios.tsx"
  ```
  Expected: no output.

---

### Task 8: Verificação final

- [ ] **Step 1: Verificar diff completo**

  Run: `git diff --stat`
  Expected: arquivos alterados conforme tasks.

- [ ] **Step 2: Build de desenvolvimento**

  Run: `cmd /c "bun run build:dev"`
  Expected: exit 0.

- [ ] **Step 3: Verificação manual**

  Run: `cmd /c "bun dev"`
  Ações:
  1. Visão Geral: confirmar que `Todas`, `All Cloud`, `All On-Prem` e os times reais aparecem no seletor.
  2. Selecionar `Todas` na Visão Geral e confirmar que KPIs refletem todos os ativos.
  3. Vulnerabilidades/Ativos/Relatórios: confirmar `All Cloud` e `All On-Prem` nos filtros de Squad/Time.
  4. Confirmar que `SemTime-Cloud` e `SemTime-OnPrem` não aparecem mais.
  5. Testar `All Cloud` e `All On-Prem` e verificar que filtram corretamente.

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/constants.ts src/server/queries.server.ts src/lib/data.fn.ts src/lib/sla-data.ts src/routes/index.tsx src/routes/vulnerabilidades.tsx src/routes/ativos.tsx src/routes/relatorios.tsx docs/superpowers/specs/2026-08-14-squad-meta-filters-design.md docs/superpowers/plans/2026-08-14-squad-meta-filters.md
  git commit -m "feat(squad): add All Cloud / All On-Prem filters and overview 'Todas' option"
  ```
