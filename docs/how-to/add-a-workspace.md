# How to add a workspace

Start with ownership, not a directory template. CI discovers `packages/*` and `apps/*` through `bun run --filter '*'`; there is no central workspace registry.

## 1. Choose the delivery boundary

| Need | Preferred shape |
| --- | --- |
| Conventional HTTP API with a trustworthy schema | Import the API into Executor; do not add Garage code. |
| XML, query-RPC, session, process, or multi-request protocol needing a typed adapter | Integration package under `packages/<svc>` plus tools in the consolidated `apps/garage-mcp`. |
| Reusable code without an executable | Shared package under `packages/<name>`. |
| Independently deployed worker, application, or web UI | Application under `apps/<name>`. |

Use a separate MCP process only when credentials, network placement, host authority, resources, or lifecycle require stronger isolation than the consolidated Garage MCP service.

## 2. Create an integration package when earned

```sh
mkdir -p packages/<svc>/src packages/<svc>/test
```

Copy manifests and configuration from a current integration package such as `packages/autocaliweb` or `packages/sabnzbd`, then use the exact Effect version pinned in current manifests.

Use these responsibilities as needed:

- `model.ts` — public decoded domain schemas and types.
- `api-schema.ts` — codecs for upstream wire payloads.
- `errors.ts` — package-owned tagged errors.
- `services.ts` — API/configuration authority seams.
- `http.ts`, `process.ts`, or another adapter — sole owner of external I/O.
- `operations.ts` — domain Effects requiring the narrow API service.
- `index.ts` — public barrel imported by Garage MCP.

Keep platform requirements visible. Live adapters remain unsealed so tests can provide recording HTTP or process infrastructure. Cross-workspace imports use `@garage/<pkg>`.

## 3. Add tools to Garage MCP

Create `apps/garage-mcp/src/tools/<svc>.ts` and keep it thin. It owns:

- service-prefixed MCP names;
- bounded input schemas;
- truthful read-only, destructive, idempotent, and open-world annotations;
- declared safe failures and credential-free error mapping;
- delegation to integration-package operations.

Merge the toolkit in `apps/garage-mcp/src/server.ts` and provide its live package layer in `apps/garage-mcp/src/main.ts`. Add required environment variables to `apps/garage-mcp/README.md` and the private deployment, never to repository files or logs.

Do not place upstream HTTP/XML/session logic in MCP handlers. Do not expose a generic request tool merely because it is easier than modeling useful operations.

## 4. Test the seams

1. Integration-package adapter tests provide recording infrastructure and assert protocol behavior.
2. MCP handler tests provide a complete local API service and assert delegation, bounds, and safety behavior.
3. MCP HTTP tests prove tool discovery, schemas, annotations, structured results, and credential-free failures.
4. Add a representative live Executor verification after deployment.

## 5. Document ownership

Add or update the package's `CONTEXT.md` and `AGENTS.md`, then register package and MCP adapter paths in `CONTEXT-MAP.md`. Durable cross-context delivery decisions belong in `docs/adr/`.

## 6. Validate

```sh
bun install
bun run --filter '@garage/<workspace>' typecheck
bun run --filter '@garage/<workspace>' test
bun run validate
bun run validate:release
```

Regenerate `bun.nix` whenever `bun.lock` changes. Update shared documentation only when public behavior, vocabulary, or repository policy changes.
