# How to add a workspace

Start with ownership, not a directory template. CI discovers `packages/*` and
`apps/*` through `bun run --filter '*'`; there is no central workspace registry.
Existing workspaces stay in place—this guide does not require retroactive moves
or README creation.

## 1. Choose an archetype

| Archetype | Choose it when | Typical location |
| --- | --- | --- |
| Paired integration package + CLI | A typed domain and external adapter are reusable independently of the executable | `packages/<svc>` + `apps/<svc>-cli` |
| Standalone/local CLI | The executable owns local behavior and no separate reusable package is earned | `apps/<name>-cli` |
| Shared/library package | Code is reused by workspaces but has no executable | `packages/<name>` |
| Deployed application/worker/web app | The workspace is independently deployed and owns its internal boundaries | `apps/<name>` |

HTTP, process execution, filesystem access, and browser APIs are adapter
variants, not archetypes. For example, most paired integrations use HTTP,
Tailscale uses a process adapter, TubeArchivist additionally has a persistent
session-cache adapter, and Subq is a deployed application.

Use the paired instructions below only when that split is truthful. Otherwise,
copy the closest workspace of the selected archetype and retain only the
responsibilities the new project needs.

## 2. Create a paired integration package

```sh
mkdir -p packages/<svc>/src packages/<svc>/test
```

Copy `package.json`, `tsconfig.json`, `tsconfig.build.json`, and
`vitest.config.ts` from a current neighboring integration such as
`packages/radarr`, then change its name. Do not copy dependency versions from an
old planning document. At the time of writing, integration packages use:

```json
{
  "dependencies": {
    "@garage/cli-protocol": "workspace:*",
    "effect": "4.0.0-beta.93"
  }
}
```

Use these responsibilities as needed:

- `model.ts` — public decoded domain shapes.
- `api-schema.ts` — `Schema` codecs matching upstream wire payloads.
- `errors.ts` — every `Schema.TaggedErrorClass` owned by the package.
- `services.ts` — API interfaces and genuine configuration or policy services;
  not domain operations.
- `http.ts`, `process.ts`, or another adapter — the sole owner of external I/O.
  Export its live layer without sealing platform infrastructure.
- `operations.ts` — domain Effects requiring the narrow API/config/policy
  services they actually consume.
- `index.ts` — the public barrel imported by other workspaces.

Cross-workspace imports always use `@garage/<pkg>`, never relative paths.

## 3. Create the paired CLI app

```sh
mkdir -p apps/<svc>-cli/src apps/<svc>-cli/test
```

Copy the manifests and configs from the matching current CLI (for example
`apps/radarr-cli`) and change the package name, binary, output path, and service
dependency. Current dependency forms are:

```json
{
  "dependencies": {
    "@effect/platform-bun": "4.0.0-beta.93",
    "@garage/cli-protocol": "workspace:*",
    "@garage/<svc>": "workspace:*",
    "effect": "4.0.0-beta.93"
  }
}
```

Use the exact Effect beta shown in current manifests; never introduce a caret
or tilde range. Upgrade the beta across all first-party manifests and generated
Bun/Nix dependency data using the procedure in
[the conventions reference](../reference/conventions.md#dependencies).

Keep commands thin. App `main.ts` selects and composes domain, configuration,
and platform layers, then calls `runCliMain`. Do not duplicate observability,
argv/stdio handling, JSON rendering, or `BunRuntime`: `runCliMain` owns that
shared executable bootstrap.

The public CLI contract is always one JSON envelope line on stdout. Success has
`ok`, `command`, `result`, and `next_actions`; represented failure has `ok`,
`command`, `error` (`code` and `message`), `fix`, and `next_actions`. Both exit
0 and leave stderr empty, including usage errors. Unexpected runtime defects
may terminate non-zero.

## 4. Test the seams

For a paired integration, add all three forms of focused coverage:

1. Operation tests provide a local, complete API fake. Do not publish a broad
   test layer solely for these tests.
2. Live adapter tests provide canned infrastructure to the unsealed live layer.
   For HTTP, use `makeRecordingHttpClient` from
   `@garage/cli-protocol/testing`; for process execution, provide a canned
   `ChildProcessSpawner`.
3. A representative wiring test drives a command through the live adapter and
   asserts the complete envelope and external request/invocation.

Add a reusable memory layer only when it models real semantics (for example a
session cache), not as a default testing convention. Put stable spans on domain
operations and annotate useful non-secret inputs. Do not add a duplicate span
to a method that merely forwards to an already-spanned operation.

Standalone CLIs and deployed apps should use equivalent tests at their actual
boundaries rather than imitating the paired file layout.

## 5. Document context ownership

If the workspace introduces a new bounded context, add one canonical
`CONTEXT.md`, a minimal context `AGENTS.md`, and a sibling
`CLAUDE.md -> AGENTS.md` symlink. Register its owned paths and references in the
root `CONTEXT-MAP.md`.

For a paired integration, keep the canonical domain docs with
`packages/<svc>` and add only a small `apps/<svc>-cli/AGENTS.md` router (plus its
sibling symlink) at the executable edge. Do not create context docs for adapters,
generated directories, or organizational folders that have no independent
vocabulary or ownership.

## 6. Link, validate, and release

```sh
bun install
bun run --filter '@garage/<workspace>' typecheck
bun run --filter '@garage/<workspace>' test
bun run validate
```

If a CLI is added or its behavior changes, create a changeset:

```sh
bunx changeset
```

Update shared documentation only when public behavior, vocabulary, or
repository policy changes. A workspace README may be useful, but this guide
does not impose one or require retroactive documentation across existing
workspaces.
