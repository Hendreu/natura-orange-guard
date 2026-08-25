# Design: Filtro de Ambiente, Dados On-Prem e Performance

## Contexto

O usuário reportou que:

1. O filtro de ambiente ("Ambiente: On-Prem") nem sempre funciona e precisa ter prioridade sobre outros filtros.
2. Dados on-premise não aparecem ou aparecem pela metade.
3. Os dados cruzados entre páginas não batem com o banco.
4. As chamadas estão lentas.

## Diagnóstico

Investigação direta no banco e na aplicação hospedada confirmou:

- **Filtro não persiste na navegação**: `Shell.tsx` usa `<Link to={n.to}>` sem preservar search params, então ao trocar de página o `tagFilter` é perdido.
- **Visão geral "Todas" retorna dados parciais**: `getOverview()` itera por todos os `TEAM_NAMES` e soma KPIs por time. Ativos on-prem sem tag `Times:<time>` (ex: `SemTime-OnPrem`, `Unknown`) são excluídos. Resultado: 692 vulns / 14 ativos no overview vs 13.625 vulns / 47 ativos no banco.
- **SLA e Squads ignoram o filtro**: usam `getAllTeamsData()` sem receber `tagFilter`.
- **LIMIT corta resultados**: `getQids` usa `LIMIT 120` e `getAssets` usa `LIMIT 100`. Com on-prem mostrando 13k+ vulns, a tabela parece incompleta.
- **Agrupamento de Ativos inconsistente**: `getAssets` agrupa por `IP, DNS, OS, team`, não por `QG_HostID`, gerando duplicatas ou perda de identidade.
- **Queries N+1 lentas**: `getOverview` e `getAllTeamsData` disparam ~148 queries cada (37 times × 4 queries).

## Escopo

Aprovação: **A + B** (correção enxuta + paginação completa).

## Mudanças

### 1. Persistência do filtro de ambiente

- Em `Shell.tsx`, os links do menu devem preservar `tagFilter` da URL atual.
- Se não houver `tagFilter`, não adiciona nada (comportamento "Full" padrão).
- Isso garante que o filtro global tenha prioridade e sobreviva à navegação.

### 2. Correção do overview "Todas"

- Quando `team === "Todas"`, `getOverview` deve executar queries agregadas únicas sobre toda a base, filtrando apenas por `tagFilter`.
- Remove a iteração por `TEAM_NAMES` para o caso "Todas".
- Mantém o comportamento por time individual quando um time específico é selecionado.

### 3. Aplicar tagFilter em SLA e Squads

- `getAllTeamsData` recebe `tagFilter` opcional.
- `slaQueryOptions` e `squadsQueryOptions` passam `tagFilter`.
- As rotas `/sla` e `/squads` leem `tagFilter` da URL.

### 4. Paginação em Vulnerabilidades e Ativos

- Adicionar `page` e `pageSize` nos search params.
- `getQids` e `getAssets` retornam `{ rows, total, page, pageSize }`.
- UI exibe controles de paginação simples (anterior/próximo + total de páginas).
- Page size padrão: 50 (balanceia velocidade e usabilidade).

### 5. Correção do agrupamento de Ativos

- `getAssets` agrupa por `a."QG_HostID"` em vez de `IP/DNS/OS/team`.
- O time exibido continua vindo de `extractTeamExpr()`.

### 6. Otimização de queries

- `getOverview` (caso "Todas"): 4 queries únicas (KPIs, severidade, SLA, raw/actions) em vez de 148.
- `getAllTeamsData`: 4 queries únicas agregadas por time, filtradas por `tagFilter`, em vez de 148.
- `getTeamData` por time específico continua com 4 queries (caso de uso menor).

## Arquivos tocados

- `src/components/Shell.tsx`
- `src/server/queries.server.ts`
- `src/lib/sla-data.ts`
- `src/lib/data.fn.ts`
- `src/routes/index.tsx`
- `src/routes/vulnerabilidades.tsx`
- `src/routes/ativos.tsx`
- `src/routes/sla.tsx`
- `src/routes/squads.tsx`
- `src/routes/relatorios.tsx` (paginação, se aplicável)

## Critérios de sucesso

- Filtro On-Prem persiste ao navegar entre todas as páginas.
- Overview "Todas" + On-Prem mostra 13.625 vulns / 47 ativos (condizente com o banco).
- SLA e Squads reagem ao filtro de ambiente.
- Vulnerabilidades e Ativos mostram paginação funcional.
- Tempos de carga do overview e squads reduzidos drasticamente.
- Nenhum `as any`, `@ts-ignore` ou teste deletado.
