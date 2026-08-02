# Sonarr

## Purpose

This context manages a Sonarr television-series library and observes episode acquisition state through API v3 and the `sonarr` CLI.

## Ubiquitous language

- **Series lookup result**: a Sonarr/TVDB discovery candidate not necessarily present in the library.
- **Series record**: a series already owned by the configured Sonarr library.
- **TVDB ID**: the public identity used by lookup, existence, add, and remove workflows.
- **Sonarr series ID**: Sonarr's internal identity used after resolving a library record.
- **Episode**: a season/episode record used by calendar and wanted/missing projections.
- **Wanted/missing episode**: a monitored episode returned by Sonarr's wanted endpoint.
- **Search for missing episodes**: the add-time request for Sonarr to seek downloads; not metadata lookup.

## Responsibilities

- Read status, root folders, quality profiles, queue, calendar, missing episodes, and history.
- Look up series, test library membership, and add/remove series.
- Choose the first root folder and apply configured/default quality, monitoring, and search policy.
- Enrich sparse nested API responses with series, episode, quality, language, and status-message context.

## Non-responsibilities

- It does not manage seasons or individual episode monitoring/search directly.
- It does not configure root folders, quality profiles, indexers, download clients, or queue entries.
- It does not edit series after add.
- It does not offer root-folder selection beyond the first configured folder.

## Important domain objects

`SeriesLookupResult`, `SeriesRecord`, `SeriesStatistics`, `EpisodeRecord`, `QueueRecord`, `HistoryRecord`, `RootFolder`, `QualityProfile`, `AddSeriesResult`, `ExistsResult`, `RemoveSeriesResult`, and `CalendarResult` form the public model.

## Invariants and compatibility contracts

- Add resolves a TVDB lookup and requires at least one configured root folder.
- New series are monitored; quality is an explicit override or configured default, and missing-episode search runs by default unless `--no-search` is supplied.
- Existing-series checks resolve by TVDB ID; deletion uses the internal Sonarr ID.
- Removing defaults to preserving files; deletion requires both `--delete-files` and `--confirm-delete-files`.
- General bounded lists default to 10; calendar defaults to 14 days and includes monitored episodes.
- Queue/missing/history preserve upstream totals while bounding visible records.
- All invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/sonarr` owns series/episode policy, API v3 anti-corruption, `x-api-key` HTTP, configuration, operations, and errors. Live configuration requires `SONARR_URL` and redacted `SONARR_API_KEY`; `SONARR_DEFAULT_QUALITY_PROFILE` is optional. It depends on Effect and `@garage/cli-protocol`, not on Prowlarr, Radarr, or download-client packages.

## Package and app relationship

`apps/sonarr-cli` parses TVDB IDs/options, builds next actions, enforces file-deletion confirmation, composes Bun HTTP/config layers, and delegates to `@garage/sonarr`.

## Known ambiguities

- **Series** is both singular and plural; make cardinality explicit when needed.
- **Search** means metadata lookup, while add-time search means missing-episode acquisition.
- **Exists** means present in this Sonarr library, not present in TVDB.
- **Calendar** is an upcoming episode window; **missing** means monitored wanted episodes.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- [Historical Sonarr CLI design](../../docs/superpowers/specs/2026-05-23-sonarr-agent-cli-design.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `src/operations.ts`, and tests.
