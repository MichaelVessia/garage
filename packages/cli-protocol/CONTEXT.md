# CLI Protocol and Runtime

## Purpose

This context defines the shared agent-first command contract and executable/runtime infrastructure used by every Garage service integration CLI.

## Ubiquitous language

- **Agent-first CLI**: a deterministic command-line interface designed for agents, humans, and scripts without interactive output modes.
- **Invocation**: one parsed argv request with a normalized command string.
- **Command tree**: self-describing command metadata returned by the root invocation.
- **Success envelope**: `{ ok: true, command, result, next_actions }`.
- **Represented failure**: an expected error encoded as `{ ok: false, command, error, fix, next_actions }`; it is output, not a process defect.
- **Next action**: a structured command affordance and parameter guidance for a likely follow-up.
- **Root health**: a success-envelope projection of configured/reachable state plus the command tree.
- **Usage error**: a represented failure for unknown commands or invalid/missing arguments.
- **Executable boundary**: shared observability, argv/stdio, envelope rendering, and Bun runtime owned by `runCliMain`.

## Responsibilities

- Define complete envelope and next-action schemas, constructors, and JSON rendering.
- Define command metadata, invocation parsing, hidden aliases, value/boolean flags, usage errors, and error recovery.
- Standardize root-command health behavior.
- Own `runCliMain` and optional OTLP observability setup.
- Provide shared config readers, JSON/list schemas, service-error field helpers, and the JSON HTTP request/decode/error pipeline.
- Provide recording HTTP test infrastructure through the `./testing` subpath.

## Non-responsibilities

- It does not own service-specific commands, domain records, endpoint paths, authentication policy, or upstream wire schemas.
- It does not define integration tagged-error classes; each package owns its distinct tags.
- It does not decide mutation confirmation policy for a service.
- It does not own CI/versioning automation, although that automation protects and releases this contract.

## Important domain objects

`SuccessEnvelope`, `ErrorEnvelope`, `NextAction`, `CommandDescription`, `CommandDefinition`, `CommandInvocation`, `RootInvocation`, root health values, `JsonObject`, `ListResultSchema`, and `CliUsageError` are the core values. `makeJsonClient`, config readers, and `runCliMain` are deep shared capabilities rather than service-domain objects.

## Invariants and compatibility contracts

- A normal invocation writes exactly one newline-terminated JSON envelope to stdout and nothing to stderr.
- Success and represented failure, including usage errors, return process status 0; unexpected bootstrap/runtime defects may terminate non-zero.
- Success always includes `ok`, `command`, `result`, and `next_actions`.
- Represented failure always includes `ok`, `command`, `error` (`code`, `message`), `fix`, and `next_actions`.
- Root missing configuration is represented inside a success envelope as `configured: false`; other root status failures remain successful health projections with `reachable: false`.
- `runCliMain` is the only executable bootstrap for integration CLIs.
- Public envelope, stream, or exit behavior changes require compatibility tests and a changeset.

## Boundaries and dependencies

The package depends on Effect and Bun platform support. Integration packages consume config, schema, error, and HTTP helpers; CLI apps consume command/envelope/root/runtime helpers. No integration-specific code belongs here.

## Relationships with integration contexts

Each `packages/<svc>` context owns domain operations and its external adapter while each `apps/<svc>-cli` maps those operations to shared command/envelope behavior. Production changes here have an all-CLI blast radius and trigger every CLI's release classification.

## Known ambiguities

- The package name **CLI Protocol** understates its HTTP, config, observability, and test-infrastructure responsibilities; do not mistake it for envelope DTOs only.
- **Failure** may mean a represented domain/usage error or an unexpected process defect; preserve the distinction.
- **Root health** is a successful description even when unconfigured or unreachable.
- **Command** may mean metadata, parsed invocation, normalized command string, or Effect implementation; qualify it in architectural prose.

## References

- [CLI compatibility and release conventions](../../docs/reference/conventions.md#cli-compatibility)
- [Effect services and executable composition guardrail](../../docs/guardrails/effect-services-and-layers.md)
- Evidence: `src/envelope.ts`, `src/command.ts`, `src/root.ts`, `src/runtime.ts`, `src/http.ts`, and package/cross-CLI tests.
