# Design: Correlação real entre `tags` e `All_Assets`

**Data:** 2026-09-21  
**Status:** Draft para revisão  
**Escopo:** Substituir a filtragem baseada em `ILIKE '%cloud%'` na coluna texto `All_Assets."Tags"` por uma relação real com a tabela `tags`, permitindo filtro multi-select por tags reais.

## Contexto

Hoje o sistema filtra assets por:

- `full`: sem filtro adicional.
- `full-cloud`: `All_Assets."Tags" ILIKE '%cloud%'`.
- `full-on-premise`: `All_Assets."Tags" IS NULL OR All_Assets."Tags" NOT ILIKE '%cloud%'`.

Esse mecanismo é frágil: depende de substring no meio de uma coluna CSV, não reconhece tags que não contenham a palavra "cloud", e ignora a tabela `tags` que já existe no banco com os metadados reais (incluindo ~40 tags `Times:`).

A tabela `tags` contém:

- `id` (bigint PK)
- `name` (text) — nome da tag, ex.: `Times:Cloud`, `Cloud Agent`, `EASM`.
- `tag_uuid`, `parent_tag_uuid`, `color`, `criticality_score`, etc.

A tabela `All_Assets` contém:

- `"ID"` (bigint)
- `"Tags"` (text) — string CSV com nomes de tags, ex.: `"Cloud Agent,NAT-Laptop,Times:Workstation,Times:On-Prem"`.
- `team` (text) e `is_cloud` (boolean) — campos denormalizados preenchidos pelo ETL.

A correlação entre as duas tabelas deve ser feita pelo **nome da tag** (`tags.name` ↔ valor dentro de `All_Assets."Tags"`), já que a coluna CSV não armazena UUIDs.

## Objetivo

1. Criar e manter uma tabela de junção `asset_tags(asset_id, tag_id)`.
2. Substituição completa do filtro `tagFilter` (`full`/`full-cloud`/`full-on-premise`) por um filtro multi-select de tags reais (`tags: number[]`).
3. Modo de seleção: **AND** — um asset só aparece se possuir **todas** as tags selecionadas.
4. Alimentar todas as queries existentes (overview, ativos, vulnerabilidades, relatórios, hardening) com esse novo filtro.

## Decisões tomadas

| Pergunta | Resposta |
|---|---|
| Objetivo | Substituir parse da coluna `Tags` por relação real com `tags`. |
| Correlação no DB | Tabela de junção `asset_tags`. |
| Filtro | Expandir para tags reais. |
| Tags disponíveis | Todas as ~337 tags da tabela `tags`. |
| Modo de seleção | Multi-select com AND. |
| Compatibilidade com `tagFilter` legado | Substituir completamente. |
| Abordagem geral | **A — Minimal** (tabela de junção + joins em runtime; materialized views inalteradas no primeiro passo). |

## Schema

```sql
CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id BIGINT NOT NULL,
  tag_id   BIGINT NOT NULL,
  PRIMARY KEY (asset_id, tag_id)
);

-- O postgres-js/template não aceita FK com colunas em maiúsculas sem escaping manual;
-- aplicar via migration SQL com identificadores citados:
ALTER TABLE asset_tags
  ADD CONSTRAINT fk_asset_tags_asset FOREIGN KEY (asset_id) REFERENCES "All_Assets"("ID"),
  ADD CONSTRAINT fk_asset_tags_tag   FOREIGN KEY (tag_id)   REFERENCES tags(id);

CREATE INDEX idx_asset_tags_tag ON asset_tags(tag_id);
```

## ETL

Local: `scripts/etl.ts`.

Após `applyDelta("All_Assets")` e antes de `refreshViews()`, adicionar:

```ts
async function rebuildAssetTags() {
  await sql`TRUNCATE asset_tags`;
  await sql`
    INSERT INTO asset_tags (asset_id, tag_id)
    SELECT DISTINCT a."ID", t.id
    FROM "All_Assets" a
    CROSS JOIN LATERAL UNNEST(string_to_array(TRIM(a."Tags"), ',')) AS tag_name
    JOIN tags t ON LOWER(t.name) = LOWER(tag_name)
    WHERE a."Tags" IS NOT NULL
      AND TRIM(a."Tags") <> ''
  `;
  await sql`ANALYZE asset_tags`;
}
```

### Regras

- Trim na string `Tags` antes do split.
- Case-insensitive no match do nome.
- Ignorar valores que não existam em `tags.name`.
- `TRUNCATE` + `INSERT` porque `All_Assets` é recarregado via delta.

## Queries (`src/server/queries.server.ts`)

### 1. Remover `tagFilter`

- Remover `tagFilterSql` e `squadFilterSql` que usam `ILIKE '%cloud%'`.
- Remover a lógica de `teamViewKey` que escolhe materialized view por `tagFilter`.
- Simplificar `assetCteSql` para aceitar `tags: number[]`.

### 2. Novo helper

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

### 3. Novo endpoint de tags

```ts
export async function getTags() {
  return sql<{ id: string; name: string }[]>`
    SELECT id, name
    FROM tags
    ORDER BY name
  `;
}
```

### 4. Funções afetadas

Todas as funções que recebem `tagFilter` passam a receber `tags: number[]`:

- `getTeamKpis`, `getTeamChartSev`, `getTeamSla`, `getTeamRaw`, `getTeamData`
- `getOverview`, `getAllTeamsData`
- `getQids`
- `getVulnerabilityStats`
- `getAssets`
- `getHardening`
- `getReports`

Materialized views existentes (`mv_*`) continuam sendo usadas quando não há filtro de tags ativo (para não quebrar performance), mas quando `tags.length > 0` as queries devem cair no caminho CTE/join real com `asset_tags`.

**Observação:** como as materialized views atuais não são filtradas por tag, o fallback CTE será o caminho padrão quando o usuário selecionar tags. Se a performance se mostrar inadequada, a próxima iteração cria views materializadas por tag (Abordagem B).

## Server functions e React Query

### `src/lib/data.fn.ts`

- Remover `tagFilterSchema`.
- Adicionar `tagsSchema = z.array(z.coerce.number()).default([])`.
- Atualizar todos os `fetch*` para repassar `tags`.
- Adicionar `fetchTags()` → `getTags()`.

### `src/lib/sla-data.ts`

- Substituir `tagFilter` por `tags` em todas as `queryOptions`.
- Adicionar `tagsQueryOptions()` para listar tags.

## Rotas

Atualizar search schemas e uso:

- `src/routes/index.tsx`
- `src/routes/ativos.tsx`
- `src/routes/vulnerabilidades.tsx`
- `src/routes/relatorios.tsx`
- `src/routes/hardening.tsx` (se aplicável)

Mudança: `search.tagFilter` → `search.tags` (array de números).

## UI

### `src/components/TagFilter.tsx`

Substituir o dropdown de 3 opções por um multi-select de tags reais.

Requisitos:

- Buscar tags via `useSuspenseQuery(tagsQueryOptions())` ou `useQuery`.
- Ordenar alfabeticamente.
- Permitir busca textual dentro do dropdown.
- Exibir tags selecionadas como chips.
- Navegar com `navigate({ search: { tags: selectedIds } })`.

Componente sugerido: usar `Command` + `Popover` + `Badge` dos shadcn/ui já presentes.

### `src/lib/constants.ts`

- Remover `TAG_FILTER_OPTIONS` e `TagFilter`.

## Error handling

- ETL: se `rebuildAssetTags()` falhar, logar erro e não chamar `refreshViews()` para evitar views inconsistentes.
- Queries: se `tags` contiver IDs inexistentes, o `ANY` simplesmente não retorna matches (comportamento seguro).
- UI: dropdown deve mostrar estado vazio/erro se `getTags()` falhar.

## Segurança

- Todas as queries continuam usando `postgres` com template literals parametrizadas.
- `tags` é validado com Zod (`array of numbers`) antes de chegar às queries.
- Não expor credenciais: `DATABASE_URL` continua vindo de `.env`.

## Testes

- Verificar `EXPLAIN (ANALYZE, BUFFERS)` da query de filtro por tags em `asset_tags` com ~37k assets.
- Verificar que ETL popula `asset_tags` corretamente após carga de `All_Assets`.
- Verificar que filtro multi-select AND funciona em cada rota afetada.

## Próximos passos

1. Criar migration SQL para `asset_tags`.
2. Atualizar `scripts/etl.ts`.
3. Atualizar `src/server/queries.server.ts`.
4. Atualizar `src/lib/data.fn.ts` e `src/lib/sla-data.ts`.
5. Atualizar rotas e `TagFilter.tsx`.
6. Remover `TAG_FILTER_OPTIONS`.
7. Rodar `bun run build` e verificar.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `asset_tags` fique vazio se `tags.name` não bater com `All_Assets."Tags"` por causa de casing/espaços. | Match case-insensitive + trim; logar tags não encontradas para análise. |
| Performance do join em runtime com muitas tags selecionadas. | Adicionar índice; monitorar com `EXPLAIN ANALYZE`; evoluir para views materializadas se necessário. |
| Quebra de URLs antigas com `?tagFilter=full-cloud`. | Aceitável pois o filtro legado será removido; usuário precisará selecionar as tags novamente. |

## Perguntas em aberto

- A tabela `tags` é atualizada manualmente/fora do ETL ou deve ser carregada por CSV também?
- Queremos manter os campos denormalizados `team` e `is_cloud` em `All_Assets` ou derivá-los de `asset_tags` no futuro?
