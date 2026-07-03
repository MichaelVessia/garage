# Guardrails

These documents are operating guardrails for working in this repository. They
make project judgment explicit enough for humans and coding agents to apply
consistently.

Read the guardrail that matches the change before editing code, tests, or
automation.

## Guardrails

- [Effect Services, Layers, and Testability](effect-services-and-layers.md)

## Relationship to lints

The oxlint Effect plugin and the `rules/effect/` ast-grep checks own the
mechanical idioms and are enforced in CI. Guardrails cover the judgment the
lints cannot check: where layers are provided, what a service requires, and what
the tests prove. Do not add a guardrail for a rule a lint already enforces.

For example, the boundary-decode guardrail (decode external data with
`Schema.decodeUnknown`) is enforced by `no-unsafe-typecast-at-boundary`,
`no-typed-boundary-assignment`, and oxlint's `consistent-type-assertions: never`;
the document explains *why* and *where*, the lints enforce the *what*.

Treat these docs as part of the same maintenance harness. If a change violates a
guardrail, update the guardrail in the same pull request or explain the
exception in the PR body.
