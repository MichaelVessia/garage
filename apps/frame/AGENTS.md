# Frame Instructions

This context owns all of `apps/frame`: the wall-display SPA for the PF1007L photo frame, its Bun server, the calendar and Home Assistant adapters, the WebView compatibility check, and the Nix-built image.

## Read first

- [Frame domain context](CONTEXT.md)
- [Frame README](README.md)
- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Repository conventions](../../docs/reference/conventions.md)

## Local constraints

- `GOOGLE_SERVICE_ACCOUNT_KEY`, the Google access tokens it mints, and `HOME_ASSISTANT_TOKEN` are credentials. Keep them out of logs, span attributes, error messages, fixtures, and browser responses.
- Calendar and Home Assistant fixtures are synthetic. Never copy a real feed, event title, or household detail into the repository.
- The browser is Android System WebView 106. Do not ship CSS nesting, `:has()`, `oklch()`, `color-mix()`, dynamic viewport units, 4- or 8-digit hex colours, or JavaScript APIs newer than Chrome 106; `bun run build` enforces this.
- Keep `web/src/main.ts` as Model/update/subscriptions, `message.ts` as messages, `command.ts` as commands, and `view.ts` as rendering.
- Do not run deployment or production commands without explicit authorization.

## Validation

- Typecheck: `bun run --filter '@garage/frame' typecheck`
- Tests: `bun run --filter '@garage/frame' test`
- Build and WebView check: `bun run --filter '@garage/frame' build`
- Before commit: `bun run validate`
- Build, dependency, or Nix changes: also run `bun run validate:release`

Do not commit `web/dist`, `dist`, or `.env` files.
