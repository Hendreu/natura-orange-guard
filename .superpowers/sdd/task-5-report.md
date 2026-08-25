# Task 5 — Add home link card

## Status

**COMPLETED.** Build passes with no TypeScript errors.

## Files Changed

- `src/routes/index.tsx` — modified the four-card `StatSlab` section:
  - Changed grid class from `lg:grid-cols-4` to `lg:grid-cols-5` on line 201.
  - Added a fifth `<StatSlab />` after the existing four, with the exact JSX from the brief:
    ```tsx
    <StatSlab
      label="Inventário de vulns"
      value={data.kpis.vulns}
      trend={data.trends["vulns"]}
      action="ver tabela"
      onClick={() => navigate({ to: "/vulnerabilidades" })}
    />
    ```

`useNavigate` was already imported on line 2 and already destructured as `navigate` on line 63, so no import changes were needed.

## Commands Run

### `bun run build`

Output: build succeeded (client + SSR + nitro stages all reported `✓ built`):

- Client: `✓ built in 2.75s`
- SSR: `✓ built in 1.22s`
- Nitro: `✓ built in 2.20s`

No TypeScript diagnostics, no module errors. Pre-existing warnings observed (not introduced by this task):

- `The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively...` — config-time warning only.
- `inlineDynamicImports option is ignored because the codeSplitting option is specified.` — config-time warning only.

## Concerns

None. The change is minimal and matches the brief exactly. One observation worth flagging: the new "Inventário de vulns" card duplicates the `value` and `trend` of the existing accent "Vulnerabilidades" card, but with a different `label`, no `accent`, no `sub`, and a navigation-only `onClick`. That duplication is what the brief specifies — left as-is per scope discipline.

## Branch

Still on `vulnerability-filters`. No commit performed (not requested by brief).
