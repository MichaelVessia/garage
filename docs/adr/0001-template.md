# ADR 0001: Architecture Decision Record template

- Status: accepted
- Date: 2026-06-13

This repository records hard-to-reverse, non-obvious architectural decisions as
Architecture Decision Records (ADRs). Copy this file to
`docs/adr/NNNN-short-title.md`, increment `NNNN`, and fill in the sections
below. Keep ADRs short; they capture a decision and its trade-off, not a design
manual.

Write an ADR when a decision is hard to reverse, surprising without context, and
the result of a real trade-off (a technology lock-in, a boundary or scope
choice, a deliberate deviation from the obvious path). Skip it for easily
reversed choices and decisions with no real alternative.

## Template

```markdown
# ADR NNNN: <title>

- Status: proposed | accepted | superseded by ADR-XXXX
- Date: YYYY-MM-DD

## Context

What forces are at play? What problem or constraint prompted the decision?

## Decision

What we decided to do, stated plainly.

## Consequences

What becomes easier and what becomes harder as a result. Include the costs we
are accepting, not just the benefits.

## Alternatives considered

The options we rejected and why the rejection is non-obvious.
```
