# Garage

- Keep Effect code pure until an application boundary exists.
- Prefer exported `Effect` values over runtime helpers in packages.
- No `any`, non-null assertions, or type assertions.
- Add behavior tests for new public API.
- For exact Effect API behavior, read `repos/effect-smol/` directly. Start at
  `repos/effect-smol/LLMS.md`, then `repos/effect-smol/ai-docs/`, then
  `repos/effect-smol/packages/effect/src/`.
- Treat `repos/` as read-only reference source. Do not edit it or import from it
  in app code.
- Refresh vendored Effect with `bun run vendor:update:effect-smol`.
- Run `bun run validate` before calling work complete.
