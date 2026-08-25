# Design: Filtros e visão de vulnerabilidades

## Objetivo

Adicionar à plataforma uma visão de vulnerabilidades estilo Qualys VMDR — com cards de KPI no topo, filtros rápidos na lateral e uma tabela de vulnerabilidades — sem perder o overview estratégico atual da home.

## Escopo

- **Rota afetada:** `src/routes/vulnerabilidades.tsx` (tela dedicada de vulnerabilidades).
- **Home (`/`):** permanece inalterada em conteúdo, mas ganha um card de acesso rápido para `/vulnerabilidades`.
- **Fora de escopo:** não criar novas tabelas de banco agora, exceto colunas opcionais para CISA KEV/Ransomware no ETL.

## Layout

```
+---------------------------------------------------------+
|  [Total Detections] [CISA KEV] [Ransomware] [Crit Patch] [Critical] |
+---------------------------------------------------------+
|  Filtros        |  Tabela de vulnerabilidades          |
|  - Severity     |                                      |
|  - Category     |  QID | Title | Sev | Status | ...    |
|  - Status       |                                      |
|  - Search       |                                      |
+---------------------------------------------------------+
```

## Filtros rápidos (sidebar)

Cada filtro é uma lista de checkboxes com contagem. Múltiplos valores são combinados com OR dentro da dimensão e AND entre dimensões.

| Filtro   | Fonte de dados                     | Valores padrão                                  |
| -------- | ---------------------------------- | ----------------------------------------------- |
| Severity | `vulnerabilities.Severity`         | Crítica, Alta, Média, Baixa                     |
| Category | `kb_summary.category`              | Top 10 categorias + "Outros"                    |
| Status   | `vulnerabilities.Status`           | Ativa, Nova, Reaberta (Fixed oculto por padrão) |
| Search   | `v.QID`, `kb.title`, `kb.category` | texto livre                                     |

## Cards de KPI

| Card               | Regra                                      | Observação                                            |
| ------------------ | ------------------------------------------ | ----------------------------------------------------- |
| Total Detections   | COUNT(*) do conjunto filtrado              | atualiza com filtros                                  |
| Critical Vulns     | COUNT(*) WHERE severity = 5                | -                                                     |
| Critical Patchable | severity = 5 AND `kb.solution IS NOT NULL` | "patchable" = tem solução cadastrada                  |
| CISA KEV           | COUNT(*) WHERE `kb.cisa_kev = true`        | coluna inexistente hoje; default 0 até enriquecimento |
| Ransomware Vulns   | COUNT(*) WHERE `kb.ransomware = true`      | coluna inexistente hoje; default 0 até enriquecimento |

## Tabela principal

Agrupada por QID para evitar milhões de linhas:

| Coluna          | Fonte                                 |
| --------------- | ------------------------------------- |
| QID             | `v.QID`                               |
| Título          | `kb.title`                            |
| Severidade      | `severityLabelExpr()`                 |
| Status          | `v.Status`                            |
| Categoria       | `kb.category`                         |
| Ativos afetados | COUNT(DISTINCT v.QG_HostID)           |
| Idade média     | AVG(ageExpr())                        |
| Solução         | `kb.solution` (ícone/check se existe) |

## Queries

- `getQids({ sev, team, q, tagFilter, categories, statuses })` recebe os novos filtros.
- `getVulnerabilityStats({ team, tagFilter, categories, statuses, q })` retorna os 5 KPIs respeitando os filtros ativos.
- Caminho rápido sem filtros: continua usando `mv_top_qids`.
- Caminho com filtros: query ao vivo com `assetCteSql()` + joins `vulnerabilities`/`kb_summary`.

## Componentes

- Reaproveitar `StatSlab` pros cards.
- Criar `FilterGroup` (shadcn Checkbox + contagem + "limpar").
- Reaproveitar padrão de tabela das rotas `/ativos` e `/relatorios`.

## Gaps de dados e tratamento

1. **CISA KEV / Ransomware:** não existem nas tabelas. O ETL será atualizado para aceitar colunas `cisa_kev` e `ransomware` opcionais no `KnowledgeBase`/`kb_summary`, mas enquanto não houver fonte os cards exibem `0` com tooltip "pendente de fonte de dados".
2. **Status do print (Information, Disabled, Ignored, Patch Superseded):** não existem no banco. Usamos os status reais: Active → Ativa, New → Nova, Re-Opened → Reaberta, Fixed → Corrigida. Se futuramente esses outros status chegarem, basta adicionar ao mapeamento.
3. **Patchable:** derivado de `solution IS NOT NULL`.

## Estado e URL

- Os filtros são controlados por search params da rota (`sev`, `cat`, `status`, `q`).
- `setParam` / `removeParam` igual ao padrão já usado em `vulnerabilidades.tsx`.
- Chips de filtros ativos com botão "Limpar tudo".

## Próximos passos pós-aprovação

1. Atualizar `src/server/queries.server.ts` com filtros e stats.
2. Atualizar `src/lib/data.fn.ts` e `src/lib/sla-data.ts` com novos server functions e query options.
3. Atualizar `src/routes/vulnerabilidades.tsx` com novo layout, filtros e tabela.
4. Adicionar card de acesso na home.
5. Atualizar ETL pra colunas `cisa_kev`/`ransomware` (opcional, pode ser feito depois).
