# Integration HTTP

## Purpose

This package provides the typed Effect HTTP-adapter infrastructure shared by retained integration packages.

## Responsibilities

- Read required strings and redacted secrets from Effect configuration.
- Provide reusable field shapes and constructors for integration-owned tagged errors.
- Build authenticated JSON GET requests from integration-owned base URLs, paths, and query values.
- Map transport, non-success status, and decode failures into caller-owned typed errors.
- Provide recording HTTP infrastructure through the `./testing` subpath.

## Non-responsibilities

- It does not own integration-specific models, endpoints, authentication, operations, or MCP tools.
- It does not define a command protocol, CLI envelope, executable runtime, or delivery edge.
- It does not own domain result shapes used by only one integration.

## Boundaries

`packages/autocaliweb` and `packages/sabnzbd` consume this package while retaining ownership of their external protocols and domain behavior. Garage MCP consumes those integration packages rather than importing this package directly.

## Invariants

- Expected failures remain typed values in Effect error channels.
- Unknown HTTP and configuration input is parsed at the owning seam.
- Credential values remain redacted and absent from logs and public errors.
- Authentication is supplied by the integration package and applied to every request built by the JSON client.
- Recording HTTP infrastructure preserves the request behavior needed by live-adapter tests.

## References

- [Repository conventions](../../docs/reference/conventions.md)
- [Effect service guardrail](../../docs/guardrails/effect-services-and-layers.md)
