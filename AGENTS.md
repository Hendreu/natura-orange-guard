<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Natura Security Hub — Agent Notes

## Project type

TanStack Start + React 19 + Vite app, bootstrapped through Lovable. Not a plain Vite SPA — it has server-side route loaders and a custom SSR entry.

## Package manager

Use **Bun**. The repo ships `bun.lock` and `bunfig.toml`. `package-lock.json` exists but the lock of record is `bun.lock`.

- `bun install`
- `bun dev` (alias for `vite dev`)
- `bun run build`
- `bun run lint`
- `bun run format`

## Vite config — do not duplicate plugins

`vite.config.ts` imports from `@lovable.dev/vite-tanstack-config`. That preset already includes TanStack Start, React, Tailwind CSS v4, `tsconfigPaths`, Nitro, env injection, and the `@/*` alias. Do **not** add those plugins manually or the build will fail from duplicates.

If you need extra Vite options, pass them inside `defineConfig({ vite: { ... } })`.

## Server entry

`src/server.ts` is the SSR fetch wrapper registered in `vite.config.ts` (`tanstackStart.server.entry: "server"`). It catches h3-swallowed catastrophic errors and renders a fallback error page. Route server code through TanStack Start conventions, not this file.

## Routing

Routes live in `src/routes/` and are file-based via TanStack Router. `src/routeTree.gen.ts` is generated — do not hand-edit it; it updates when the dev server is running or on `bun dev`.

## Database

Server-only Postgres via the `postgres` package. `src/lib/db.ts` expects `DATABASE_URL` and throws at import time if it is missing. Copy `.env.example` to `.env` and set a real URL before running any server function or build that executes server code.

This client is server-only — import it only from route loaders, server functions, or `*.server.ts` modules.

## Styling

- Tailwind CSS v4 with the new `@theme` / `@import "tailwindcss"` syntax in `src/styles.css`.
- Custom theme tokens (`--background`, `--primary`, `--critica`, etc.) and custom utilities (`slab`, `slab-signal`, `stencil`, `tappable`) are defined there.
- shadcn/ui "new-york" style, non-RSC. Components are in `src/components/ui/`.
- Design system reference: `DESIGN.md`.

## Path alias

`@/*` maps to `./src/*` in both `tsconfig.json` and Vite. Use it for all internal imports.

## Lint / format

- ESLint: `eslint .` — note the rule that forbids importing `server-only`; use `*.server.ts` or `@tanstack/react-start/server-only` instead.
- Prettier: `prettier --write .` — config is in `.prettierrc`.
- No separate typecheck script; rely on the TypeScript editor and build. `skipLibCheck` is enabled and unused-vars checks are off in ESLint.

## Static data

`src/data/` contains JSON fixtures (`assets.json`, `qids.json`, `teams.json`) and derived helpers (`src/lib/sla-data.ts`, `src/lib/data.fn.ts`). Treat these as the current source of truth for demo/seed data unless a loader explicitly pulls from Postgres.
