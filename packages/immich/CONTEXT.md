# Immich

## Purpose

This context provides read-only operational insight and media discovery for one Immich server through its API and the `immich` CLI.

## Ubiquitous language

- **Asset**: one Immich photo or video, optionally carrying EXIF metadata.
- **Album**: a named collection of assets; album detail may be truncated by a requested limit.
- **Person**: an Immich-recognized person record; hidden people are excluded from list results, while direct ID lookup can return one.
- **Smart search**: Immich's semantic search strategy. **Metadata search** is the filename-oriented fallback.
- **Job queue**: one named Immich background-work queue and its counts.
- **Current user**: the identity associated with the API key, distinct from the server's user list.
- **Statistics**: photo/video usage counts and bytes, globally or by user.

## Responsibilities

- Read server version/ping, statistics, storage, users, current user, albums/assets, people, jobs, and tags.
- Search assets with smart search and a constrained metadata fallback.
- Normalize nullable Immich responses and bound returned lists/assets.
- Own API-key-authenticated `/api` requests and expose them through the CLI.

## Non-responsibilities

- It does not upload, download, delete, or edit assets.
- It does not create/update albums, users, quotas, people, jobs, or tags.
- It does not control background queues or manage shares.
- `library-stats` is currently an alias of general statistics, not a separate library model.

## Important domain objects

`SystemStatus`, `Statistics`, `StorageStatus`, `UserRecord`, `CurrentUser`, `AlbumSummary`, `AlbumInfo`, `AssetRecord`, `PersonRecord`, `JobRecord`, `TagRecord`, and `SearchResult` are the primary values.

## Invariants and compatibility contracts

- Bounded asset, album, people, recent, and search commands default to 25 records; users, jobs, and tags return their complete endpoint responses.
- Album detail always carries an asset list plus `moreAssetsAvailable` to signal truncation.
- Smart search falls back to metadata search only after a successful empty result, never after transport, HTTP, or decode failure.
- Admin-user lookup falls back from `/admin/users` to `/users` only on HTTP 403 and reports that reduced scope.
- The people-list request excludes hidden people; direct person lookup does not impose that filter.
- Root missing configuration is recoverable; subcommands expose a typed failure envelope.
- All invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/immich` owns the Immich API port, wire anti-corruption, operations, errors, and `x-api-key` HTTP adapter. Live configuration requires `IMMICH_URL` and redacted `IMMICH_API_KEY`. It depends on Effect and `@garage/cli-protocol`, not other media contexts.

## Package and app relationship

`apps/immich-cli` imports the package barrel, parses IDs/queries/limits, adds next actions, composes Bun HTTP/config layers, and delegates executable behavior to `runCliMain`.

## Known ambiguities

- **Stats** and **library stats** are synonyms in the current command surface.
- **Recent** is implemented as a metadata-search projection rather than a separate domain operation.
- **Users** may be full admin users or reduced ordinary-user data.
- Bare `id` fields belong to different entity types; qualify them in prose and new APIs.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `src/operations.ts`, and tests.
