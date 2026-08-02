# Prowlarr

## Purpose

This context provides indexer observation, release discovery, and controlled connected-application synchronization for one Prowlarr instance through the `prowlarr` CLI.

## Ubiquitous language

- **Indexer**: a configured Prowlarr release source with protocol, priority, and search/RSS capabilities. Health warnings and indexer activity statistics are separate projections.
- **Release**: a torrent or Usenet candidate returned by an indexer search.
- **Search protocol**: the closed choice `torrent` or `usenet`; this is distinct from Prowlarr's open search `type` string.
- **Application**: a downstream application connected to Prowlarr.
- **Application-indexer sync**: a queued Prowlarr command that pushes indexer configuration to connected applications.
- **History**: recent query/grab activity and failures.

## Responsibilities

- Read system status, health, indexers, indexer statistics, applications, and history.
- Search enabled indexers by free text or structured TVDB/IMDB/TMDB identifiers.
- Test one configured indexer.
- Queue confirmed application-indexer synchronization.
- Normalize nullable Prowlarr API v1 records and bounded totals.

## Non-responsibilities

- It does not create, update, or delete indexers/applications.
- It does not grab releases or manage downstream libraries/download clients.
- It does not wait for a queued sync command to complete.
- It does not own Radarr or Sonarr behavior.

## Important domain objects

`IndexerRecord`, `IndexerStatsRecord`, `IndexerTestResult`, `ReleaseRecord`, `SearchOptions`, `TvSearchOptions`, `MovieSearchOptions`, `ApplicationRecord`, `CommandResult`, `HealthRecord`, and `HistoryRecord` define the public model.

## Invariants and compatibility contracts

- General bounded reads default to 10 records; history defaults to 50.
- Returned `count` reflects sliced records while `totalRecords` preserves the upstream total.
- TV queries use TVDB plus optional season/episode tokens; movie search requires at least one IMDB or TMDB ID and combines both when supplied.
- Protocol filtering maps torrent and Usenet to Prowlarr's pseudo-indexer IDs; the CLI rejects selecting both protocols at once.
- Indexer-test HTTP 400 is a failed test result, not a general command failure.
- Sync only queues `ApplicationIndexerSync` and requires `--confirm-sync` at the CLI edge.
- All invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/prowlarr` owns API v1 decoding, `x-api-key` requests, domain operations, and errors. Live configuration requires `PROWLARR_URL` and redacted `PROWLARR_API_KEY`. It depends on Effect and `@garage/cli-protocol`; downstream applications are external records, not workspace dependencies.

## Package and app relationship

`apps/prowlarr-cli` parses search shapes and IDs, supplies aliases/next actions, gates sync, composes Bun HTTP/config layers, and delegates to the package barrel.

## Known ambiguities

- **Apps** and **applications** are aliases; use **application** in domain prose.
- **Stats** aliases indexer statistics.
- **Sync** means enqueue, not completed synchronization.
- **Search type** and **search protocol** are different values.
- **Test** means testing one indexer in this context, not repository tests.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `src/operations.ts`, and tests.
