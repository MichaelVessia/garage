# Pi Extensions Instructions

This context owns the Garage-maintained Pi extension package under `packages/pi-extensions`.

## Read first

- [Pi Extensions context](CONTEXT.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Repository conventions](../../docs/reference/conventions.md)
- Pi's installed `docs/extensions.md` and `docs/packages.md` for the active Pi version

## Local constraints

- Keep Pi lifecycle registration and TUI types in `extensions/`; keep state transitions, parsing, and policy in `src/`.
- Use existing Effect capabilities for filesystem, path, state, and parsing behavior rather than defining pass-through services.
- Treat Pi event payloads and settings files as untrusted boundary input.
- Preserve extension lifecycle behavior in TUI, RPC, JSON, and print modes; guard TUI-only behavior with `ctx.mode === "tui"`.
- Pi core packages are peer dependencies supplied by Pi. Other runtime packages belong in this workspace's dependencies.

## Validation

- Focused: `bun run --filter '@garage/pi-extensions' typecheck`
- Tests: `bun run --filter '@garage/pi-extensions' test`
- Package smoke: `pi -e ./packages/pi-extensions -p "Reply only with ok"`
- Before commit: `bun run validate`
