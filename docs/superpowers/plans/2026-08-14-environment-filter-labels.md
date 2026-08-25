# Renomear rótulos do filtro de ambiente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar os rótulos visíveis do dropdown `Ambiente` para `Full`, `All Clouds` e `On-Prem`, mantendo a lógica de filtro existente.

**Architecture:** Mudança estritamente de apresentação. Os valores internos (`full`, `full-cloud`, `full-on-premise`) permanecem inalterados para preservar schemas Zod, validações de rota, queries SQL e URLs. Apenas o array `TAG_FILTER_OPTIONS` em `src/lib/constants.ts` é atualizado.

**Tech Stack:** TypeScript, React, TanStack Start, Bun.

## Global Constraints

- Não alterar valores internos do filtro (`full`, `full-cloud`, `full-on-premise`).
- Não modificar schemas Zod, queries SQL, rotas ou componentes.
- Preservar compatibilidade com URLs e bookmarks existentes.
- Seguir o estilo existente do arquivo (`export const ... as const`).

---

### Task 1: Atualizar rótulos do filtro de ambiente

**Files:**

- Modify: `src/lib/constants.ts:68-72`

**Interfaces:**

- Consumes: nenhum.
- Produces: `TAG_FILTER_OPTIONS` com rótulos atualizados.

- [ ] **Step 1: Abrir `src/lib/constants.ts` e localizar `TAG_FILTER_OPTIONS`**

  O array atual está nas linhas 68-72:

  ```ts
  export const TAG_FILTER_OPTIONS = [
    { value: "full", label: "Full" },
    { value: "full-cloud", label: "Full Cloud" },
    { value: "full-on-premise", label: "Full On-Premise" },
  ] as const;
  ```

- [ ] **Step 2: Alterar os rótulos para `All Clouds` e `On-Prem`**

  ```ts
  export const TAG_FILTER_OPTIONS = [
    { value: "full", label: "Full" },
    { value: "full-cloud", label: "All Clouds" },
    { value: "full-on-premise", label: "On-Prem" },
  ] as const;
  ```

- [ ] **Step 3: Verificar lint e formatação**

  Run: `bun run lint`
  Expected: exit 0, sem erros.

  Run: `bun run format`
  Expected: nenhuma mudança (ou apenas formatação idempotente).

- [ ] **Step 4: Verificação manual no navegador**

  Run: `bun dev`
  Ações:
  1. Acessar a aplicação.
  2. Verificar que o dropdown `Ambiente` no header exibe `Full`, `All Clouds` e `On-Prem`.
  3. Selecionar `All Clouds` e confirmar que a URL mantém `?tagFilter=full-cloud` e os resultados são filtrados para cloud.
  4. Selecionar `On-Prem` e confirmar que a URL mantém `?tagFilter=full-on-premise` e os resultados excluem cloud.
  5. Selecionar `Full` e confirmar que o parâmetro `tagFilter` desaparece da URL.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/constants.ts docs/superpowers/specs/2026-08-14-environment-filter-labels-design.md docs/superpowers/plans/2026-08-14-environment-filter-labels.md
  git commit -m "feat(ui): rename environment filter labels to Full / All Clouds / On-Prem"
  ```
