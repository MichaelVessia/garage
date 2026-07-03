# How to add a service workspace

A new service is two workspaces: a package (`packages/<svc>`) with the typed
domain, and a CLI app (`apps/<svc>-cli`) that exposes it. CI discovers
workspaces through `bun run --filter '*'`, so there is no central registry to
edit.

## 1. Create the service package

```sh
mkdir -p packages/<svc>/src packages/<svc>/test
```

`packages/<svc>/package.json`:

```json
{
  "name": "@garage/<svc>",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "clean": "rm -rf dist",
    "build": "bun run clean && tsgo -p tsconfig.build.json",
    "typecheck": "tsgo --noEmit",
    "lint": "oxlint --type-aware --config ../../oxlint.config.mjs src/ test/",
    "lint:fix": "oxlint --type-aware --config ../../oxlint.config.mjs --fix src/ test/",
    "format": "oxfmt --config ../../oxfmt.config.mjs --check src/ test/ package.json tsconfig.json tsconfig.build.json vitest.config.ts",
    "format:fix": "oxfmt --config ../../oxfmt.config.mjs src/ test/ package.json tsconfig.json tsconfig.build.json vitest.config.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": { "effect": "^4.0.0-beta.64" }
}
```

`packages/<svc>/tsconfig.json` extends the root base:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "test"]
}
```

Add a `tsconfig.build.json` and a `vitest.config.ts` mirroring an existing
service (copy from a neighbor like `packages/radarr`). Then build out `src`:

- `model.ts` — `Schema` structs mirroring the service's API payloads.
- `errors.ts` — the package's tagged errors (every `Data.TaggedError` lives
  here; the `tagged-error-location` rule enforces this).
- `http.ts` — the HTTP adapter: the single owner of network access, exposing a
  service interface and a test layer.
- `services.ts` — domain operations composing the adapter.
- `index.ts` — the public barrel; this is the only surface other workspaces
  import.

## 2. Create the CLI app

```sh
mkdir -p apps/<svc>-cli/src apps/<svc>-cli/test
```

`apps/<svc>-cli/package.json` adds the `bin`, the compile build, and the
workspace dependencies:

```json
{
  "name": "@garage/<svc>-cli",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "bin": { "<svc>": "dist/<svc>" },
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "clean": "rm -rf dist",
    "build": "bun run clean && bun build src/main.ts --compile --outfile dist/<svc>",
    "typecheck": "tsgo --noEmit",
    "lint": "oxlint --type-aware --config ../../oxlint.config.mjs src/ test/",
    "lint:fix": "oxlint --type-aware --config ../../oxlint.config.mjs --fix src/ test/",
    "format": "oxfmt --config ../../oxfmt.config.mjs --check src/ test/ package.json tsconfig.json tsconfig.build.json vitest.config.ts",
    "format:fix": "oxfmt --config ../../oxfmt.config.mjs src/ test/ package.json tsconfig.json tsconfig.build.json vitest.config.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@effect/platform-bun": "4.0.0-beta.64",
    "@garage/cli-protocol": "workspace:*",
    "@garage/<svc>": "workspace:*",
    "effect": "^4.0.0-beta.64"
  }
}
```

The app's `src/main.ts` is the composition root: it provides the platform layers
(`FetchHttpClient.layer`, `BunServices.layer`) and runs the command program.
Commands stay thin and render the `@garage/cli-protocol` envelope. See the
[Effect services guardrail](../guardrails/effect-services-and-layers.md).

## 3. Wire it up

```sh
bun install                 # link the new workspaces
bun run validate            # the new code must pass the full gate
```

Add a changeset so the CLI gets a version on release:

```sh
bunx changeset
```

Add a one-line entry for the new build command and layout to the root
[README.md](../../README.md), and a `README.md` in each new workspace describing
what the service is and how to point the CLI at it.
