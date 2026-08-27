# SABnzbd

## Purpose

This context observes and controls one SABnzbd download client through its query-based API and the consolidated Garage MCP delivery edge.

## Ubiquitous language

- **Queue slot**: one active download record identified by an NZO ID.
- **History slot**: one recent completed or failed download record, also identified by an NZO ID.
- **NZO ID**: SABnzbd's identity for a queue/history item.
- **Queue action**: global queue pause/resume or deletion of one queued item by NZO ID.
- **Delete files**: the separate destructive choice to remove downloaded data while deleting a queue item.
- **Server statistics**: usage by configured Usenet/news server, not the SABnzbd host.

## Responsibilities

- Read application status/version, queue, history, warnings/storage/speed data, and news-server usage.
- Pause or resume the global queue, or delete one queued item.
- Normalize SABnzbd's query API and inconsistent boolean/count representations.
- Own API-key query authentication, typed errors, and bounded domain operations; expose them through Garage MCP.

## Non-responsibilities

- It does not add NZBs or initiate downloads.
- It does not configure categories, servers, or speed limits.
- It does not retry failed history items or manage the SABnzbd process.
- It does not delete files unless the MCP edge receives both explicit deletion flags and Executor authorizes the destructive tool.

## Important domain objects

`QueueSlot`, `HistorySlot`, `QueueResult`, `HistoryResult`, `ActionResult`, `ServerStats`, and `SabnzbdConfigValue` are the main values. `count` and `totalRecords` intentionally distinguish returned records from upstream totals.

## Invariants and compatibility contracts

- Queue defaults to 10 records; history defaults to 50.
- MCP limits must be integers from 1 through 100.
- Every remote operation is a GET to `/api` with `apikey`, `output=json`, and an operation-specific `mode`.
- Action success accepts boolean `true` or textual `"true"`; missing status yields a successful `ActionResult` whose `ok` value is false.
- Deleting a queue item while retaining files does not set file-deletion confirmation; deleting files requires both `deleteFiles` and `confirmDeleteFiles`.
- Executor requires approval for pause, resume, and delete tools.
- MCP results use typed structured content, and public errors do not expose credentials or upstream request URLs.

## Boundaries and dependencies

`packages/sabnzbd` owns SABnzbd API translation, operations, errors, and configuration. Live configuration requires `SABNZBD_URL` and redacted `SABNZBD_API_KEY`. It depends on Effect and `@garage/integration-http`; Bun HTTP enters only through the application composition root.

## Package and app relationship

`apps/garage-mcp` defines the SABnzbd MCP toolkit, bounded transport inputs, safety annotations, public error mapping, file-deletion confirmation, and live composition. It delegates all external protocol and domain behavior to `@garage/sabnzbd`.

## Known ambiguities

- **Status** may refer to the application, queue, slot, or action response; qualify it.
- Upstream `noofslots`, returned `count`, and `totalRecords` are not interchangeable.
- **Delete** means removing the queue item; file deletion is an additional option.
- `paused` and `pausedAll` preserve upstream distinctions that are not further modeled.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [Repository conventions](../../docs/reference/conventions.md)
- [Consolidated Garage MCP ADR](../../docs/adr/0002-consolidated-garage-mcp-delivery-edge.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `src/operations.ts`, and tests.
