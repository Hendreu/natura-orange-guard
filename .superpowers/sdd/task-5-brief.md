# Task 5: Add home link card

**Goal:** Add a card on the home page that links to `/vulnerabilidades`.

**Files to modify:**

- `src/routes/index.tsx`

**Changes:**

1. `useNavigate` is already imported. Use it in the component.

2. Find the section with the four `StatSlab` cards (Vulnerabilidades, QIDs únicos, Ativos distintos, Frentes ativas). Change the grid class from `lg:grid-cols-4` to `lg:grid-cols-5` and add a fifth card:

```tsx
<StatSlab
  label="Inventário de vulns"
  value={data.kpis.vulns}
  trend={data.trends["vulns"]}
  action="ver tabela"
  onClick={() => navigate({ to: "/vulnerabilidades" })}
/>
```

**Verification:**

- Run `bun run build`.
- Run `bun dev`, open home, click the new card, and confirm navigation to `/vulnerabilidades`.

**Report file:** `.superpowers/sdd/task-5-report.md`
