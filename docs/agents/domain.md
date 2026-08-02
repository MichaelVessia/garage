# Domain guidance for agents

This is a multi-context monorepo containing potentially unrelated personal
projects.

## Before exploring

1. Read `CONTEXT-MAP.md` at the repository root.
2. Identify the context containing the code being changed.
3. Read that context’s `CONTEXT.md`.
4. Read relevant system-wide ADRs under `docs/adr/`.
5. Read context-specific ADRs listed by `CONTEXT-MAP.md`.
6. For Garage service or Layer code, read the matching guardrail under
   `docs/guardrails/`.

If a referenced file does not exist, proceed silently.

## Use each context’s vocabulary

Use terms defined by the relevant context in names, comments, commits, tests,
issues, and documentation. Avoid synonyms that its glossary explicitly rejects.

If a change spans contexts, read every affected context. Do not import one
context’s vocabulary or assumptions into an unrelated project.

If code and its context documentation disagree, flag the mismatch rather than
guessing. Add genuinely new domain concepts to the owning context’s
`CONTEXT.md`.

## Architectural decisions

Read ADRs affecting the area before changing its architecture. If a proposal
contradicts an ADR, identify the conflict explicitly and either follow or
supersede the decision; never silently diverge.
