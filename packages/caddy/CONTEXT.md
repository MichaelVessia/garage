# Caddy

## Purpose

This context provides typed inspection and controlled administration of a Caddy instance through its admin API and the `caddy` CLI.

## Ubiquitous language

- **Active config**: the complete JSON configuration currently loaded by Caddy.
- **Server**: a named Caddy HTTP server with listen addresses and routes.
- **Route summary**: a lossy projection of matchers and discovered reverse-proxy targets.
- **Configured upstream**: a `dial` target discovered in route configuration.
- **Runtime upstream**: Caddy's live reverse-proxy health/counter record.
- **Reload**: complete active-config replacement through `/load`, not merely rereading a file.
- **Local CA**: Caddy's `local` PKI authority and certificate material.

## Responsibilities

- Read active JSON configuration, summarize HTTP routes, discover nested reverse-proxy targets, inspect runtime upstream health, and read the local CA.
- Decode a user-supplied JSON object and replace active configuration only after explicit confirmation.
- Own Caddy admin HTTP requests, domain errors, and typed operations.

## Non-responsibilities

- It does not adapt Caddyfiles to JSON, diff candidate and active config, stage changes, or roll back.
- It does not edit individual routes/upstreams or manage certificates.
- It does not model the entire Caddy configuration schema.
- It does not authenticate the admin endpoint.

## Important domain objects

`RouteSummary`, `RouteRecord`, `UpstreamRecord`, `PkiCa`, `ReloadResult`, and shared `JsonObject` represent the public surface. Active config, candidate config, and integration configuration (`CADDY_URL`) are different values.

## Invariants and compatibility contracts

- Only handlers named `reverse_proxy` contribute direct `dial` targets; discovery recurses through nested arrays/objects.
- A successful `/load` maps to `reloaded: true` plus the HTTP status.
- Candidate files must decode as JSON objects; arrays and malformed JSON fail.
- Reload cannot read the candidate file or call Caddy before `--confirm-reload` is supplied.
- Confirmation guidance requires the operator to review the config diff, although this context does not compute it.
- All CLI invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/caddy` owns the Caddy admin API adapter, wire/domain translation, errors, and operations. Live configuration requires `CADDY_URL`. The app owns the local filesystem read because the candidate path is an executable-edge concern. The package depends on Effect and `@garage/cli-protocol`.

## Package and app relationship

`apps/caddy-cli` reads and decodes the candidate file, gates reload, parses commands, composes Bun filesystem/HTTP layers, and delegates remote behavior to `@garage/caddy`.

## Known ambiguities

- **Config** may mean active Caddy JSON, a local candidate file, or `CADDY_URL`; qualify it.
- Configured upstreams and runtime upstream records are related but not interchangeable.
- Route summaries are intentionally not lossless Caddy route models.
- `CaddyDecodeError` also represents local file-read failures today.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `apps/caddy-cli/src/config-file.ts`, and tests.
