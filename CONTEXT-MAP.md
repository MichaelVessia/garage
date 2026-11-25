# Context Map

This is the authoritative router for bounded contexts in `garage`. Match every changed path to the rows below, then read each row's `AGENTS.md` and `CONTEXT.md`. Referenced paths are repository-relative.

## Contexts

| Context | Owned paths | Instructions | Domain context | Context ADRs | Relevant policy | Responsibility |
| --- | --- | --- | --- | --- | --- | --- |
| Subq | `apps/subq/**` | `apps/subq/AGENTS.md` | `apps/subq/CONTEXT.md` | None currently; system-wide `docs/adr/` | `apps/subq/README.md`, `docs/guardrails/effect-services-and-layers.md`, `docs/reference/conventions.md` | Track personal weight, injections, schedules, goals, and statistics in one deployed web application. |
| Logbook | `apps/logbook/**` | `apps/logbook/AGENTS.md` | `apps/logbook/CONTEXT.md` | None currently; system-wide `docs/adr/` | `docs/reference/conventions.md` | Record the household’s assets, maintenance schedules, service, and warranties. |
| Repository Engineering | Root repository/tooling files, `.claude/**`, `.github/**`, `.vscode/**`, `.zed/**`, `docs/**`, `rules/**`, `rule-tests/**`, `scripts/**` | `docs/repository-engineering/AGENTS.md` | `docs/repository-engineering/CONTEXT.md` | System-wide `docs/adr/` | `CONTRIBUTING.md`, `docs/reference/conventions.md`, `docs/guardrails/` | Own the shared harness: validation, static policy, builds, Nix, CI, releases, contributor and agent documentation. |

`README.md` and `VISION.md` describe Garage's repository-wide purpose; they do not create an additional bounded context. Generated output, dependency directories, and untracked build residue are not first-party contexts.

## Changes spanning contexts

- Read every affected row before editing; one context's vocabulary and assumptions do not automatically apply to another.
- Root dependency, lock, TypeScript, Bun, or Nix artifact changes can affect all workspaces even though Repository Engineering owns those files.
- Cross-context decisions belong under `docs/adr/`; context-specific decisions belong near the owning context once such an ADR location is needed.
- If a new independently owned project is added, update this map in the same change. Do not add a context for a directory that is only an adapter, delivery edge, generated output, or organizational folder.
