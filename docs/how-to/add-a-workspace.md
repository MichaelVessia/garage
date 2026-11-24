# How to add a workspace

Start with ownership, not a directory template. CI discovers `packages/*` and `apps/*` through `bun run --filter '*'`; there is no central workspace registry.

## 1. Choose the delivery boundary

| Need | Preferred shape |
| --- | --- |
| Homelab or third-party service integration for agents | Author an Executor v2 app directly in Executor; do not add Garage code. |
| Reusable code without an executable | Shared package under `packages/<name>`. |
| Independently deployed worker, application, or web UI | Application under `apps/<name>`. |

## 2. Create the workspace

```sh
mkdir -p apps/<name>/src apps/<name>/test
```

Copy manifests and configuration from a current workspace such as `apps/subq`, and use the exact Effect version pinned in root `package.json`. Keep platform requirements visible so tests can provide canned infrastructure. Cross-workspace imports use `@garage/<pkg>`.

## 3. Document ownership

Add the workspace's `CONTEXT.md` and `AGENTS.md`, then register its owned paths in `CONTEXT-MAP.md`. Durable cross-context decisions belong in `docs/adr/`.

## 4. Validate

```sh
bun install
bun run --filter '@garage/<workspace>' typecheck
bun run --filter '@garage/<workspace>' test
bun run validate
bun run validate:release
```

Update root `package.json` `lint` paths and `.fallowrc.json` if adding a new `packages/*` workspace. Update shared documentation only when public behavior, vocabulary, or repository policy changes.
