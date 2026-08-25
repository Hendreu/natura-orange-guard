# Renomear rótulos do filtro de ambiente

## Contexto

A aplicação Natura SecOps possui um filtro global de ambiente (`Ambiente`), renderizado no header via `<TagFilter />`, que afeta as consultas das páginas Visão geral, Vulnerabilidades, Ativos e Relatórios.

As opções atuais são:

- `Full`
- `Full Cloud`
- `Full On-Premise`

O usuário solicitou rótulos mais diretos: `All Clouds` para tudo que envolve cloud e `On-Prem` para tudo que não é cloud. A lógica de filtro já existe no servidor; a mudança é estritamente de apresentação.

## Decisões

- Manter o componente como dropdown no header.
- Manter os valores internos (`full`, `full-cloud`, `full-on-premise`) para não quebrar schemas Zod, validações de rota, queries SQL e URLs.
- Alterar apenas os rótulos visíveis no dropdown.

## Mudança

Arquivo: `src/lib/constants.ts`

```ts
export const TAG_FILTER_OPTIONS = [
  { value: "full", label: "Full" },
  { value: "full-cloud", label: "All Clouds" },
  { value: "full-on-premise", label: "On-Prem" },
] as const;
```

## Comportamento

| Rótulo selecionado | Filtro SQL aplicado (já existente)                 | Significado                                            |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------ |
| `Full`             | nenhum                                             | Todos os ativos                                        |
| `All Clouds`       | `a."Tags" ILIKE '%cloud%'`                         | Qualquer tag que contenha "cloud"                      |
| `On-Prem`          | `a."Tags" IS NULL OR a."Tags" NOT ILIKE '%cloud%'` | Qualquer tag que não contenha "cloud", incluindo nulas |

## Escopo

- Apenas `src/lib/constants.ts`.
- Nenhuma mudança em `src/server/queries.server.ts`, `src/lib/data.fn.ts`, rotas, schemas ou componentes.

## Validação

1. Abrir a aplicação.
2. Verificar que o dropdown `Ambiente` exibe `Full`, `All Clouds` e `On-Prem`.
3. Selecionar `All Clouds` e confirmar que os resultados são filtrados para tags com "cloud".
4. Selecionar `On-Prem` e confirmar que os resultados excluem tags com "cloud".
5. Verificar que URLs com `?tagFilter=full-cloud` e `?tagFilter=full-on-premise` continuam funcionando.
