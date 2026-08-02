# Radarr

## Purpose

This context manages a Radarr movie library and observes its acquisition state through the Radarr API v3 and the `radarr` CLI.

## Ubiquitous language

- **Movie lookup result**: a Radarr/TMDB discovery candidate not necessarily present in the library.
- **Movie record**: a movie already owned by the configured Radarr library.
- **TMDB ID**: the public identity used by CLI lookup, existence, add/remove, and collection workflows.
- **Radarr movie ID**: Radarr's internal identity used after resolving a library record.
- **Collection**: a Radarr-known TMDB collection; public and internal collection IDs are distinct.
- **Wanted/missing movie**: a monitored movie returned by Radarr's wanted endpoint.
- **Queue**, **calendar**, and **history**: acquisition-state projections owned by Radarr.

## Responsibilities

- Read status, root folders, quality profiles, queue, calendar, missing movies, and history.
- Look up movies, test library membership, add/remove movies, and add all discoverable movies from a known collection.
- Choose the first root folder and apply configured/default quality and monitoring policy.
- Own API v3 mapping, `x-api-key` HTTP requests, typed errors, and domain workflows.

## Non-responsibilities

- It does not configure root folders, quality profiles, indexers, download clients, or queue entries.
- It does not search indexers or download files directly.
- It does not own TMDB; Radarr's lookup endpoint is the metadata authority.
- It does not offer root-folder selection policy beyond the first configured folder.

## Important domain objects

`MovieLookupResult`, `MovieRecord`, `MovieReleaseRecord`, `MovieCollectionSummary`, `CollectionRecord`, `RootFolder`, `QualityProfile`, `QueueRecord`, `HistoryRecord`, `AddMovieResult`, `AddCollectionResult`, and `RemoveMovieResult` form the public model.

## Invariants and compatibility contracts

- Add resolves a TMDB lookup and requires at least one root folder.
- New movies are monitored with minimum availability `released`; quality is an override or configured default, and add searches by default unless `--no-search` is supplied.
- Remove resolves TMDB ID to Radarr movie ID; import exclusion remains disabled.
- File deletion requires both `--delete-files` and `--confirm-delete-files`; preserving files needs no confirmation.
- Adding a collection requires `--confirm-add-collection`, a collection already known to Radarr, sequential per-movie processing, and per-item outcomes; the collection is then monitored with search-on-add enabled.
- Queue, missing, and history preserve upstream totals while bounding returned records; metadata search reports only its sliced count. Calendar defaults to 30 days.
- All invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/radarr` owns movie/collection policy, API anti-corruption, operations, configuration, and HTTP. Live configuration requires `RADARR_URL` and redacted `RADARR_API_KEY`; `RADARR_DEFAULT_QUALITY_PROFILE` is optional. It depends on Effect and `@garage/cli-protocol`, not on Prowlarr, Sonarr, or download-client packages.

## Package and app relationship

`apps/radarr-cli` parses TMDB IDs/options, builds contextual next actions, enforces destructive/bulk confirmations, composes Bun HTTP/config layers, and delegates to `@garage/radarr`.

## Known ambiguities

- **Search** means metadata lookup; add-time `searchForMovie` asks Radarr to seek a download.
- **Exists** means present in this Radarr library, not present in TMDB.
- Public collection ID is TMDB identity; adapter operations may use Radarr's internal collection ID.
- **Missing** means monitored wanted movies, not every absent movie.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `src/operations.ts`, and tests.
