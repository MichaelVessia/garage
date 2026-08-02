# Jellyseerr

## Purpose

This context provides observation and moderation of media requests in one Jellyseerr instance through its API and the `jellyseerr` CLI.

## Ubiquitous language

- **Request**: a Jellyseerr media request with a requester and request state.
- **Pending requests**: the default request-list filter. **All requests** is the explicit broader filter.
- **Media**: Jellyseerr's internal availability record, optionally linked to TMDB.
- **Search result**: a TMDB discovery projection returned through Jellyseerr, not a local media record.
- **Recently available**: media recently marked available; it does not necessarily mean recently requested or downloaded.
- **Issue**: an open Jellyseerr issue record.
- **Request counts**: aggregate counts by request state.

## Responsibilities

- Read application status, requests/counts, search results, media, recently available media, users, and open issues.
- Approve, decline, or delete a request after distinct CLI confirmation.
- Normalize Jellyseerr's title/name, requester identity, status, and pagination variations.
- Own `x-api-key` HTTP requests and typed operations/errors.

## Non-responsibilities

- It does not create requests or edit requested content; moderation state transitions and deletion are owned behavior.
- It does not resolve issues, manage users/permissions, or configure downstream services.
- It does not call TMDB, Jellyfin, Plex, Radarr, or Sonarr directly.
- It does not initiate downloads independently of Jellyseerr's workflow.

## Important domain objects

`SystemStatus`, `RequestRecord`, `RequestCounts`, `RequestFilter`, `MediaSummary`, `SearchRecord`, `UserRecord`, `IssueRecord`, and `DeleteRequestResult` are the main values. Search IDs and Jellyseerr media IDs are distinct even when both are numeric.

## Invariants and compatibility contracts

- Requests default to 10 pending records; `--all` changes only the filter.
- List `count` is returned-page length; `totalRecords` is the broader API total when available.
- Recently added queries only available media; issues only open issues.
- Approve, decline, and delete use separate confirmation flags and cannot reach the API before confirmation.
- Root missing configuration is recoverable; subcommands return typed failure envelopes.
- All invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/jellyseerr` owns the `/api/v1` boundary, anti-corruption schemas, operations, and errors. Live configuration requires `JELLYSEERR_URL` and redacted `JELLYSEERR_API_KEY`. It depends on Effect and `@garage/cli-protocol`, not on the downstream media/*arr contexts named by Jellyseerr.

## Package and app relationship

`apps/jellyseerr-cli` parses IDs/queries/limits, selects fixed filters, adds next actions and mutation gates, composes Bun HTTP/config layers, and delegates to `@garage/jellyseerr`.

## Known ambiguities

- **Status** may mean application, request, media, or issue state; qualify it.
- `StatusValue` is intentionally open to numeric or textual upstream states.
- A search result ID is not necessarily a Jellyseerr internal media ID.
- User identity may normalize Jellyfin, Plex, or generic usernames.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `src/operations.ts`, and tests.
