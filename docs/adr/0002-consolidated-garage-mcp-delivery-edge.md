# ADR 0002: Consolidate MCP delivery over existing integration packages

- Status: accepted
- Date: 2026-08-26

## Context

Garage integration packages own typed models, domain operations, external adapters, errors, and safety policy where a custom adapter remains necessary. Agent access uses an Executor gateway that can consume OpenAPI and MCP tools.

Executor can turn a conventional OpenAPI operation into a tool when the service provides a usable machine-readable specification. That path is preferred because Executor can derive the tool name, inputs, HTTP request, response shape, and authentication without Garage owning another integration package. An HTTP API alone is not enough; its published contract must describe useful operations without requiring an agent to understand the service's wire protocol.

SABnzbd and AutoCaliWeb do not meet that condition:

- SABnzbd sends every operation to `GET /api` and selects the operation with query parameters such as `mode`, `name`, and `value`. Its API key is also a query parameter. Importing that protocol as one generic tool would expose low-level controls, unclear response shapes, and destructive operations directly to agents. `packages/sabnzbd` instead presents queue, history, pause, resume, and delete as separate operations and normalizes SABnzbd's responses. The MCP adapter adds approval metadata and requires a second explicit confirmation before deleting downloaded files.
- AutoCaliWeb exposes the ebook catalog mainly as paginated OPDS Atom XML, with a few separate JSON endpoints. A direct HTTP tool would return raw XML and leave the caller to distinguish books from navigation entries, resolve relative links, follow pagination, identify acquisition links, and combine catalog data with JSON metadata. `packages/autocaliweb` performs that translation and exposes bounded, read-only catalog operations.

Creating an MCP server per integration would duplicate deployment, authentication, observability, and lifecycle work. Reimplementing external API calls in MCP handlers would create competing protocol owners and weaken the existing package boundaries.

## Decision

Garage will have one consolidated HTTP MCP delivery application under `apps/garage-mcp`. Tool adapters use workspace package names and delegate to existing integration package interfaces. They own only MCP names, schemas, annotations, result mapping, and server composition.

The MCP application started with five read-only SABnzbd tools plus pause, resume, and delete, and now also exposes nine read-only AutoCaliWeb API/catalog tools. Mutation tools carry truthful MCP safety annotations, explicit Executor approval policy, and domain-level confirmation where appropriate. Conventional APIs remain direct Executor OpenAPI integrations instead of being duplicated in Garage MCP. A hand-written OpenAPI facade is not considered simpler when it would still need custom parsing, pagination, normalization, or safety logic; that is a custom adapter with a less truthful interface.

This decision should be revisited for either service if it publishes a complete OpenAPI specification whose operations and response schemas remove the need for Garage's protocol translation and safety behavior.

Garage's agent-first service CLIs have been retired. Integration packages remain only when Garage MCP or another production consumer needs their protocol ownership.

## Consequences

One private service provides a stable MCP endpoint and common deployment lifecycle. Integration semantics and external protocol mapping remain in their existing packages, while Executor can apply centralized policy.

The consolidated process has a larger potential failure and credential scope as integrations are added. Tool naming must prevent collisions, deployment changes require broader regression testing, and credentials for each included integration must be provisioned to one service. The application must not become a second domain layer.

## Alternatives considered

- **One MCP server per integration:** stronger process isolation, but substantially more deployment and policy overhead for this homelab scale.
- **Expose generic HTTP or query tools:** smaller adapter code, but it discards domain types and makes unsafe parameters available to agents.
- **Convert every service to OpenAPI:** suitable for conventional APIs, but misleading for session, XML, local-process, and query-RPC protocols.
- **Invoke Garage CLIs from MCP handlers:** reuses binaries but adds subprocess and JSON-envelope coupling instead of using the underlying package interface directly.
