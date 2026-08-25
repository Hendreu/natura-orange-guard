# Repaginada da página Vulnerabilidades

## Objetivo
Melhorar o agrupamento e a clareza dos filtros na página `/vulnerabilidades`, removendo a duplicação entre chips no topo e painel lateral, e deixando a tabela com mais destaque.

## Alterações

### 1. Topo — só KPIs
- Manter os 5 cards: Total Detections, Critical Vulns, Critical Patchable, CISA KEV, Ransomware.
- Card "Total Detections" ocupa 2 colunas em telas grandes (`lg:col-span-2`) para dar hierarquia.
- Remover as fileiras de chips de Severidade e Categoria que hoje ficam abaixo dos KPIs.

### 2. Painel lateral de filtros
Todos os filtros ficam no aside de 260px, organizados em grupos visuais:
- **Busca** — input com ícone de lupa.
- **Squad** — select.
- **Severidade** — chips coloridas com contador, single-select, usando `FilterChip` e `severityToken`.
- **Categoria** — chips multi-select com contador, usando `FilterChip`.
- **Status** — chips multi-select com contador, usando `FilterChip`.
- **Ação** — botão "Limpar tudo".

### 3. Resumo de filtros ativos
- Acima da tabela, exibir tags dos filtros aplicados (severidade, categorias, statuses).
- Cada tag tem um botão de remover (`×`) que limpa aquele filtro.
- O resumo evita que o usuário perca de vista o que está filtrado quando o painel lateral rola.

### 4. Tabela
- Cabeçalho sticky dentro do card.
- Mantém expansão de linha para mostrar frente e solução.
- Badge de severidade com canto cortado (`corner-cut`).

## Fora de escopo
- Drawer mobile: o usuário informou que não será usado no celular.
- Novas rotas ou mudanças na lógica de dados: continua usando `qidsQueryOptions` e `vulnerabilityStatsQueryOptions`.

## Arquivos
- `src/routes/vulnerabilidades.tsx` — único arquivo alterado.

## Estilo
- Manter tokens e utilitários do `DESIGN.md`: `slab`, `stencil`, `corner-cut`, cores de severidade, tipografia mono/display.
