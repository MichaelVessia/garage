# Jellyfin

## Purpose

This context provides operational and media-library observation for one Jellyfin server, plus explicitly confirmed scheduled-task starts, through the `jellyfin` CLI.

## Ubiquitous language

- **Library**: a Jellyfin virtual folder; **library statistics** are aggregate item counts and are not the same object.
- **Session**: a connected Jellyfin client session. **Now playing** is the subset carrying current media.
- **Item**: a media record; search is currently limited to movies, series, and episodes.
- **Recently added**: latest visible media for the selected media visibility user.
- **Scheduled task**: a Jellyfin maintenance task that can be listed and started.
- **Media visibility user**: the enabled user explicitly named by `JELLYFIN_USER_ID`, or the sole enabled administrator when no override is configured.

## Responsibilities

- Read system status, users, libraries, sessions, now-playing projections, recent items, search results, item counts, and scheduled tasks.
- Select one deterministic media visibility user for user-scoped media endpoints.
- Start a scheduled task after CLI confirmation.
- Own `x-emby-token` HTTP requests, wire normalization, operations, and typed errors.

## Non-responsibilities

- It does not control playback or mutate sessions.
- It does not ingest/delete media, edit metadata, administer users/libraries, or create scheduled tasks.
- It does not authenticate as an end user, combine visibility across users, or mint user login tokens.
- It does not search every Jellyfin media type.

## Important domain objects

`SystemStatus`, `UserRecord`, `LibraryRecord`, `SessionRecord`, `NowPlayingRecord`, `ItemRecord`, `LibraryStats`, `ScheduledTaskRecord`, and `RunTaskResult` form the public model.

## Invariants and compatibility contracts

- Bounded recent/search operations default to 10 records.
- `nowPlaying` includes only sessions with current media and recomputes its count.
- Latest/search honor an enabled `JELLYFIN_USER_ID`; without one, they require exactly one enabled administrator.
- Missing or disabled configured users, zero enabled administrators, and multiple enabled administrators fail before a user-scoped item request.
- Search includes only `Movie`, `Series`, and `Episode` item types.
- Starting a task is a package capability but the CLI must require `--confirm-run-task` before invoking it.
- Root missing configuration is recoverable; subcommands return typed error envelopes.
- All invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/jellyfin` owns the Jellyfin API port, PascalCase/null wire translation, media visibility policy, operations, errors, and HTTP adapter. Live configuration requires `JELLYFIN_URL` and redacted `JELLYFIN_API_KEY`; optional non-secret `JELLYFIN_USER_ID` selects the enabled user whose library visibility applies and may be required when there is not exactly one enabled administrator. It depends on Effect and `@garage/cli-protocol`; it does not depend on Jellyseerr or another media context.

## Package and app relationship

`apps/jellyfin-cli` parses commands/limits/task IDs, adds next actions and the task confirmation gate, composes Bun HTTP/config layers, and invokes the package through its public barrel.

## Known ambiguities

- The sessions endpoint is described as **active sessions** without an additional activity filter.
- `NowPlayingRecord` exposes more optional fields than the current projection fills.
- **Library** may mean virtual folder, media collection, or aggregate counts; qualify it.
- An explicitly configured non-administrator may have narrower media visibility than an administrator.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `src/operations.ts`, and tests.
