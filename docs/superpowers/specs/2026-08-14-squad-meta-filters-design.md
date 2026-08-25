# Meta-filtros de Squad e Visão Geral "Todas"

## Contexto

O usuário quer consolidar a forma de filtrar por ambiente no seletor de **Squad**, eliminando a duplicidade dos itens `SemTime-Cloud` e `SemTime-OnPrem` e adicionando meta-filtros que abrangem cloud e on-premise.

## Decisões

- Remover `SemTime-Cloud` e `SemTime-OnPrem` de `TEAM_NAMES`.
- Adicionar `All Cloud` e `All On-Prem` como opções de squad em todas as páginas que filtram por time.
- Manter o filtro `Ambiente` existente (`Full` / `All Clouds` / `On-Prem`) sem alterações — ele continua independente.
- Adicionar `Todas` como primeira opção no seletor de squad da Visão Geral; nesse modo a consulta não filtra por time.
- Para `All Cloud`/`All On-Prem` em qualquer página, a coluna/extração do time continua mostrando o time real (ex: `Cloud-DBA`), pois o filtro é por ambiente, não por time.

## Mudanças

### 1. `src/lib/constants.ts`

Remover:

```ts
"SemTime-Cloud",
...
"SemTime-OnPrem",
```

Resultado parcial:

```ts
export const TEAM_NAMES = [
  "On-Prem",
  "Wintel",
  // ... demais times sem SemTime
] as const;
```

### 2. `src/server/queries.server.ts`

Criar helper `squadFilterSql`:

```ts
function squadFilterSql(team: string | undefined) {
  if (!team || team === "Todas") return sql``;
  if (team === "All Cloud") return sql`AND a."Tags" ILIKE ${"%cloud%"}`;
  if (team === "All On-Prem") return sql`AND (a."Tags" IS NULL OR a."Tags" NOT ILIKE ${"%cloud%"})`;
  return sql`AND a."Tags" ~* ${teamRegex(team)}`;
}
```

Substituir todos os `teamFilter` manuais em `getQids`, `getAssets`, `getReports` por `squadFilterSql(team)`.

### 3. Visão Geral — novas queries sem filtro de time

Criar funções equivalentes a `getTeamKpis`, `getTeamChartSev`, `getTeamSla`, `getTeamRaw`, mas sem filtro de time. A forma mais enxuta é parametrizar as funções existentes para aceitar `team?: string` e, quando omitido, não aplicar filtro de time nem forçar um time fixo no `GROUP BY`.

Simplificação proposta: refatorar as 4 funções internas para receber `team?: string`. Quando `team` é fornecido e não é meta-filtro, usa `squadFilterSql(team)` e `team` como `teamExpr`. Quando `team` é omitido/`Todas`, usa `squadFilterSql(undefined)` e `extractTeamExpr()` como `teamExpr`.

Para a Visão Geral, criar `getOverview({ tagFilter }): Promise<TeamData>` que chama as 4 funções com `team` omitido.

### 4. `src/lib/data.fn.ts`

Adicionar:

```ts
export const fetchOverview = createServerFn({ method: "GET" })
  .validator(z.object({ tagFilter: tagFilterSchema }))
  .handler(async ({ data }) => {
    const { getOverview } = await import("../server/queries.server");
    return await getOverview(data);
  });
```

### 5. `src/lib/sla-data.ts`

Adicionar:

```ts
export const overviewAllQueryOptions = (tagFilter?: TagFilter | undefined) =>
  queryOptions({
    queryKey: ["overview-all", tagFilter],
    queryFn: () => fetchOverview({ data: { tagFilter } }),
  });
```

### 6. `src/routes/index.tsx`

- Tornar `team` opcional com estado inicial `"Todas"`.
- Usar `overviewAllQueryOptions` quando `team === "Todas"`.
- Popular o seletor com `["Todas", "All Cloud", "All On-Prem", ...teamNames]`.

### 7. Outras páginas (`vulnerabilidades.tsx`, `ativos.tsx`, `relatorios.tsx`)

- Adicionar `"All Cloud"` e `"All On-Prem"` às opções do filtro de Squad (manter `"Todas"` já existente).
- Nenhuma mudança de lógica adicional — o helper `squadFilterSql` já cobre os novos valores.

## Comportamento

| Squad selecionado              | Filtro SQL                                | Significado                         |
| ------------------------------ | ----------------------------------------- | ----------------------------------- |
| `Todas`                        | nenhum                                    | Todos os ativos (respeita Ambiente) |
| `All Cloud`                    | `a."Tags" ILIKE '%cloud%'`                | Apenas ativos/vulns com tag cloud   |
| `All On-Prem`                  | `a."Tags" IS NULL OR NOT ILIKE '%cloud%'` | Apenas ativos/vulns sem tag cloud   |
| `Cloud-DBA` (ou qualquer time) | regex `Times:Cloud-DBA`                   | Apenas aquele time                  |

## Validação

1. Verificar que `SemTime-Cloud` e `SemTime-OnPrem` não aparecem mais nos dropdowns de squad.
2. Verificar que `All Cloud` e `All On-Prem` aparecem em Visão Geral, Vulnerabilidades, Ativos e Relatórios.
3. Selecionar `All Cloud` e confirmar que só aparecem registros com tag cloud.
4. Selecionar `All On-Prem` e confirmar que não aparecem registros com tag cloud.
5. Na Visão Geral, selecionar `Todas` e confirmar que os KPIs refletem todos os ativos.
6. Rodar `bun run lint` (ou `cmd /c "bun run lint"` no Windows) e confirmar que o arquivo alterado está limpo.
