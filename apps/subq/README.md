# subq

Health tracking app (weight, injections, schedules, goals) on Cloudflare
Workers. Single deployable: an Effect RPC worker serving `/rpc`, better-auth
under `/api/auth/*`, and a foldkit SPA (TEA on Effect, hyperscript views, no
React) via Workers Assets.

## Layout

- `src/worker.ts` — Alchemy Effect-native Worker: D1 binding, better-auth, RPC
  server (`RpcServer.toHttpEffect`), route dispatch.
- `src/shared/` — schemas, domain logic, and RPC definitions shared between
  worker and web (imported as `#shared`).
- `src/<domain>/` — repos, services, and RPC handlers per domain.
- `web/` — foldkit SPA (single Model/update/view, pages under `web/src/page/`,
  declarative SVG charts under `web/src/chart/`, Story tests in `web/test/`).
  The vite dev server proxies `/rpc` and `/api` to the deployed worker.
- `drizzle/` — drizzle-kit SQL migrations, applied at deploy time by the Alchemy
  D1 resource (tracked in `drizzle_migrations`).
- `alchemy.run.ts` — Alchemy v2 stack (Worker + D1 + assets).

## Deploy

One-time setup:

1. `bunx alchemy login` (Cloudflare OAuth or API token).
2. Create `.env` in this directory (gitignored):
   - `BETTER_AUTH_SECRET` — generate with `openssl rand -base64 32`.
   - `BETTER_AUTH_URL` — the public URL of the deployment (workers.dev URL until
     the custom-domain cutover).

Then:

```sh
bun run deploy   # vite build + alchemy deploy
```

## Local dev

```sh
bun run dev       # worker via alchemy dev (:1337)
bun run dev:web   # vite dev server (:5173, proxies API to :1337)
```

Note: `alchemy dev` runs the worker locally in workerd but provisions real
Cloudflare resources (including D1) for the dev stage — it needs `alchemy login`
too.

## Notes

- The D1 driver has no transactions, so data import
  (`src/data-export/data-export-service.ts`) is not atomic.
- Tests run against in-memory SQLite (`bun --bun vitest run`); production uses
  D1 through the same `SqlClient` interface. Frontend update logic is tested
  with foldkit Story simulations (happy-dom).
