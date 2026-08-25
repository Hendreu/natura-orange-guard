# Routes — Agent Notes

## OVERVIEW

File-based TanStack Router pages under `src/routes/`. `src/routeTree.gen.ts` is generated from these files; do not hand-edit it.

## WHERE TO LOOK

| URL | File | Purpose |
|---|---|---|
| `/` | `index.tsx` | Home overview |
| `/ativos` | `ativos.tsx` | Assets inventory |
| `/hardening` | `hardening.tsx` | Cloud hardening posture |
| `/relatorios` | `relatorios.tsx` | Compliance reports |
| `/sla` | `sla.tsx` | SLA adherence by squad |
| `/squads` | `squads.tsx` | Squad ranking |
| `/vulnerabilidades` | `vulnerabilidades.tsx` | Vulnerability backlog |
| (root shell) | `__root.tsx` | HTML shell, QueryClientProvider, meta, 404/error boundaries |

## CONVENTIONS

- Routes are **default-export-free**; export `Route` from `createFileRoute`.
- Data is fetched **in-component** via `useQuery` + helpers in `src/lib/sla-data.ts`. No `loader` / `beforeLoad` is used.
- Search params are validated with `validateSearch` (zod or manual narrowing).
- `src/routes/README.md` has the full routing cheat sheet.

## ANTI-PATTERNS

- Do not create `src/pages/`, `src/routes/_app/index.tsx`, or `app/layout.tsx`.
- Do not edit `src/routeTree.gen.ts`; regenerate with `bun dev`.
- Do not remove `<Outlet />` from `__root.tsx`.
- Splat routes read `_splat`, never `*`.
