# Vision

Garage is a collection of agent-first command-line tools for the self-hosted
services that run a home lab. Each service (AdGuard Home, Caddy, Immich,
Jellyfin, the *arr stack, and so on) gets one CLI that exposes deterministic,
scriptable operations over its HTTP API.

The project has two jobs.

**Be useful today.** The CLIs are the interface an operator (human or agent)
reaches for to inspect and drive these services. They have to be stable,
predictable, and pleasant to pipe into other tools.

**Be a harness experiment.** Garage is also a testbed for building software
where the leverage lives in the environment (types, lints, hooks, docs,
validation) instead of in any single prompt. The goal is a codebase an agent
can extend reliably without re-learning the rules each time.

## Stance

- **Agent-first.** Optimize for what makes an agent reliable, not just what is
  familiar to humans. A constraint that helps the agent and mildly
  inconveniences a human is usually worth it. The CLIs themselves follow this:
  deterministic output and a stable JSON envelope over interactive prompts.
- **Cutting-edge is allowed.** We adopt experimental tooling (Effect v4,
  oxlint/oxfmt, ast-grep) when it serves the agent, and accept the instability
  of living near the edge.
- **Encode, don't repeat.** A rule the model keeps forgetting becomes a lint, a
  type, or a hook. Every repeated correction is a signal that the harness is
  missing a guardrail.
- **Bias to ship.** Invest in the harness only as far as it helps us ship a
  working CLI.
