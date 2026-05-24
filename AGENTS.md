# Garage

- Keep Effect code pure until an application boundary exists.
- Prefer exported `Effect` values over runtime helpers in packages.
- No `any`, non-null assertions, or type assertions.
- Add behavior tests for new public API.
- Run `bun run validate` before calling work complete.
