# Architecture and Effect Service Implementation Plan

Date: 2026-08-01
Status: in progress
Delivery: sequential, direct-to-`master` conventional commits
Baseline: `7833fddd` (`bun run validate` green)

## Goal

Evolve Garage from a monorepo whose documentation assumes every project is an
HTTP-backed service package plus CLI into a personal side-project monorepo with:

- a unified, trustworthy engineering harness;
- Effect authority seams and requirement propagation that describe reality;
- stable agent-first CLI compatibility;
- shared packages only where repeated behavior has demonstrated a real seam;
- multiple supported workspace archetypes without moving existing workspaces;
- small, independently revertible commits that can safely land on `master`.

This plan combines the architectural audit and the Effect service-design audit.
It is intentionally incremental. It does not authorize a repository-wide
restructure.

## Non-negotiable compatibility surface

Throughout this program, preserve:

- one JSON envelope on stdout for every CLI invocation;
- existing `ok`, `command`, `result` / `error`, `fix`, and `next_actions` fields;
- existing command names, argument parsing, confirmation behavior, and next
  actions;
- existing process exit behavior;
- existing HTTP request semantics and service error codes;
- existing DataExport wire version and RPC success schemas unless a separate
  compatibility decision explicitly authorizes a change.

Any observable compatibility change is a stop condition. It requires explicit
approval, a changeset, and dedicated compatibility tests. None is expected by
this plan.

## Governing design decisions

1. Keep all HTTP `Config` services. Their cached, fallible `get()` preserves
   "unconfigured" as a recoverable health result.
2. Keep all external-system API services. They are authority seams over raw
   `HttpClient` or process technology.
3. Keep both `TailscaleProcess` and `TailscaleApi`. The former owns raw process
   execution; the latter owns Tailscale protocol sequencing, decode, and daemon
   policy.
4. Keep `TubearchivistSessionCache` and its memory/file adapters. They represent
   honest runtime variation.
5. Keep Subq repositories and policy services. Repair their dependency and
   error contracts rather than flattening them.
6. Replace only the unearned `CaddyConfigFile` service with a named Effect value
   requiring Effect's existing `FileSystem` capability.
7. Do not export broad `ApiTest` layers. Drive live adapters with the recording
   `HttpClient`; keep operation-specific complete fakes local to tests.
8. Do not mechanically add service-method spans. Commit `e39f7e34` deliberately
   established one public operation span plus useful technical subspans. Add a
   service-seam span only where a trace test demonstrates distinct value.
9. Preserve existing `FooApiLive` naming. Do not mechanically introduce
   `make`, `layerWithoutDependencies`, or assembled `layer` exports where the
   module does not own the concrete dependency choice.
10. Do not create speculative web `AuthApi`, download, or timezone services.
    Start with cohesive adapter functions and explicit values.

## Delivery protocol on `master`

Before each commit:

1. `git pull --ff-only`.
2. Confirm the previous commit's CI and release/version workflow have finished.
3. Confirm the working tree contains only the intended work. The current
   untracked `context.md` must remain untouched and unstaged unless the owner
   explicitly chooses another disposition.
4. Add a focused test that fails for the intended reason.
5. Implement only enough to make the focused test pass.
6. Run focused tests and workspace typechecks.
7. Run the applicable repository gate.
8. Inspect the diff for envelope, exit-code, stdout, secrets, generated output,
   vendored source, or unrelated changes.
9. Stage explicit paths only; never use a blind `git add .` while `context.md`
   remains untracked.
10. Commit with the message specified below and push.
11. Do not start the next direct-to-master commit until automation is green.

Rollback policy: revert the complete offending commit, run its focused checks
and the applicable gate, push the revert, and wait for automation. Do not amend
or force-push delivered commits.

## Dependency DAG

```text
M0 Contract baseline
├── M1 Subq backend correctness
│   └── M2 Subq web adapters
├── M3 Edge adapter cleanup
└── M4 HTTP requirement/wiring rollout
    └── M5 Architecture documentation
        └── M6 Validation and release hardening
            └── M7 Dependency pins and cli-protocol internals
                └── M8 Declarative command pilot
                    └── M9 Generator decision gate (deferred)
```

Conceptual work may fan out after M0, but shared-file commits and all pushes to
`master` serialize.

---

# M0 — Safety baseline and CLI contract lock

## M0.1 Resolve working-tree policy

Current state contains untracked `context.md`. Before implementation, choose one:

- leave it untracked and authorize explicit-path staging;
- move/preserve it elsewhere;
- commit it intentionally in a separate approved commit; or
- remove it intentionally.

The default for this plan is to leave it untouched and use explicit-path
staging. No plan commit should include it accidentally.

Commit: none.

## M0.2 Characterize JSON and exit behavior

Files:

- `packages/cli-protocol/test/envelope.test.ts`
- `scripts/public-schemas.test.ts`
- `scripts/live-cli-missing-env.test.ts`
- `scripts/cli-entrypoints.test.ts`

Steps:

1. Inventory existing assertions for success/error envelope fields, unknown
   commands, missing environment, stdout, and current process status.
2. Add only missing characterization tests:
   - exactly one parseable JSON value on stdout;
   - no informational prefix/suffix around the envelope;
   - complete success and error fields;
   - unknown-command behavior;
   - current root/missing-environment process status;
   - every CLI entrypoint delegates to `runCliMain`.
3. Do not change runtime code during this task.

Validation:

```sh
bunx vitest run \
  packages/cli-protocol/test/envelope.test.ts \
  scripts/public-schemas.test.ts \
  scripts/live-cli-missing-env.test.ts \
  scripts/cli-entrypoints.test.ts
bun run validate
```

Commit:

```text
test(architecture): lock CLI protocol compatibility
```

Stop if tests reveal that current runtime behavior differs from the intended
baseline. Resolve that product decision before proceeding.

Acceptance:

- compatibility behavior is executable, not prose-only;
- baseline `bun run validate` remains green;
- no production code changed.

---

# M1 — Repair Subq backend correctness and authority seams

Land each task as a separate commit.

## M1.1 Repair goal-bearing exports

Files:

- `apps/subq/src/data-export/data-export-service.ts`
- `apps/subq/test/data-export-service.test.ts`

Red tests:

1. Insert a goal for the requested user and another user.
2. Assert export succeeds and includes only the requested user's goal.
3. Set `TestClock` to a fixed instant and assert `exportedAt` matches it.

Implementation:

1. Add `user_id` to the `user_goals` projection so it satisfies `GoalRow`.
2. Preserve user filtering and `created_at DESC` ordering.
3. Replace `DateTime.nowUnsafe()` with `yield* DateTime.now`.
4. Keep `GoalRow`, `goalRowToDomain`, `UserGoal`, and DataExport version `2.0.0`
   unchanged.

Validation:

```sh
bunx vitest run apps/subq/test/data-export-service.test.ts
bun run --filter '@garage/subq' typecheck
```

Commit:

```text
fix(subq): restore goal data export correctness
```

Stop if the repair requires a database migration, export-version change, or
public `UserGoal` shape change.

## M1.2 Expose typed Stats failures

Files:

- `apps/subq/src/shared/stats/domain.ts`
- `apps/subq/src/shared/stats/rpc.ts`
- `apps/subq/src/stats/stats-service.ts`
- `apps/subq/test/stats-service.test.ts`

Red tests:

1. Force representative weight-query and injection-query SQL failures.
2. Assert `Effect.result` yields `StatsDatabaseError`, not a defect.
3. Insert malformed date/row data and assert Schema failure maps to the same
   tagged error.
4. Assert operation is stable (`query`) without asserting driver-specific cause
   details.

Implementation:

1. Change `StatsDatabaseError.operation` to the shared `DbOperation` schema.
2. Give all seven public Stats methods the `StatsDatabaseError` error channel.
3. Use `mapDbError(StatsDatabaseError, 'query')` around each public method.
4. Remove terminal `Effect.orDie` from expected SQL/decode paths.
5. Keep internal helpers raw enough that errors are mapped once at the public
   service method.
6. Add `error: StatsDatabaseError` to all seven Stats RPC definitions.
7. Keep successful RPC schemas, names, handlers, and web failure rendering
   unchanged.

Validation:

```sh
bunx vitest run apps/subq/test/stats-service.test.ts
bun run --filter '@garage/subq' typecheck
```

Commit:

```text
fix(subq): return typed stats database errors
```

Stop if `Schema.Defect` cannot cross RPC serialization without a deliberate wire
shape decision. Do not silently substitute a new public error shape.

## M1.3 Route goal history through `WeightLogRepo`

Files:

- `apps/subq/src/weight/weight-log-repo.ts`
- `apps/subq/test/weight-log-repo.test.ts`
- `apps/subq/src/goals/goal-service.ts`
- `apps/subq/test/goal-service.test.ts`

Red tests:

1. Insert weight rows out of chronological order.
2. Include another user's extreme rows.
3. Assert the repository returns the complete requested user's history in
   ascending datetime order.
4. Assert goal trajectory/projection ignores the other user and uses
   chronological data.

Implementation:

1. Add a domain-shaped repository method, preferably
   `listChronological(userId)`.
2. Keep SQL projection, user filtering, order, Schema decode, and DB error
   mapping inside `WeightLogRepo`.
3. Remove `SqlClient`, the local `WeightRow`, and direct `weight_logs` SQL from
   `GoalService`.
4. Map `WeightLog` values to the pure `buildGoalProgress` input in the service.
5. Preserve `GoalService`'s public `GoalDatabaseError` by translating repository
   errors at the application-service seam.
6. Do not change worker composition; existing repository/service Layers should
   remain sufficient.

Validation:

```sh
bunx vitest run \
  apps/subq/test/weight-log-repo.test.ts \
  apps/subq/test/goal-service.test.ts
bun run --filter '@garage/subq' typecheck
bun run --filter '@garage/subq' test
```

Commit:

```text
refactor(subq): route goal history through WeightLogRepo
```

Acceptance for M1:

- goal export, Stats errors, and goal trajectory are covered by focused tests;
- no service defects expected persistence/decode failures;
- `GoalService` no longer requires raw `SqlClient`;
- Subq typecheck and all 258+ tests are green;
- no migration or wire-version change occurred.

---

# M2 — Extract conservative Subq browser adapters

M2.1 and M2.2 may be prepared in parallel after M1, but commits serialize.

## M2.1 Extract Better Auth HTTP adapter functions

Files:

- new `apps/subq/web/src/adapter/better-auth-http.ts`
- `apps/subq/web/src/auth.ts`
- `apps/subq/web/src/errors.ts`
- new `apps/subq/web/test/better-auth-http.test.ts`

Design:

- use concrete Effect-returning functions requiring `HttpClient.HttpClient`;
- do not introduce `Context.Service` or a Layer yet;
- the adapter exclusively owns Better Auth paths, methods, request bodies,
  status checks, response decoding, and upstream message extraction;
- commands remain responsible for mapping adapter outcomes to UI messages.

Functions:

- `fetchSession`
- `signIn`
- `signUp`
- `signOut`
- `changePassword`

Tests with a canned `HttpClient`:

- endpoint/method/body per function;
- successful and null session decode;
- malformed response;
- upstream `{ message }` preservation;
- fallback text;
- transport failure;
- sign-out's existing always-successful UI behavior.

Keep `AppResources` as `Api | HttpClient.HttpClient`. Do not unseal web RPC
`ProtocolLive` as part of this extraction.

Validation:

```sh
bunx vitest run apps/subq/web/test/better-auth-http.test.ts
bun run --filter '@garage/subq' typecheck
```

Commit:

```text
refactor(subq): extract Better Auth web adapter
```

## M2.2 Resolve browser timezone once

Files:

- `apps/subq/web/src/entry.ts`
- `apps/subq/web/src/main.ts`
- `apps/subq/web/src/page/stats.ts`
- `apps/subq/web/test/main.story.test.ts`
- `apps/subq/web/test/stats.story.test.ts`

Design:

1. Resolve `Intl.DateTimeFormat().resolvedOptions().timeZone` at browser
   initialization.
2. Pass it through Foldkit flags/application initialization.
3. Store it in the root model or explicit application value.
4. Thread it into Stats fetch command construction.
5. Continue adding timezone only to day-of-week and frequency requests.
6. Do not add `Context.Reference` for one ambient read.

Red tests:

- initialization stores the supplied timezone;
- route entry and range changes emit `FetchStats` carrying it;
- goal save/delete refetches preserve it;
- no direct `Intl` read occurs in command execution.

Validation:

```sh
bunx vitest run \
  apps/subq/web/test/main.story.test.ts \
  apps/subq/web/test/stats.story.test.ts
bun run --filter '@garage/subq' typecheck
```

Commit:

```text
refactor(subq): make browser timezone explicit
```

## M2.3 Isolate browser download mechanics

Before coding, confirm Foldkit/Effect does not already provide an appropriate
browser download capability.

Files:

- new `apps/subq/web/src/adapter/browser-download.ts`
- `apps/subq/web/src/page/settings.ts`
- new `apps/subq/web/test/browser-download.test.ts`

Design:

```ts
downloadTextFile({ contents, filename, mediaType }): Effect<void, ...>
```

The function owns `Blob`, object URL creation/revocation, temporary anchor
creation/click/removal, and cleanup. It is a concrete browser adapter function,
not a Context service.

Keep JSON encoding, clock use, and filename policy in the Settings command.
Guarantee cleanup with Effect finalization on success and click failure.

Validation:

```sh
bunx vitest run \
  apps/subq/web/test/browser-download.test.ts \
  apps/subq/web/test/settings.story.test.ts
bun run --filter '@garage/subq' typecheck
bun run --filter '@garage/subq' test
```

Commit:

```text
refactor(subq): isolate browser file downloads
```

Acceptance for M2:

- external HTTP/browser mechanics are localized;
- timezone is explicit and deterministic;
- no new Context service, Reference, RPC surface, or generated web dist is
  committed;
- all Subq tests and typechecks pass.

---

# M3 — Simplify and test edge adapters

The three tasks touch disjoint areas and may be prepared in parallel. Push them
one at a time.

## M3.1 Replace `CaddyConfigFile` service with an Effect value

Files:

- `apps/caddy-cli/src/config-file.ts`
- `apps/caddy-cli/src/index.ts`
- `apps/caddy-cli/src/main.ts`
- `apps/caddy-cli/test/config-file.test.ts`
- `apps/caddy-cli/test/commands.test.ts`

Red tests:

- successful JSON object read;
- read failure includes requested path and existing error semantics;
- malformed and non-object JSON;
- unconfirmed reload performs zero reads;
- confirmed reload posts exactly the decoded object.

Implementation:

1. Delete `CaddyConfigFile` and `CaddyConfigFileLive`.
2. Export named `readCaddyConfigFile = Effect.fn('CaddyConfigFile.read')`
   requiring `FileSystem.FileSystem`.
3. Preserve `CADDY_DECODE_ERROR`, message, and fix semantics.
4. Make CLI context `CaddyApi | FileSystem.FileSystem`.
5. Call the read only after confirmation.
6. Provide `BunFileSystem.layer` directly at `main.ts`.
7. Replace service fakes with a local recording `FileSystem` test layer.

Validation:

```sh
bunx vitest run \
  apps/caddy-cli/test/config-file.test.ts \
  apps/caddy-cli/test/commands.test.ts
bun run --filter '@garage/caddy-cli' typecheck
```

Commit:

```text
refactor(caddy): replace config file service with effect
```

## M3.2 Lock TubeArchivist cache policy

Files:

- new/focused `apps/tubearchivist-cli/test/session-cache.test.ts`
- reduce cache-specific concerns in
  `apps/tubearchivist-cli/test/commands.test.ts` if appropriate

Characterize without production changes unless a test exposes a defect:

- UID preferred over USER;
- USER fallback;
- default `/tmp` and user values;
- URL/user-derived key remains filename-safe;
- missing/malformed reads become `Option.none`;
- read errors are fail-soft;
- recursive directory creation uses mode `0700`;
- writes use mode `0600`;
- serialized session round-trip;
- write errors are logged/ignored per current policy;
- real filesystem tests always clean temporary files.

Use an explicit ConfigProvider and recording filesystem. Do not rely on ambient
environment or permissive no-op defaults.

Validation:

```sh
bunx vitest run \
  apps/tubearchivist-cli/test/session-cache.test.ts \
  apps/tubearchivist-cli/test/commands.test.ts
bun run --filter '@garage/tubearchivist-cli' typecheck
```

Commit:

```text
test(tubearchivist): lock session cache policy
```

## M3.3 Add fully composed Tailscale wiring

Files:

- new `apps/tailscale-cli/test/wiring.test.ts`
- existing process/command tests only if fixture extraction is necessary

Test path:

```text
executeTailscale
  → TailscaleApiLive
  → TailscaleProcessLive
  → fake ChildProcessSpawner
```

Use `status --limit 1`; assert the envelope and exact executable/arguments.
Keep both services. Do not add blanket API forwarding spans. Add a distinct
service-seam span only in a later isolated change if a trace test proves it is
not duplicate telemetry.

Validation:

```sh
bunx vitest run \
  packages/tailscale/test/process.test.ts \
  apps/tailscale-cli/test/process.test.ts \
  apps/tailscale-cli/test/commands.test.ts \
  apps/tailscale-cli/test/wiring.test.ts
bun run --filter '@garage/tailscale' typecheck
bun run --filter '@garage/tailscale-cli' typecheck
```

Commit:

```text
test(tailscale): cover live process command wiring
```

---

# M4 — Narrow HTTP requirements and add live wiring coverage

Do not start a mechanical rollout. Pilot one workspace, review the result, then
apply the proven pattern one workspace per commit.

## M4.1 Jellyseerr pilot

Files:

- `packages/jellyseerr/src/operations.ts`
- `packages/jellyseerr/test/operations.test.ts`
- `apps/jellyseerr-cli/src/index.ts`
- new `apps/jellyseerr-cli/test/wiring.test.ts`
- existing HTTP/command tests as needed

Steps:

1. Prove API-only operations run with only a complete local `JellyseerrApi`.
2. Remove `JellyseerrConfig` from operation and CLI contexts where unused.
3. Keep Config and HttpClient requirements on `JellyseerrApiLive`.
4. Add `status` command wiring through `JellyseerrApiLive` and
   `makeRecordingHttpClient`.
5. Assert envelope, URL, method, auth, and request count.
6. Do not export a fake or add forwarding-method spans.

Validation:

```sh
bunx vitest run \
  packages/jellyseerr/test/operations.test.ts \
  packages/jellyseerr/test/http.test.ts \
  apps/jellyseerr-cli/test/wiring.test.ts \
  apps/jellyseerr-cli/test/commands.test.ts
bun run --filter '@garage/jellyseerr' typecheck
bun run --filter '@garage/jellyseerr-cli' typecheck
bun run validate
```

Commit:

```text
refactor(jellyseerr): narrow Effect requirements and test wiring
```

Pilot stop conditions:

- a supposedly API-only operation actually reads Config;
- a broad exported fake/helper is needed;
- CLI behavior changes;
- duplicate tracing is introduced;
- CI/release automation is not green.

## M4.2 Ordinary HTTP services

After accepting the pilot, land one commit per workspace in this suggested
risk order:

1. Caddy (after M3.1)
2. SABnzbd
3. AdGuard
4. AutoCaliWeb
5. Jellyfin
6. Immich
7. Prowlarr

For each workspace:

1. Narrow domain operations to the API service actually yielded.
2. Remove Config from CLI context aliases where no transitive Config consumer
   exists.
3. Make operation tests API-only.
4. Add one live adapter command wiring test with local Config and recording
   HttpClient.
5. Preserve request ordering, retry/concurrency behavior, error mapping,
   envelope, and operation-level spans.
6. Do not create a shared wiring helper unless repeated rollout evidence proves
   it would hide meaningful complexity; default is local fixtures.

Representative commands:

| Workspace | Wiring command |
|---|---|
| Caddy | `routes` or `/config/` path |
| SABnzbd | `status` |
| AdGuard | `status` (`/control/status`) |
| AutoCaliWeb | `book-info <uuid>` |
| Jellyfin | `status` |
| Immich | `status`, with exact multi-request assertions |
| Prowlarr | `status` |

Per-workspace validation:

```sh
bunx vitest run \
  packages/<svc>/test/operations.test.ts \
  packages/<svc>/test/http.test.ts \
  apps/<svc>-cli/test/wiring.test.ts \
  apps/<svc>-cli/test/commands.test.ts
bun run --filter '@garage/<svc>' typecheck
bun run --filter '@garage/<svc>-cli' typecheck
bun run validate
```

Commit template:

```text
refactor(<svc>): narrow Effect requirements and test wiring
```

## M4.3 Radarr and Sonarr exceptions

Land separately.

Radarr keeps Config only on:

- `config`
- `addMovie`
- `addCollection`

Sonarr keeps Config only on:

- `config`
- `addSeries`

Their top-level CLI contexts may remain broad because next-action generation
reads Config. Narrow internal helpers only when transitive requirements prove it
safe. Split operation tests into API-only and explicit Config-consuming cases.
Add status wiring tests through live adapters and recording HttpClient.

Validation includes all existing Sonarr service/observability tests.

Commits:

```text
refactor(radarr): narrow Effect requirements and test wiring
refactor(sonarr): narrow Effect requirements and test wiring
```

## M4.4 TubeArchivist exception

Files:

- `packages/tubearchivist/src/operations.ts`
- `packages/tubearchivist/test/operations.test.ts`
- `apps/tubearchivist-cli/src/index.ts`
- new `apps/tubearchivist-cli/test/wiring.test.ts`

Steps:

1. Narrow operations/CLI context to `TubearchivistApi` where truthful.
2. Keep Config + HttpClient + `TubearchivistSessionCache` requirements on
   `TubearchivistApiLive`.
3. Add `channels --limit 1` wiring with local Config, recording HttpClient, and
   `TubearchivistSessionCacheMemoryLive`.
4. Assert login cookie flow followed by authenticated GET and unchanged
   envelope.
5. Keep secrets/cookies out of telemetry and snapshots.

Commit:

```text
refactor(tubearchivist): narrow requirements and preserve cache wiring
```

Acceptance for M4:

- all 11 HTTP integrations have truthful operation requirements;
- each has one representative command-to-live-adapter wiring test;
- Tailscale remains process-backed;
- no broad fake, shared speculative helper, sealed infrastructure, or mass span
  change was introduced;
- every workspace lands in an independently revertible commit.

---

# M5 — Reconcile architecture and service-design documentation

Land after code establishes the patterns documentation will describe.

Files:

- `AGENTS.md`
- `README.md`
- `CONTEXT.md`
- `CONTRIBUTING.md`
- `docs/reference/conventions.md`
- `docs/guardrails/effect-services-and-layers.md`
- `docs/how-to/add-a-workspace.md`

Updates:

1. Document actual always-JSON output and complete envelope fields.
2. Document current exit behavior established by M0 tests.
3. Define workspace archetypes:
   - paired integration package + CLI;
   - standalone/local CLI;
   - shared/library package;
   - deployed application/worker/web app.
4. Treat HTTP and process execution as adapter variants, not universal
   repository taxonomy.
5. Keep existing workspaces in place; make the two-workspace split optional for
   future projects.
6. Correct package responsibilities to include `api-schema.ts`, `operations.ts`,
   and actual `services.ts` responsibility.
7. Clarify composition ownership:
   - app `main.ts` selects domain/config/platform Layers;
   - `runCliMain` owns shared executable bootstrap, observability, argv/stdio,
     JSON rendering, and Bun runtime.
8. Replace "every adapter ships a test layer" with truthful strategy:
   - unsealed live adapter;
   - canned infrastructure client;
   - local complete operation/command fakes;
   - honest `layerMemory` only when semantics warrant it.
9. Document Tailscale process and TubeArchivist cache exceptions.
10. Document operation-level span policy and rejection of duplicate forwarding
    spans.
11. Rewrite add-workspace instructions as an archetype chooser and remove stale
    beta.64 examples.
12. Do not impose retroactive README or workspace-move requirements.

Validation:

```sh
bunx vitest run \
  packages/cli-protocol/test/envelope.test.ts \
  packages/cli-protocol/test/root.test.ts \
  scripts/cli-entrypoints.test.ts
bun run format
```

Commit:

```text
docs: align CLI contract and service seam ownership
```

Stop if maintainers do not intend always-JSON/current exit behavior to remain
the compatibility contract. Resolve that before documenting it normatively.

---

# M6 — Harden validation and release automation

## M6.1 Broaden CLI release impact detection

Files:

- `scripts/cli-versioning.ts`
- `scripts/cli-versioning.test.ts`
- `docs/reference/conventions.md`
- `.github/workflows/release-cli-versions.yml` if descriptions change

Add table-driven path classes:

- paired app/package change → one CLI;
- `packages/cli-protocol/**` → all CLIs;
- root artifact input → all CLIs;
- docs/test-only/unrelated Subq-only change → no CLI, unless a global artifact
  input also changed.

Proposed global artifact inputs:

- `package.json`
- `bun.lock`
- `bun.nix`
- `flake.nix`
- `flake.lock`
- `tsconfig.base.json`
- shared CLI build/runtime configuration proven to affect binaries

Support normalized path separators. Document that a lockfile-only Subq
resolution change conservatively releases all CLIs.

Validation:

```sh
bunx vitest run scripts/cli-versioning.test.ts
bun run typecheck
```

Commit:

```text
fix(release): include shared artifact inputs
```

## M6.2 Add fast and release-grade gates

Files:

- `package.json`
- `.github/workflows/ci.yml`
- new `scripts/cli-smoke.sh`
- new `scripts/nix-smoke.sh`
- `README.md`
- `CONTRIBUTING.md`
- `AGENTS.md`

Scripts:

- `validate:fast`: current validation sequence;
- `validate`: compatibility alias to `validate:fast`;
- `validate:release`: fast validation + builds + compiled CLI smoke + Nix
  smoke.

CLI smoke:

- root and unknown-command invocation for one HTTP CLI and Tailscale;
- no live credentials;
- assert parseable envelope and current process status.

Nix smoke:

```sh
nix flake show --no-write-lock-file
nix build --no-link .#sonarr .#tailscale
```

CI should expose fast and release-grade jobs without running redundant work
where avoidable.

Commit:

```text
ci: add release-grade build and nix validation
```

## M6.3 Gate releases on successful CI

Files:

- `.github/workflows/release-cli-versions.yml`
- `.github/workflows/ci.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`

Design:

1. Trigger release from successful `workflow_run` completion on `master`.
2. Checkout `github.event.workflow_run.head_sha`, never moving `master`.
3. Retain bot-loop prevention.
4. Use non-cancelling branch concurrency so releases cannot race.
5. Do not rerun validation inside release; consume the exact validated SHA.

Validate workflow syntax with actionlint if available and manually inspect
failed/cancelled/successful/bot scenarios.

Commit:

```text
ci(release): wait for successful validation
```

Acceptance for M6:

- shared artifact inputs conservatively version affected CLIs;
- green CI means tests plus deliverable build confidence;
- releases run only for the exact successfully validated master SHA;
- bot commits cannot recurse and releases cannot race.

---

# M7 — Stabilize Effect dependencies and cli-protocol internals

These commits affect every CLI. Require explicit go/no-go immediately before
push and wait for release automation after each.

## M7.1 Exact-pin Effect beta and regenerate Nix data

Files:

- root and all first-party workspace `package.json` files;
- `bun.lock`;
- `bun.nix`;
- new `scripts/effect-pins.test.ts`;
- `docs/reference/conventions.md`;
- `docs/how-to/add-a-workspace.md`.

Red test:

- discover first-party manifests outside `repos/`;
- require runtime Effect/platform/SQL/vitest beta packages to use one exact beta;
- reject caret/tilde ranges;
- exclude unrelated tools/plugins that legitimately carry independent versions.

Implementation:

1. Change first-party `effect` and root `@effect/vitest` to exact
   `4.0.0-beta.93`.
2. Keep already exact platform/SQL packages at beta.93.
3. Run `bun install`.
4. Regenerate:

```sh
nix develop --command bun2nix -l bun.lock -o bun.nix
```

5. Verify regeneration is reproducible.
6. Document the single upgrade procedure.

Validation:

```sh
bunx vitest run scripts/effect-pins.test.ts
bun install --frozen-lockfile
nix develop --command bun2nix -l bun.lock | diff -u bun.nix -
bun run validate:release
```

Commit:

```text
chore(deps): exact-pin Effect beta.93
```

Stop if resolution changes runtime packages beyond the intended beta or Nix
output is not reproducible.

## M7.2 Split `cli-protocol` internally by change axis

This is an internal-module split, not yet a package split.

Files:

- `packages/cli-protocol/src/index.ts`
- new `envelope.ts`
- new `command.ts`
- new `root.ts`
- new `observability.ts`
- new `runtime.ts`
- split corresponding tests
- `scripts/cli-entrypoints.test.ts` if source assertions need path updates

Dependency direction:

```text
envelope ← command ← root/runtime
observability independent
index.ts = unchanged public barrel
```

Constraints:

- package exports and all public symbol names remain unchanged;
- do not add public subpaths;
- no temporary breadcrumb exports outside the public barrel;
- resolve cycles rather than hiding them;
- envelope bytes, parsing, root health, OTLP behavior, stdout, and process status
  remain unchanged.

Validation:

```sh
bunx vitest run packages/cli-protocol/test scripts/cli-entrypoints.test.ts
bun run --filter '@garage/cli-protocol' build
bun run validate:release
```

Commit:

```text
refactor(cli-protocol): split runtime change axes
```

Only after this internal split has proven stable should a separate proposal
consider extracting platform-neutral `cli-contract`, Bun runtime, or JSON HTTP
packages. Do not create those packages in this program.

---

# M8 — Pilot declarative command definitions

Pilot only. No rollout authorization is implied.

Target: Caddy's simple read commands after M3.1 and M7.2.

Files:

- `packages/cli-protocol/src/command.ts`
- `packages/cli-protocol/src/index.ts`
- `packages/cli-protocol/test/command.test.ts`
- `apps/caddy-cli/src/index.ts`
- `apps/caddy-cli/src/command-tree.ts`
- `apps/caddy-cli/test/commands.test.ts`

Steps:

1. Add golden tests for Caddy root metadata, command order, extra arguments, and
   representative envelopes.
2. Add the smallest descriptor/compiler that produces the existing
   `CommandDefinition`.
3. Migrate only no-argument read commands:
   - `config`
   - `routes`
   - `upstreams`
   - `pki-ca`
4. Keep confirmed `reload` imperative to prove coexistence.
5. Do not add a positional/flag DSL or migrate another CLI.
6. Record a keep/change/drop decision based on:
   - duplication removed;
   - Effect requirement inference;
   - readability;
   - test ergonomics;
   - ability to coexist with policy-heavy commands.

Validation:

```sh
bunx vitest run \
  packages/cli-protocol/test/command.test.ts \
  apps/caddy-cli/test/commands.test.ts
bun run --filter '@garage/caddy-cli' build
bun run validate:release
```

Commit:

```text
refactor(caddy): pilot declarative command definitions
```

Drop the experiment if it becomes a general DSL, changes tolerated input,
worsens type inference, or pressures `reload` into a shallow abstraction.

---

# M9 — Workspace generator decision gate

Do not implement a generator during the initial program.

A fresh generator plan may be written only after both conditions hold:

1. the M5 workspace-archetype documentation has been used successfully for a
   real new workspace; and
2. M8 has a recorded positive or qualified-positive decision.

Potential future scope:

- explicit `paired-service-cli` archetype;
- explicit `standalone-cli` archetype;
- current exact pins;
- package-name imports;
- selectable HTTP/process/file adapter variant;
- required tests/docs/changeset guidance;
- collision failure;
- data-oriented templates;
- golden file inventories;
- generated fixture typecheck/test/build.

Explicitly exclude bespoke deployed apps such as Subq. Never infer archetype
from the project name and never rewrite existing workspaces.

Expected outcome of this plan: M9 remains deferred.

---

# Parallel preparation and serialization map

May be prepared in parallel after M0:

- M1 Subq backend correctness;
- M3 Caddy/TubeArchivist/Tailscale edge work;
- after M1, M2 auth and timezone adapters.

After the Jellyseerr pilot, individual HTTP workspace patches may be prepared in
parallel, including Radarr/Sonarr/TubeArchivist exceptions.

Must serialize through one integrator:

- every direct-to-master push;
- `packages/cli-protocol/**` changes;
- root manifests, lockfile, and Nix data;
- root validation scripts;
- workflows and release automation;
- architecture documentation;
- Caddy command pilot.

Never start a new direct-to-master commit while the preceding CI or release
workflow is pending.

# Commit sequence summary

```text
test(architecture): lock CLI protocol compatibility
fix(subq): restore goal data export correctness
fix(subq): return typed stats database errors
refactor(subq): route goal history through WeightLogRepo
refactor(subq): extract Better Auth web adapter
refactor(subq): make browser timezone explicit
refactor(subq): isolate browser file downloads
refactor(caddy): replace config file service with effect
test(tubearchivist): lock session cache policy
test(tailscale): cover live process command wiring
refactor(jellyseerr): narrow Effect requirements and test wiring
refactor(caddy): narrow Effect requirements and test wiring
refactor(sabnzbd): narrow Effect requirements and test wiring
refactor(adguard): narrow Effect requirements and test wiring
refactor(autocaliweb): narrow Effect requirements and test wiring
refactor(jellyfin): narrow Effect requirements and test wiring
refactor(immich): narrow Effect requirements and test wiring
refactor(prowlarr): narrow Effect requirements and test wiring
refactor(radarr): narrow Effect requirements and test wiring
refactor(sonarr): narrow Effect requirements and test wiring
refactor(tubearchivist): narrow requirements and preserve cache wiring
docs: align CLI contract and service seam ownership
fix(release): include shared artifact inputs
ci: add release-grade build and nix validation
ci(release): wait for successful validation
chore(deps): exact-pin Effect beta.93
refactor(cli-protocol): split runtime change axes
refactor(caddy): pilot declarative command definitions
```

Some commits may be dropped if their red test does not demonstrate the claimed
problem or if the preceding pilot rejects the pattern. Do not combine commits
merely to shorten the list.

# Validation matrix

## Per focused change

- focused `bunx vitest run <files>`;
- affected workspace package/CLI typechecks;
- explicit diff review.

## Per Subq milestone

```sh
bun run --filter '@garage/subq' typecheck
bun run --filter '@garage/subq' test
```

## Per service/CLI workspace

```sh
bun run --filter '@garage/<svc>' typecheck
bun run --filter '@garage/<svc>-cli' typecheck
bun run validate
```

## Shared runtime, dependency, and release changes

After M6 establishes the gate:

```sh
bun run validate:fast
bun run build
bash scripts/cli-smoke.sh
bash scripts/nix-smoke.sh
bun run validate:release
```

## Final audit

1. `git status --short` matches the authorized `context.md` disposition.
2. No migrations, export version bump, generated web dist, or `repos/` edits.
3. No broad API fake, speculative Context service, public cli-protocol subpath,
   or mass Layer rename.
4. No unintended changesets.
5. Rerun:

```sh
bunx vitest run \
  packages/cli-protocol/test/envelope.test.ts \
  scripts/public-schemas.test.ts \
  scripts/live-cli-missing-env.test.ts \
  scripts/cli-entrypoints.test.ts
bun run validate:release
```

6. Exercise representative compiled CLIs and confirm one JSON envelope plus
   unchanged exit behavior.

# Global stop conditions

Stop the program and request an explicit decision if any of these occur:

- public CLI output, exit behavior, commands, or error codes would change;
- credentials, cookies, request bodies, authenticated URLs, or raw search text
  enter telemetry;
- a service begins sealing infrastructure below the composition root;
- `bun.lock` / `bun.nix` regeneration is not reproducible;
- a workflow can release a moving or unvalidated SHA;
- direct-to-master commits cannot remain independently revertible;
- a broad fake, generic registry, or command DSL is required to continue;
- shared-file conflicts or an in-flight release make sequencing unsafe;
- the untracked `context.md` cannot be kept out of staging.

# Explicit non-goals

- no envelope or exit-code redesign;
- no mass workspace moves, merges, or renames;
- no forced conversion of Tailscale or Subq to the HTTP integration shape;
- no broad exported `ApiTest` Layers;
- no generic wiring helper without proven repeated complexity;
- no mechanical adapter span rollout;
- no speculative Context services for Better Auth, download, timezone, or file
  reads;
- no package-level sealing of Config, HttpClient, filesystem, process, or cache;
- no Subq RPC protocol unsealing unless a separate transport test need appears;
- no database migration or DataExport version change;
- no generator until M9's evidence gates are satisfied;
- no edit to vendored `repos/effect-smol`.
