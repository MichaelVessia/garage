# Context Map

This monorepo contains multiple independently evolving project contexts. Before
working in an area, read the context document and ADR locations mapped below.

| Context             | Owned paths                                             | Domain language | Architectural decisions        |
| ------------------- | ------------------------------------------------------- | --------------- | ------------------------------ |
| Garage CLI platform | `apps/*`, `packages/*`, `rules/*`, and `rule-tests/*` | `CONTEXT.md`    | `docs/adr/`, `docs/guardrails/` |

Add a row whenever an unrelated project context is introduced. Prefer a
context-local `CONTEXT.md` and `docs/adr/` beneath that project’s owning
directory. Reserve root `docs/adr/` for decisions spanning multiple contexts.
