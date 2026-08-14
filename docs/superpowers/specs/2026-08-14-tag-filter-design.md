# Design: Filtro Global de Tags (Cloud / On-Premises)

## Objetivo
Adicionar um filtro global por tag nas páginas Dashboard, Ativos, Vulnerabilidades e Relatórios, permitindo alternar entre:

- `full` — mostra todos os ativos.
- `full-cloud` — mostra apenas ativos cuja coluna `Tags` contenha a palavra `cloud` (case-insensitive).
- `full-on-premise` — mostra apenas ativos cuja coluna `Tags` **não** contenha `cloud`.

## Regra de classificação

A classificação é feita diretamente sobre a coluna `Tags` do banco de dados:

```text
Tags contém "cloud" (ignorando maiúsculas/minúsculas)  -> cloud
Caso contrário                                         -> onpremises
```

Exemplos:
- `Times:Cloud AWS|...` -> cloud
- `Times:OnPrem|...` -> onpremises
- `Times:Azure Cloud|...` -> cloud

## Abordagem escolhida

**Filtro global via URL (`?tagFilter=full|full-cloud|full-on-premise`).**

Motivos:
- Funciona em todas as páginas sem precisar de estado global complexo.
- Persiste ao navegar entre páginas e ao recarregar.
- Permite compartilhar URLs com filtro aplicado.
- Queries server-side recebem o filtro, então totais e listas refletem a seleção.

## Componente de UI

Um seletor simples (dropdown ou grupo de tabs) será adicionado no layout superior, provavelmente em `src/routes/__root.tsx` ou em um componente de header compartilhado.

Opções exibidas:
- `Full`
- `Full Cloud`
- `Full On-Premise`

O valor selecionado sincroniza com o query param `tagFilter`.

## Páginas afetadas

- `src/routes/index.tsx` (Dashboard)
- `src/routes/ativos.tsx`
- `src/routes/vulnerabilidades.tsx`
- `src/routes/relatorios.tsx`

Cada página:
1. Lê `tagFilter` da URL.
2. Repassa o valor para sua query server-side.
3. A query aplica a condição SQL correspondente na coluna `Tags`.

## Queries server-side

As queries em `src/server/queries.server.ts` receberão um parâmetro opcional `tagFilter`. A condição SQL gerada será:

- `full-cloud`: `LOWER(a."Tags") LIKE '%cloud%'`
- `full-on-premise`: `LOWER(a."Tags") NOT LIKE '%cloud%' OR a."Tags" IS NULL`
- `full`: sem condição adicional

## Escopo fora desta tarefa

- Não alterar a estrutura da coluna `Tags`.
- Não adicionar novas tabelas ou migrations.
- Não modificar regras de negócio existentes fora do filtro.
