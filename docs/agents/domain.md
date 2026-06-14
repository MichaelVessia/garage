# Domain guidance for agents

Before naming things, writing docs, or designing a change, load the domain
language and the decisions that shape this repo.

- Read [CONTEXT.md](../../CONTEXT.md) for the vocabulary. Use those terms in
  names, comments, commits, and docs; avoid the listed alternatives. If a change
  introduces a new concept, add it to CONTEXT.md in the same pull request.
- Read [docs/adr/](../adr/) for decisions already made. If a change contradicts
  an ADR, either follow the ADR or supersede it with a new one; do not silently
  diverge.
- Read the guardrail that matches the change in
  [docs/guardrails/](../guardrails/README.md) before touching service or layer
  code.

If you find the code and CONTEXT.md disagree, treat it as a bug in one of them
and flag it rather than guessing. The vocabulary is only useful while it stays
true.
