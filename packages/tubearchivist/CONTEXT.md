# TubeArchivist

## Purpose

This context observes and operates a TubeArchivist video archive through its session-authenticated API and the `tubearchivist` CLI.

## Ubiquitous language

- **Channel**, **video**, and **playlist**: indexed archive catalog records.
- **Download**: a TubeArchivist pending-queue record; status remains an upstream string.
- **Task**: a Celery background-task record, not a user task.
- **Subscription**: TubeArchivist's channel subscription state.
- **Subscribe target**: a channel URL or ID accepted for queued resolution.
- **Session**: a cached `sessionid` plus CSRF token used for authenticated requests.
- **Search result**: separately bounded video, channel, and playlist groups.

## Responsibilities

- Read health/config/stats, channels, videos, playlists, downloads, Celery tasks, and cross-category search.
- Subscribe to or explicitly confirmed unsubscribe from a channel.
- Own login, session/CSRF behavior, one authentication refresh/retry, API mapping, operations, and errors.
- Define reusable session-cache semantics and provide an in-memory implementation.

## Non-responsibilities

- It does not delete catalog entities, queue specific video downloads, retry/cancel work, edit settings, or mark videos watched.
- It does not administer users.
- It does not interpret raw status configuration or every task/download state into closed domain enums.
- It does not expose credentials, cookies, or CSRF tokens in telemetry/output.

## Important domain objects

`ChannelRecord`, `VideoRecord`, `PlaylistRecord`, `DownloadRecord`, `TaskRecord`, `SearchResult`, `SubscriptionResult`, `SessionCookies`, and `TubearchivistConfigValue` form the public model.

## Invariants and compatibility contracts

- Bounded lists default to 25; search applies the limit independently to each result category.
- List counts describe returned records; total/more-available use upstream pagination when present.
- Unsubscribe cannot reach the API unless confirmation is true; the CLI maps this to `--confirm-unsubscribe`.
- Login requires both session and CSRF cookies; mutations send cookie, CSRF, and referer headers.
- A 401/403 causes one fresh login and one retry, never an unbounded loop.
- Persistent cache keys derive from normalized URL plus username; files/directories use restrictive permissions and cache failures are fail-soft.
- All invocations obey the shared one-envelope stdout contract.

## Boundaries and dependencies

`packages/tubearchivist` owns API/session protocol, operations, cache interface/memory semantics, and domain mapping. Live configuration requires `TUBEARCHIVIST_URL`, `TUBEARCHIVIST_USERNAME`, and redacted `TUBEARCHIVIST_PASSWORD`. `apps/tubearchivist-cli` owns filesystem persistence policy and Bun HTTP/filesystem/path implementations.

## Package and app relationship

The app parses commands, adds next actions/confirmation, provides the filesystem session cache, composes live layers, and delegates to `@garage/tubearchivist`.

## Known ambiguities

- **Channel** may mean catalog record, subscription target, or stats category; qualify it.
- **Downloads** means the exposed queue endpoint, not necessarily only one status.
- **Status** combines health, raw app config, and several stats documents.
- Subscribe accepts URL or ID; unsubscribe is effectively channel-ID based.
- Optional `active`, `subscribed`, and `watched` values distinguish absence from false.

## References

- [Effect services and layers guardrail](../../docs/guardrails/effect-services-and-layers.md)
- [CLI and workspace conventions](../../docs/reference/conventions.md)
- Evidence: `src/model.ts`, `src/api-schema.ts`, `src/http.ts`, `src/services.ts`, `apps/tubearchivist-cli/src/session-cache.ts`, and tests.
