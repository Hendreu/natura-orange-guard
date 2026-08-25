# Server — Agent Notes

## OVERVIEW

Single server-only module: `queries.server.ts`. All Postgres reads for the dashboard live here. Imported only through dynamic `import()` from `src/lib/data.fn.ts` so the `postgres` client never reaches the client bundle.

## WHERE TO LOOK

| File | Role |
|---|---|
| `queries.server.ts` | SQL queries against `mv_*` materialized views (with fallback CTEs) |

## CONVENTIONS

- File suffix must be `.server.ts` to satisfy the server-only rule.
- Prefer materialized views (`mv_*`); fall back to CTE scans when views are absent.
- Each export returns a typed payload matching the types in `src/lib/sla-data.ts`.
- `scripts/refresh-views.ts` refreshes every `mv_*` view; run after ETL or schema changes.

## ANTI-PATTERNS

- Do not import this file from client components or non-server modules.
- Do not add HTTP routes here — TanStack Start `createServerFn` in `src/lib/data.fn.ts` is the only public API surface.
- Do not run heavy migrations or writes here; this module is read-only for the dashboard.
