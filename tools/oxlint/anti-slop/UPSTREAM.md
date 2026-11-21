# Upstream provenance

- Source repository: https://github.com/K-Mistele/anti-slop
- Upstream commit: `13b020367525e8c6efe6cede8f387697b2a8d907`
- Installed path: `tools/oxlint/anti-slop/`
- Registered plugins:
  - `tools/oxlint/anti-slop/index.ts` (`anti-slop`)
  - `tools/oxlint/anti-slop/effect/index.ts` (`anti-slop-effect`)
  - `tools/oxlint/anti-slop/plugins/landmines.ts` (`landmines` -> `@interfere/landmines/testing`)
  - `tools/oxlint/anti-slop/plugins/ai-guard.ts` (`ai-guard` -> `eslint-plugin-ai-guard`)
  - `tools/oxlint/anti-slop/plugins/effect.ts` (`effect` -> `oxlint-plugin-effect/plugin`)
  - `tools/oxlint/anti-slop/plugins/enfect.ts` (`enfect` -> `@enfect/oxlint`)
- Deviations:
  - Removed optional unused directories (`diff-rules`, `integrity`, `jev`, `martinfowler`, `xstate`, and `modes/lint.ts`) so Fallow's zero-baseline dead-code gate sees only active plugin files.
