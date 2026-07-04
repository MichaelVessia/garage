# Garage

Agent-first command-line tools for self-hosted services. This document is the
domain language: use these terms in names, comments, commits, and docs, and
avoid the listed alternatives so the vocabulary stays consistent.

## Language

**Agent-first CLI**:
A command-line tool designed so an agent (or a human, or a script) can drive it
deterministically: explicit subcommands and flags, human-readable output by
default, and a `{ command, result }` / `{ command, error }` JSON envelope for
machine consumers. Each self-hosted service has exactly one.
_Avoid_: wrapper, script, tool.

**Self-hosted service**:
An external system a garage CLI wraps. The current set: AdGuard Home,
AutoCaliWeb, Caddy, Immich, Jellyfin, Jellyseerr, Prowlarr, Radarr, SABnzbd,
Sonarr, Tailscale, TubeArchivist.
_Avoid_: backend, server, target, integration.

**Service package** (`packages/<svc>`):
The library for one service. It owns the typed domain: configuration, the API
service interface, the HTTP adapter that talks to the running service, the
tagged errors, and the domain operations. It does not print or parse argv.
_Avoid_: core, sdk, client lib.

**CLI app** (`apps/<svc>-cli`):
The thin executable surface over a service package. It wires commands to domain
operations and renders typed results as human text or the JSON envelope. It
holds no business logic of its own.
_Avoid_: frontend, binary, wrapper app.

**Model** (`packages/<svc>/src/model.ts`):
The `Schema` structs that mirror a service's API payloads. Struct keys are the
upstream wire keys; the decoded value is the typed domain shape.
_Avoid_: types file, dto, interface.

**HTTP adapter** (`packages/<svc>/src/http.ts`):
The one module that owns network access to a service. It is the only place that
touches the live `HttpClient` for that service and the single seam a test layer
substitutes.
_Avoid_: api wrapper, fetcher, gateway.

**Domain operation**:
A deterministic, testable Effect that composes a service's domain (decode,
transform, compute) and returns a typed result or a tagged error. Commands call
these; rendering happens at the edge.
_Avoid_: handler, action, helper.

**CLI protocol** (`packages/cli-protocol`):
The deep shared package behind every CLI: the JSON envelope
(`{ command, result }` / `{ command, error }`) and command-description
metadata, plus the shared machinery — `runCliMain` (entrypoint),
`makeJsonClient` (HTTP request/decode/error pipeline), `makeConfigReaders`,
`makeRoot` (health failure branch), the service error field shapes, common
schemas (`JsonObject`, `ListResultSchema`), and `makeRecordingHttpClient`
under the `./testing` subpath.
_Avoid_: shared, common, utils.

**Tagged error** (`packages/<svc>/src/errors.ts`):
A `Schema.TaggedErrorClass` defined in a package's `errors.ts` and carried in
an Effect's error channel. Errors are values, never thrown. Lint rule EF-1
bans `Data.TaggedError`.
_Avoid_: exception, custom error.

**Validation gate** (`bun run validate`):
The full local quality gate (typecheck, lint, format, ast-grep, ast-grep tests,
vitest) that mirrors CI. The pre-PR definition of done.
_Avoid_: build, check, ci script.

**Workspace**:
An independently owned package or app under `packages/*` or `apps/*`.
_Avoid_: module, folder, component.

**Vendored reference** (`repos/`):
Read-only third-party source kept in-tree for grounding (currently
`effect-smol`, the Effect v4 source and ai-docs). Cite it; never edit or import
it. Refresh with `bun run vendor:update`.
_Avoid_: dependency, lib, submodule.

## Relationships

- A **CLI app** depends on exactly one **service package** and renders its
  typed results; it never reaches the network directly.
- Every **service package** exposes its public API through its `index.ts`
  barrel; cross-workspace imports use the package name (`@garage/<pkg>`), never
  a relative path.
- Every **HTTP adapter** is the single owner of network access to its service
  and ships a test layer so domain operations run under test without a live
  service.
- Every CLI emits the **CLI protocol** envelope, so machine consumers parse one
  shape regardless of which service they drove.
- **Domain operations** return typed results and **tagged errors**; the **CLI
  app** is the only place that turns them into text or exit codes.

## Flagged ambiguities

- "client" has been used for both the HTTP adapter and the API service
  interface. Resolved: the **HTTP adapter** owns the wire; the API service is
  the interface domain operations depend on.
- "model" can mean the schema or the decoded type. Resolved: **Model** is the
  `Schema` value; its `typeof X.Type` alias is the decoded type.
