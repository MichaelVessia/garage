# Garage

Agent-first command-line tools for self-hosted services. This document is the
domain language: use these terms in names, comments, commits, and docs, and
avoid the listed alternatives so the vocabulary stays consistent.

## Language

**Agent-first CLI**:
A command-line tool designed so an agent (or a human, or a script) can drive it
deterministically: explicit subcommands and flags and exactly one JSON envelope
line on stdout. A success envelope has `ok`, `command`, `result`, and
`next_actions`; an error envelope has `ok`, `command`, `error` (`code` and
`message`), `fix`, and `next_actions`. Represented success and failure both exit
0 and leave stderr empty; unexpected runtime defects may exit non-zero. Each
self-hosted service has exactly one.
_Avoid_: wrapper, script, tool.

**Self-hosted service**:
An external system a garage CLI wraps. The current set: AdGuard Home,
AutoCaliWeb, Caddy, Immich, Jellyfin, Jellyseerr, Prowlarr, Radarr, SABnzbd,
Sonarr, Tailscale, TubeArchivist.
_Avoid_: backend, server, target, integration.

**Integration package** (`packages/<svc>`; historically **service package**):
The library half of a paired integration. It owns public models, wire schemas,
configuration and API service interfaces, the external adapter, tagged errors,
and domain operations. It does not print or parse argv. HTTP and process
execution are adapter variants, not different repository archetypes.
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

**External adapter**:
The module that owns contact with an external system. Most paired integrations
use an **HTTP adapter** (`http.ts`), the only module that touches live
`HttpClient`; Tailscale instead uses a process adapter. Adapters expose an
unsealed live layer so canned infrastructure can test real mapping logic.
_Avoid_: api wrapper, fetcher, gateway.

**Domain operation**:
A deterministic, testable Effect that composes a service's domain (decode,
transform, compute) and returns a typed result or a tagged error. Commands call
these; rendering happens at the edge.
_Avoid_: handler, action, helper.

**CLI protocol** (`packages/cli-protocol`):
The deep shared package behind every CLI: complete success/error envelope
schemas and command-description metadata, plus `runCliMain` (observability,
argv/stdio, JSON rendering, and Bun runtime), `makeJsonClient` (HTTP
request/decode/error pipeline), `makeConfigReaders`, `makeRoot`, service error
field shapes, common schemas (`JsonObject`, `ListResultSchema`), and
`makeRecordingHttpClient` under the `./testing` subpath.
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
An independently owned package or app under `packages/*` or `apps/*`. Choose
one of four archetypes: **paired integration package + CLI**,
**standalone/local CLI**, **shared/library package**, or **deployed
application/worker/web app**. The paired split is optional for future projects;
existing workspaces stay where they are.
_Avoid_: module, folder, component.

**Vendored reference** (`repos/`):
Read-only third-party source kept in-tree for grounding (currently
`effect-smol`, the Effect v4 source and ai-docs). Cite it; never edit or import
it. Refresh with `bun run vendor:update`.
_Avoid_: dependency, lib, submodule.

## Relationships

- A paired **CLI app** depends on one **integration package** and renders its
  typed results; it never contacts the external service directly.
- Every **integration package** exposes its public API through its `index.ts`
  barrel; cross-workspace imports use the package name (`@garage/<pkg>`), never
  a relative path.
- Every external system has one owning **external adapter**. Operations are
  tested with local complete API fakes; live adapters are tested with canned
  infrastructure.
- Every CLI emits the **CLI protocol** envelope, so consumers parse one shape
  regardless of which service they drove.
- **Domain operations** return typed results and **tagged errors**. App
  `main.ts` composes layers; `runCliMain` owns executable behavior.

## Flagged ambiguities

- "client" has been used for both the HTTP adapter and the API service
  interface. Resolved: the **HTTP adapter** owns the wire; the API service is
  the interface domain operations depend on.
- "model" can mean the schema or the decoded type. Resolved: **Model** is the
  `Schema` value; its `typeof X.Type` alias is the decoded type.
