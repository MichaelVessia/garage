# Upstream provenance

- Source repository: https://github.com/K-Mistele/anti-slop
- Upstream commit: `13b020367525e8c6efe6cede8f387697b2a8d907`
- Installed path: `tools/oxlint/anti-slop/effect/`
- Registered plugin:
  - `tools/oxlint/anti-slop/effect/index.ts` (`anti-slop-effect`)
- Deviations:
  - Kept only the Effect AST rules (`effect/`). General JS/TS linting comes from `@cloudflare/oxlint-config`, and `oxlint-plugin-effect` and `@enfect/oxlint` are loaded directly from npm without `modes/wrap.ts` wrappers.
