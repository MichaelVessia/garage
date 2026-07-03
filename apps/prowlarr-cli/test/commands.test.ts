import { assert, it } from '@effect/vitest'
import { ProwlarrApi, ProwlarrConfig, envMissing } from '@garage/prowlarr'
import type { SearchOptions } from '@garage/prowlarr'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'

import { executeProwlarr } from '../src/index.js'

const releaseRecords = [
  {
    guid: 'release-1',
    indexerId: 1,
    indexer: 'Mirror Indexer',
    title: 'Linux ISO 2026 1080p',
    protocol: 'torrent',
    size: 2_097_152,
    sizeMB: 2,
    seeders: 42,
    leechers: 1,
    grabs: 7,
    age: 1,
    publishDate: '2026-05-24T00:00:00Z',
    downloadUrl: 'https://example.test/download/1',
    infoUrl: 'https://example.test/info/1',
    categories: [2000],
  },
  {
    guid: 'release-2',
    indexerId: 2,
    indexer: 'Usenet Indexer',
    title: 'Linux ISO 2026 2160p',
    protocol: 'usenet',
    size: 4_194_304,
    sizeMB: 4,
    grabs: 2,
    age: 2,
    publishDate: '2026-05-23T00:00:00Z',
    downloadUrl: 'https://example.test/download/2',
    categories: [2000],
  },
]

const ConfigLayer = Layer.succeed(ProwlarrConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://prowlarr.example.test',
      apiKey: Redacted.make('secret'),
    }),
})

const MissingConfigLayer = Layer.succeed(ProwlarrConfig, {
  get: () => Effect.fail(envMissing('PROWLARR_URL')),
})

const makeApiLayer = Effect.gen(function* () {
  const searches = yield* Ref.make<ReadonlyArray<{ readonly query: string; readonly options: SearchOptions }>>([])
  const syncCount = yield* Ref.make(0)
  const layer = Layer.effect(
    ProwlarrApi,
    Effect.gen(function* () {
      const config = yield* ProwlarrConfig
      const configured = <A>(effect: Effect.Effect<A>) => config.get().pipe(Effect.andThen(effect))
      return ProwlarrApi.of({
        status: () =>
          configured(
            Effect.succeed({ appName: 'Prowlarr', version: '1.30.2', branch: 'main', runtimeVersion: '8.0.0' })
          ),
        health: () =>
          configured(Effect.succeed([{ source: 'Indexer', type: 'warning', message: 'Indexer unavailable' }])),
        indexers: () =>
          configured(
            Effect.succeed([
              { id: 1, name: 'Mirror Indexer', protocol: 'torrent', enabled: true, priority: 25, supportsSearch: true },
            ])
          ),
        indexerStats: () =>
          configured(
            Effect.succeed([
              {
                id: 1,
                name: 'Mirror Indexer',
                queries: 10,
                grabs: 2,
                failedQueries: 1,
                failedGrabs: 0,
                avgResponseTimeMs: 512,
              },
            ])
          ),
        search: (query, options) =>
          configured(
            Ref.update(searches, (records) => [...records, { query, options }]).pipe(Effect.as(releaseRecords))
          ),
        testIndexer: (indexerId) => configured(Effect.succeed({ indexerId, passed: true, httpStatus: 200 })),
        applications: () =>
          configured(
            Effect.succeed([{ id: 10, name: 'Sonarr', implementation: 'Sonarr', syncLevel: 'fullSync', tags: [1] }])
          ),
        sync: () =>
          configured(
            Ref.update(syncCount, (count) => count + 1).pipe(
              Effect.as({ id: 99, name: 'ApplicationIndexerSync', status: 'queued', queued: '2026-05-24T00:00:00Z' })
            )
          ),
        history: (limit) =>
          configured(
            Effect.succeed({
              count: 1,
              totalRecords: 100,
              records: [
                {
                  id: 100,
                  date: '2026-05-24T00:00:00Z',
                  eventType: 'query',
                  indexerId: 1,
                  successful: true,
                  query: `limit:${limit}`,
                  queryType: 'search',
                  results: 2,
                },
              ],
            })
          ),
      })
    })
  )

  return { layer, searches, syncCount }
})

it.effect('root command returns a self-documenting command tree and health summary', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeProwlarr([]).pipe(Effect.provide(fake.layer.pipe(Layer.provideMerge(ConfigLayer))))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!('commands' in envelope.result)) {
      assert.fail('expected root command result')
    }

    assert.strictEqual(envelope.command, 'prowlarr')
    assert.deepStrictEqual(envelope.result.health, { configured: true, appName: 'Prowlarr', version: '1.30.2' })
    assert.deepStrictEqual(
      envelope.result.commands.map((command) => command.command),
      [
        'prowlarr',
        'prowlarr status',
        'prowlarr health [--limit <n>]',
        'prowlarr indexers [--limit <n>]',
        'prowlarr indexer-stats [--limit <n>]',
        'prowlarr search <query>',
        'prowlarr tv-search --tvdb <id> [--season <n>] [--episode <n>]',
        'prowlarr movie-search --imdb <id> | --tmdb <id>',
        'prowlarr test <indexer-id>',
        'prowlarr apps [--limit <n>]',
        'prowlarr sync [--confirm-sync]',
        'prowlarr history [--limit <n>]',
      ]
    )
  })
)

it.effect('root command still returns the command tree when credentials are missing', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeProwlarr([]).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(MissingConfigLayer)))
    )

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!('health' in envelope.result)) {
      assert.fail('expected root command result')
    }

    assert.deepStrictEqual(envelope.result.health, { configured: false })
    assert.deepStrictEqual(envelope.next_actions, [
      {
        command: 'prowlarr',
        description: 'Open a fresh shell after PROWLARR_URL and PROWLARR_API_KEY are exported',
      },
    ])
  })
)

it.effect('missing env on subcommands renders a recoverable error envelope', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeProwlarr(['status']).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(MissingConfigLayer)))
    )

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'prowlarr status',
      error: {
        code: 'PROWLARR_ENV_MISSING',
        message: 'PROWLARR_URL is not set',
      },
      fix: 'Open a fresh shell so sops-nix exports PROWLARR_URL and PROWLARR_API_KEY from modules/programs/shell.nix.',
      next_actions: [{ command: 'prowlarr', description: 'Show available commands' }],
    })
  })
)

it.effect('search commands parse filters and bound results', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    const envelope = yield* executeProwlarr([
      'search',
      'Linux',
      'ISO',
      '--torrents',
      '--category',
      '2000',
      '--limit',
      '1',
    ]).pipe(Effect.provide(layer))
    const searches = yield* Ref.get(fake.searches)

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!('records' in envelope.result)) {
      assert.fail('expected search result')
    }

    assert.deepStrictEqual(searches, [
      { query: 'Linux ISO', options: { limit: 1, protocol: 'torrent', category: 2000, type: 'search' } },
    ])
    assert.strictEqual(envelope.result.count, 1)
    assert.strictEqual(envelope.result.totalRecords, 2)
  })
)

it.effect('tv and movie commands build structured Prowlarr searches', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    yield* executeProwlarr(['tv-search', '--tvdb', '81189', '--season', '1', '--episode', '2']).pipe(
      Effect.provide(layer)
    )
    yield* executeProwlarr(['movie-search', '--imdb', 'tt0111161']).pipe(Effect.provide(layer))
    const searches = yield* Ref.get(fake.searches)

    assert.deepStrictEqual(
      searches.map((record) => record.query),
      ['{TvdbId:81189} {Season:1} {Episode:2}', '{ImdbId:tt0111161}']
    )
    assert.deepStrictEqual(
      searches.map((record) => record.options),
      [
        { limit: 10, type: 'tvsearch' },
        { limit: 10, type: 'movie' },
      ]
    )
  })
)

it.effect('sync requires explicit confirmation before mutation', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = fake.layer.pipe(Layer.provideMerge(ConfigLayer))

    const blocked = yield* executeProwlarr(['sync']).pipe(Effect.provide(layer))
    const allowed = yield* executeProwlarr(['sync', '--confirm-sync']).pipe(Effect.provide(layer))
    const syncCount = yield* Ref.get(fake.syncCount)

    assert.deepStrictEqual(blocked, {
      ok: false,
      command: 'prowlarr sync',
      error: {
        code: 'PROWLARR_SYNC_CONFIRMATION_REQUIRED',
        message: 'Syncing indexers to connected applications requires --confirm-sync',
      },
      fix: 'Re-run with --confirm-sync only if you intend to push Prowlarr indexer config to all connected apps.',
      next_actions: [
        {
          command: 'prowlarr sync --confirm-sync',
          description: 'Push Prowlarr indexer config to all connected apps',
        },
      ],
    })
    assert.strictEqual(allowed.ok, true)
    assert.strictEqual(syncCount, 1)
  })
)

it.effect('history accepts wrapper-compatible positional limits', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const envelope = yield* executeProwlarr(['history', '25']).pipe(
      Effect.provide(fake.layer.pipe(Layer.provideMerge(ConfigLayer)))
    )

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!('records' in envelope.result)) {
      assert.fail('expected history result')
    }
    const [record] = envelope.result.records
    if (record === undefined || !('query' in record)) {
      assert.fail('expected history record')
    }
    assert.strictEqual(record.query, 'limit:25')
  })
)
