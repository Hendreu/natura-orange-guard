# Vulnerabilidades Repaginada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize `/vulnerabilidades` so all filters live in a single sidebar, remove duplicated top chips, and add active-filter tags above the table.

**Architecture:** Single-route refactor in `src/routes/vulnerabilidades.tsx`. Keeps existing data hooks (`qidsQueryOptions`, `vulnerabilityStatsQueryOptions`) and state helpers. Reuses `StatSlab`, `FilterChip`, and `FilterGroup` primitives.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Tailwind CSS v4, shadcn/ui Select.

## Global Constraints
- Keep styling aligned with `DESIGN.md`: `slab`, `stencil`, `corner-cut`, severity tokens.
- No new dependencies.
- Mobile drawer is out of scope per user.
- Run `bun run build` and `npx eslint src/routes/vulnerabilidades.tsx` clean before finishing.

---

### Task 1: KPI layout and remove top chip rows

**Files:**
- Modify: `src/routes/vulnerabilidades.tsx:171-223`

**Interfaces:**
- Consumes: existing `stats` object and `StatSlab` component.
- Produces: updated KPI grid and removal of top severity/category chip sections.

- [ ] **Step 1: Update KPI grid so Total Detections spans 2 columns**

```tsx
<section className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
  <StatSlab label="Total Detections" value={stats?.total ?? 0} accent className="lg:col-span-2" />
  <StatSlab label="Critical Vulns" value={stats?.critical ?? 0} />
  <StatSlab label="Critical Patchable" value={stats?.criticalPatchable ?? 0} />
  <StatSlab label="CISA KEV" value={stats?.cisaKev ?? 0} />
  <StatSlab label="Ransomware" value={stats?.ransomware ?? 0} />
</section>
```

- Note: `StatSlab` currently does not accept `className`; if this requires a change, add an optional `className` prop in Task 2 instead.

- [ ] **Step 2: Delete the entire `<section className="mb-4 space-y-3">` block that contains the Severidade and Categoria chip rows.**

- [ ] **Step 3: Run lint on the file and fix prettier issues.**

Run: `npx eslint src/routes/vulnerabilidades.tsx --fix`

---

### Task 2: Make StatSlab accept className

**Files:**
- Modify: `src/components/StatSlab.tsx`

**Interfaces:**
- Consumes: existing `StatSlab` props.
- Produces: `StatSlab` accepts an optional `className` string merged with its card classes.

- [ ] **Step 1: Add className prop and merge it**

```tsx
export function StatSlab({
  label,
  value,
  trend,
  sub,
  accent = false,
  invertTrend = false,
  onClick,
  action,
  className,
}: {
  label: string;
  value: number | string;
  trend?: Trend | undefined;
  sub?: React.ReactNode | undefined;
  accent?: boolean | undefined;
  invertTrend?: boolean | undefined;
  onClick?: (() => void) | undefined;
  action?: string | undefined;
  className?: string | undefined;
}) {
```

```tsx
  const cls = cn(
    accent ? "slab-signal" : "slab",
    "corner-cut p-4",
    className,
  );
```

- [ ] **Step 2: Run lint and build to confirm no regression.**

Run: `npx eslint src/components/StatSlab.tsx --fix && cmd /c "bun run build"`

---

### Task 3: Restructure sidebar filter groups

**Files:**
- Modify: `src/routes/vulnerabilidades.tsx:225-294`

**Interfaces:**
- Consumes: `sev`, `team`, `categories`, `statuses`, `qInput`, helpers `setParam`, `setCategories`, `setStatuses`, `setQInput`, `severityOrder`, `severityToken`, `teamNames`, `stats`, `categoryOptions`, `statusOptions`.
- Produces: a single `<aside>` with grouped filters.

- [ ] **Step 1: Replace the aside content with grouped sections**

```tsx
<aside className="slab space-y-6 p-4">
  <div>
    <span className="stencil mb-2 block text-[10px] text-muted-foreground">Busca</span>
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
        placeholder="QID, título ou categoria..."
        className="h-9 w-full rounded-md border border-border bg-input pr-3 pl-9 text-xs text-foreground outline-none focus:border-primary"
      />
    </div>
  </div>

  <div>
    <span className="stencil mb-2 block text-[10px] text-muted-foreground">Squad</span>
    <Select value={team} onValueChange={(v) => setParam("team", v)}>
      <SelectTrigger className="h-9 w-full border-border bg-input text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {["Todas", "All Cloud", "All On-Prem", ...teamNames].map((t) => (
          <SelectItem key={t} value={t} className="text-xs">
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>

  <div>
    <span className="stencil mb-2 block text-[10px] text-muted-foreground">Severidade</span>
    <div className="flex flex-wrap gap-2">
      {severityOrder.map((s) => {
        const count = stats?.bySeverity[s] ?? 0;
        const active = sev === s;
        return (
          <FilterChip
            key={s}
            label={s}
            count={count}
            active={active}
            color={severityToken[s]}
            onClick={() => setParam("sev", active ? "" : s)}
          />
        );
      })}
    </div>
  </div>

  <div>
    <span className="stencil mb-2 block text-[10px] text-muted-foreground">Categoria</span>
    <div className="flex flex-wrap gap-2">
      {categoryOptions.map(({ value, count }) => {
        const active = categories.includes(value);
        return (
          <FilterChip
            key={value}
            label={value}
            count={count}
            active={active}
            onClick={() => {
              const next = active ? categories.filter((c) => c !== value) : [...categories, value];
              setCategories(next);
            }}
          />
        );
      })}
    </div>
  </div>

  <div>
    <span className="stencil mb-2 block text-[10px] text-muted-foreground">Status</span>
    <div className="flex flex-wrap gap-2">
      {statusOptions.map(({ value, label, count }) => {
        const active = statuses.includes(value);
        return (
          <FilterChip
            key={value}
            label={label}
            count={count}
            active={active}
            onClick={() => {
              const next = active ? statuses.filter((s) => s !== value) : [...statuses, value];
              setStatuses(next);
            }}
          />
        );
      })}
    </div>
  </div>

  <button
    onClick={() =>
      navigate({
        search: () => ({
          q: undefined,
          sev: undefined,
          team: undefined,
          tagFilter: undefined,
          categories: undefined,
          statuses: undefined,
        }),
      })
    }
    className="stencil w-full border border-border px-3 py-2 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
  >
    Limpar tudo
  </button>
</aside>
```

- [ ] **Step 2: Remove unused `FilterGroup` import if it is no longer used elsewhere in the file.**

- [ ] **Step 3: Run lint and fix formatting.**

Run: `npx eslint src/routes/vulnerabilidades.tsx --fix`

---

### Task 4: Active filter tags above the table

**Files:**
- Modify: `src/routes/vulnerabilidades.tsx` between sidebar grid and table card.

**Interfaces:**
- Consumes: `sev`, `team`, `categories`, `statuses`, `tagFilter`, helpers `setParam`, `setCategories`, `setStatuses`, `statusLabel`, `severityToken`.
- Produces: a row of removable tags inside the table card header area.

- [ ] **Step 1: Compute `activeFilters` memo above the return**

```tsx
const activeFilters = useMemo(() => {
  const filters: { key: string; param: keyof VulnSearch; value: string; label: string }[] = [];
  if (sev && sev !== "Todas") filters.push({ key: `sev-${sev}`, param: "sev", value: "", label: sev });
  if (team && team !== "Todas") filters.push({ key: `team-${team}`, param: "team", value: "", label: team });
  categories.forEach((c) => filters.push({ key: `cat-${c}`, param: "categories", value: c, label: c }));
  statuses.forEach((s) => filters.push({ key: `status-${s}`, param: "statuses", value: s, label: statusLabel[s] ?? s }));
  return filters;
}, [sev, team, categories, statuses]);
```

- [ ] **Step 2: Render tags above the table inside the table card**

Insert after `<div className="slab overflow-x-auto">` opening and before `<table>`:

```tsx
{activeFilters.length > 0 && (
  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
    <span className="stencil text-[10px] text-muted-foreground">Filtros:</span>
    {activeFilters.map((f) => (
      <button
        key={f.key}
        onClick={() => {
          if (f.param === "categories") setCategories(categories.filter((c) => c !== f.value));
          if (f.param === "statuses") setStatuses(statuses.filter((s) => s !== f.value));
          if (f.param === "sev") setParam("sev", "");
          if (f.param === "team") setParam("team", "");
        }}
        className="stencil inline-flex items-center gap-1 rounded-sm border border-border bg-secondary px-2 py-1 text-[10px] text-foreground hover:border-primary"
      >
        {f.label}
        <span className="text-muted-foreground">×</span>
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 3: Run lint and fix formatting.**

Run: `npx eslint src/routes/vulnerabilidades.tsx --fix`

---

### Task 5: Verify and capture screenshot

**Files:**
- None (verification only).

- [ ] **Step 1: Run production build**

Run: `cmd /c "bun run build"`
Expected: exits 0.

- [ ] **Step 2: Run ESLint on changed files**

Run: `npx eslint src/routes/vulnerabilidades.tsx src/components/StatSlab.tsx`
Expected: no output / no errors.

- [ ] **Step 3: Capture screenshot of `/vulnerabilidades` via Playwright**

Save to `vulnerabilidades-repaginada.png` in the workspace root.
Confirm the page shows: KPIs, sidebar filters grouped, active-filter tags when a filter is selected, and table.
