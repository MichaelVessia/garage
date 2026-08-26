# CLI Protocol and Shared Integration Runtime

## Purpose

This legacy-named package retains transport-neutral configuration, HTTP, schema, error, observability, and recording-test capabilities consumed by the AutoCaliWeb and SABnzbd integration packages. It also still contains the former agent-first CLI envelope/runtime implementation pending separate extraction or removal.

## Current responsibilities

- Required string and redacted-secret configuration readers.
- Shared JSON and bounded-list schemas.
- Service-error field helpers and constructors.
- JSON HTTP request, decode, and safe error behavior.
- Recording HTTP test infrastructure through the `./testing` subpath.
- Legacy command/envelope/root/runtime modules and their tests until a focused cleanup removes them.

## Non-responsibilities

- It does not own service-specific models, endpoints, authentication, operations, or MCP tools.
- It does not own Garage MCP composition or public error mapping.
- It no longer has a CLI release or executable consumer.

## Boundaries

`packages/autocaliweb` and `packages/sabnzbd` consume its transport-neutral capabilities. Garage MCP consumes those integration packages rather than importing this package directly. New MCP handlers must not depend on legacy command-envelope APIs.

The package name understates its surviving non-CLI responsibilities. Extracting those capabilities into a more accurately named package and deleting the legacy CLI-only surface is intentionally separate from service CLI retirement.

## Invariants

- Expected failures remain typed values in Effect error channels.
- Unknown HTTP and configuration input is parsed at the boundary.
- Credential values must remain redacted and absent from logs and public errors.
- Recording HTTP infrastructure must preserve the request behavior needed by live-adapter tests.

## References

- [Repository conventions](../../docs/reference/conventions.md)
- [Effect service guardrail](../../docs/guardrails/effect-services-and-layers.md)
