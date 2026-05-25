import { assert, it } from '@effect/vitest'
import { JellyseerrApi, JellyseerrConfig, envMissing } from '@garage/jellyseerr'
import type { RequestListOptions, SearchOptions } from '@garage/jellyseerr'
import { Effect, Layer, Ref } from 'effect'

import type { RootResult } from '../src/command-tree.js'
import { executeJellyseerr } from '../src/index.js'
import type { JellyseerrCliResult } from '../src/index.js'

const media = { id: 7, tmdbId: 95_396, mediaType: 'tv', status: 5, title: 'Linux ISO Weekly' }
const request = { id: 42, status: 1, type: 'tv', requestedBy: 'fixture-user', media }

const isRootResult = (result: JellyseerrCliResult): result is RootResult =>
  'name' in result && result.name === 'jellyseerr' && 'commands' in result && Array.isArray(result.commands)

const ConfigLayer = Layer.succeed(JellyseerrConfig, {
  get: () => Effect.succeed({ url: 'http://jellyseerr.example.test', apiKey: 'secret' }),
})

const MissingConfigLayer = Layer.succeed(JellyseerrConfig, {
  get: () => Effect.fail(envMissing('JELLYSEERR_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const requestOptions = yield* Ref.make<ReadonlyArray<RequestListOptions>>([])
  const searchOptions = yield* Ref.make<ReadonlyArray<SearchOptions>>([])
  const approvals = yield* Ref.make<ReadonlyArray<number>>([])
  const api = JellyseerrApi.of({
    status: () => Effect.succeed({ version: '2.0.0', commitTag: 'v2.0.0', updateAvailable: false }),
    requests: (options) =>
      Ref.update(requestOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, totalRecords: 3, records: [request] })
      ),
    requestCounts: () => Effect.succeed({ pending: 3, approved: 9 }),
    search: (options) =>
      Ref.update(searchOptions, (records) => [...records, options]).pipe(
        Effect.as({ count: 1, totalRecords: 1, records: [{ id: 95_396, mediaType: 'tv', title: 'Linux ISO Weekly' }] })
      ),
    mediaStatus: () => Effect.succeed(media),
    recentlyAdded: () => Effect.succeed({ count: 1, totalRecords: 1, records: [media] }),
    approve: (requestId) => Ref.update(approvals, (records) => [...records, requestId]).pipe(Effect.as(request)),
    decline: () => Effect.succeed({ ...request, status: 3 }),
    deleteRequest: (requestId) => Effect.succeed({ deleted: true, requestId, httpStatus: 204 }),
    users: () =>
      Effect.succeed({
        count: 1,
        totalRecords: 1,
        records: [
          { id: 1, email: 'user@example.test', displayName: 'Test User', username: 'fixture-user', permissions: 1 },
        ],
      }),
    issues: () => Effect.succeed({ count: 1, totalRecords: 1, records: [{ id: 9, issueType: 'video', media }] }),
  })

  return { layer: Layer.succeed(JellyseerrApi, api), requestOptions, searchOptions, approvals }
})

it.effect('root command returns a self-documenting command tree and health summary', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeJellyseerr([]).pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!isRootResult(envelope.result)) {
      assert.fail('expected root command result')
    }

    assert.deepStrictEqual(envelope.result.health, { configured: true, version: '2.0.0' })
    assert.deepStrictEqual(
      envelope.result.commands.map((command) => command.command),
      [
        'jellyseerr',
        'jellyseerr status',
        'jellyseerr requests [--all] [--limit <n>]',
        'jellyseerr request-counts',
        'jellyseerr search <query> [--limit <n>]',
        'jellyseerr media-status <media-id>',
        'jellyseerr recently-added [--limit <n>]',
        'jellyseerr approve <request-id> [--confirm-approve]',
        'jellyseerr decline <request-id> [--confirm-decline]',
        'jellyseerr delete-request <request-id> [--confirm-delete-request]',
        'jellyseerr users [--limit <n>]',
        'jellyseerr issues [--limit <n>]',
      ]
    )
  })
)

it.effect('root command still returns command tree when env is missing', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeJellyseerr([]).pipe(Effect.provide(Layer.mergeAll(MissingConfigLayer, fake.layer)))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!('health' in envelope.result)) {
      assert.fail('expected root command result')
    }
    assert.deepStrictEqual(envelope.result.health, { configured: false })
  })
)

it.effect('missing env on subcommands renders a recoverable error envelope', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeJellyseerr(['status']).pipe(
      Effect.provide(Layer.mergeAll(MissingConfigLayer, fake.layer))
    )

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'jellyseerr status',
      error: { code: 'JELLYSEERR_ENV_MISSING', message: 'JELLYSEERR_URL is not set' },
      fix: 'Open a fresh shell so sops-nix exports JELLYSEERR_URL and JELLYSEERR_API_KEY from modules/programs/shell.nix.',
      next_actions: [{ command: 'jellyseerr', description: 'Show available commands' }],
    })
  })
)

it.effect('requests and search parse filters and limits', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    yield* executeJellyseerr(['requests', '--all', '--limit', '5']).pipe(Effect.provide(layer))
    yield* executeJellyseerr(['search', 'Linux', 'ISO', '--limit', '4']).pipe(Effect.provide(layer))
    const requestOptions = yield* Ref.get(fake.requestOptions)
    const searchOptions = yield* Ref.get(fake.searchOptions)

    assert.deepStrictEqual(requestOptions, [{ limit: 5, filter: 'all' }])
    assert.deepStrictEqual(searchOptions, [{ query: 'Linux ISO', limit: 4 }])
  })
)

it.effect('approve requires explicit confirmation before mutation', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    const blocked = yield* executeJellyseerr(['approve', '42']).pipe(Effect.provide(layer))
    const allowed = yield* executeJellyseerr(['approve', '42', '--confirm-approve']).pipe(Effect.provide(layer))
    const approvals = yield* Ref.get(fake.approvals)

    assert.deepStrictEqual(blocked, {
      ok: false,
      command: 'jellyseerr approve 42',
      error: { code: 'JELLYSEERR_CONFIRMATION_REQUIRED', message: 'Approve request requires --confirm-approve' },
      fix: 'Re-run with --confirm-approve only after user confirmation.',
      next_actions: [
        {
          command: 'jellyseerr approve <request-id> --confirm-approve',
          description: 'Approve request after user confirmation',
          params: { 'request-id': { value: 42, description: 'Jellyseerr request ID' } },
        },
      ],
    })
    assert.strictEqual(allowed.ok, true)
    assert.deepStrictEqual(approvals, [42])
  })
)

it.effect('remaining commands dispatch successfully', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    const counts = yield* executeJellyseerr(['request-counts']).pipe(Effect.provide(layer))
    const mediaStatus = yield* executeJellyseerr(['media-status', '7']).pipe(Effect.provide(layer))
    const recent = yield* executeJellyseerr(['recently-added']).pipe(Effect.provide(layer))
    const declined = yield* executeJellyseerr(['decline', '42', '--confirm-decline']).pipe(Effect.provide(layer))
    const deleted = yield* executeJellyseerr(['delete-request', '42', '--confirm-delete-request']).pipe(
      Effect.provide(layer)
    )
    const users = yield* executeJellyseerr(['users']).pipe(Effect.provide(layer))
    const issues = yield* executeJellyseerr(['issues']).pipe(Effect.provide(layer))

    assert.strictEqual(counts.ok, true)
    assert.strictEqual(mediaStatus.ok, true)
    assert.strictEqual(recent.ok, true)
    assert.strictEqual(declined.ok, true)
    assert.strictEqual(deleted.ok, true)
    assert.strictEqual(users.ok, true)
    assert.strictEqual(issues.ok, true)
  })
)
