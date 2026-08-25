# Task 6: Final verification

**Goal:** Ensure the feature builds, passes lint/format, and works visually.

**Commands:**

```bash
bun run lint
bun run format
bun run build
bun dev
```

**Visual QA checklist:**

- Home page loads and the new "Inventário de vulns" card navigates to `/vulnerabilidades`.
- `/vulnerabilidades` shows five top cards with numbers.
- Sidebar filters (severity, category, status) update the table and URL params.
- Search input filters results after debounce.
- "Limpar tudo" resets all filters.
- Table rows expand to show the solution.
- Mobile layout stacks sidebar above table.

**Report file:** `.superpowers/sdd/task-6-report.md`
