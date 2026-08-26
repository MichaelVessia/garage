# ADR 0002: Consolidate MCP delivery over existing integration packages

- Status: accepted
- Date: 2026-08-26

## Context

Garage integration packages already own typed models, domain operations, external adapters, errors, and safety policy. Their CLI apps are useful executable edges, but agent access is moving to an Executor gateway that can consume OpenAPI and MCP tools. Some self-hosted APIs, especially SABnzbd's query-based protocol, do not map cleanly to OpenAPI.

Creating an MCP server per integration would duplicate deployment, authentication, observability, and lifecycle work. Reimplementing external API calls in MCP handlers would create competing protocol owners and weaken the existing package boundaries.

## Decision

Garage will have one consolidated HTTP MCP delivery application under `apps/garage-mcp`. Tool adapters use workspace package names and delegate to existing integration package interfaces. They own only MCP names, schemas, annotations, result mapping, and server composition.

The MCP application starts with five read-only SABnzbd tools plus pause, resume, and delete. Mutation tools carry truthful MCP safety annotations, explicit Executor approval policy, and domain-level confirmation for downloaded-file deletion. Conventional APIs may remain direct Executor OpenAPI integrations instead of being duplicated in Garage MCP.

CLI retirement is evidence-gated and separate. Integration packages remain even when their CLI delivery edge is removed.

## Consequences

One private service provides a stable MCP endpoint and common deployment lifecycle. Integration semantics and external protocol mapping remain in their existing packages, while Executor can apply centralized policy.

The consolidated process has a larger potential failure and credential scope as integrations are added. Tool naming must prevent collisions, deployment changes require broader regression testing, and credentials for each included integration must be provisioned to one service. The application must not become a second domain layer.

## Alternatives considered

- **One MCP server per integration:** stronger process isolation, but substantially more deployment and policy overhead for this homelab scale.
- **Expose generic HTTP or query tools:** smaller adapter code, but it discards domain types and makes unsafe parameters available to agents.
- **Convert every service to OpenAPI:** suitable for conventional APIs, but misleading for session, XML, local-process, and query-RPC protocols.
- **Invoke Garage CLIs from MCP handlers:** reuses binaries but adds subprocess and JSON-envelope coupling instead of using the underlying package interface directly.
