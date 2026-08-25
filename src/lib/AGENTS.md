# Lib — Agent Notes

## OVERVIEW

Client-side data layer and shared utilities. `sla-data.ts` defines React Query options and result types; `data.fn.ts` exposes the server-function surface; `db.ts` is the server-only Postgres client.

## WHERE TO LOOK

| File | Role |
|---|---|
| `sla-data.ts` | React Query `queryOptions`, result types, `fmt()` formatter, severity tokens |
| `data.fn.ts` | `createServerFn({ method: "GET" })` wrappers; each dynamically imports `../server/queries.server.ts` |
| `constants.ts` | `TEAM_NAMES`, `SEVERITY_ORDER`, `TAG_FILTER_OPTIONS`, SLA thresholds |
| `db.ts` | `postgres` client; throws if `DATABASE_URL` is missing |
| `utils.ts` | `cn()` — `clsx` + `tailwind-merge` |
| `error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts` | SSR error handling + Lovable telemetry |

## CONVENTIONS

- `*QueryOptions` helpers live here; route components import them and call `useQuery`.
- Server functions validate input with zod, then delegate to `../server/queries.server.ts`.
- `db.ts` must never be imported from client components or non-server modules.
- Constants are `UPPER_SNAKE_CASE`; types are PascalCase and co-located with their domain.

## ANTI-PATTERNS

- Do not import `server-only` (Next.js package); use `*.server.ts` or `@tanstack/react-start/server-only`.
- Do not import `db.ts` from route components or other client code.
- Do not add DB queries here — keep SQL in `src/server/queries.server.ts`.
