import { assert, it } from '@effect/vitest'
import { SonarrApi, SonarrConfig, envMissing } from '@garage/sonarr'
import { Effect, Layer, Option } from 'effect'

import { executeSonarr } from '../src/index.js'

const severanceLookup = {
  title: 'Severance',
  year: 2022,
  tvdbId: 371_980,
  tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
}
const severanceSeries = { id: 42, title: 'Severance', tvdbId: 371_980, year: 2022 }

const ConfigLayer = Layer.succeed(SonarrConfig, {
  get: Effect.succeed({
    url: 'http://sonarr.lan',
    apiKey: 'secret',
    defaultQualityProfileId: 1,
  }),
})

const MissingConfigLayer = Layer.succeed(SonarrConfig, {
  get: Effect.fail(envMissing('SONARR_URL')),
})

const ApiLayer = Layer.succeed(SonarrApi, {
  status: Effect.succeed({ appName: 'Sonarr', version: '4.0.0' }),
  rootFolders: Effect.succeed([{ id: 1, path: '/tv', freeSpace: 1_000_000 }]),
  qualityProfiles: Effect.succeed([{ id: 1, name: 'HD-1080p' }]),
  lookupSeries: (query) => Effect.succeed(query === 'Severance' ? [severanceLookup] : []),
  lookupSeriesByTvdbId: (tvdbId) => Effect.succeed(tvdbId === 371_980 ? Option.some(severanceLookup) : Option.none()),
  getSeriesByTvdbId: (tvdbId) => Effect.succeed(tvdbId === 371_980 ? Option.some(severanceSeries) : Option.none()),
  addSeries: () => Effect.succeed(severanceSeries),
  removeSeries: () => Effect.void,
  queue: Effect.succeed([{ title: 'Episode 1', seriesTitle: 'Severance', status: 'downloading' }]),
  calendar: () => Effect.succeed([{ title: 'Tomorrow', seriesTitle: 'Severance', airDateUtc: '2026-05-24' }]),
  missing: Effect.succeed([{ title: 'Missing 1', seriesTitle: 'Severance', airDateUtc: '2026-05-20' }]),
  history: () => Effect.succeed([{ title: 'Grabbed 1', seriesTitle: 'Severance', eventType: 'grabbed' }]),
})

const LiveTestLayer = Layer.mergeAll(ConfigLayer, ApiLayer)

it.effect('root command returns a self-documenting command tree and health summary', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr([]).pipe(Effect.provide(LiveTestLayer))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!('commands' in envelope.result)) {
      assert.fail('expected root command result')
    }

    assert.strictEqual(envelope.command, 'sonarr')
    assert.deepStrictEqual(envelope.result.health, { configured: true, appName: 'Sonarr', version: '4.0.0' })
    assert.deepStrictEqual(
      envelope.result.commands.map((command) => command.command),
      [
        'sonarr',
        'sonarr status',
        'sonarr config',
        'sonarr search <query>',
        'sonarr exists <tvdb-id>',
        'sonarr add <tvdb-id> [--quality-profile <quality-profile-id>] [--no-search]',
        'sonarr remove <tvdb-id> [--delete-files] [--confirm-delete-files]',
        'sonarr queue [--limit <n>]',
        'sonarr calendar [--days <n>]',
        'sonarr missing [--limit <n>]',
        'sonarr history [--limit <n>]',
      ]
    )
  })
)

it.effect('root command still returns the command tree when credentials are missing', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr([]).pipe(Effect.provide(Layer.mergeAll(MissingConfigLayer, ApiLayer)))

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
        command: 'sonarr',
        description: 'Open a fresh shell after SONARR_URL and SONARR_API_KEY are exported',
      },
    ])
  })
)

it.effect('missing env on subcommands renders a recoverable error envelope', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr(['status']).pipe(Effect.provide(Layer.mergeAll(MissingConfigLayer, ApiLayer)))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'sonarr status',
      error: {
        code: 'SONARR_ENV_MISSING',
        message: 'SONARR_URL is not set',
      },
      fix: 'Open a fresh shell so sops-nix exports SONARR_URL and SONARR_API_KEY from modules/programs/shell.nix.',
      next_actions: [{ command: 'sonarr', description: 'Show available commands' }],
    })
  })
)

it.effect('search responses include contextual next actions with TVDB IDs', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr(['search', 'Severance']).pipe(Effect.provide(LiveTestLayer))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }

    assert.deepStrictEqual(envelope.result, {
      query: 'Severance',
      count: 1,
      results: [severanceLookup],
    })
    assert.deepStrictEqual(envelope.next_actions, [
      {
        command: 'sonarr exists <tvdb-id>',
        description: 'Check whether a selected series is already in the library',
        params: { 'tvdb-id': { value: 371_980, description: 'TVDB series ID' } },
      },
      {
        command: 'sonarr add <tvdb-id> [--quality-profile <quality-profile-id>] [--no-search]',
        description: 'Add a selected series to Sonarr',
        params: {
          'tvdb-id': { value: 371_980, description: 'TVDB series ID' },
          'quality-profile-id': { default: 1, description: 'Sonarr quality profile ID' },
        },
      },
    ])
  })
)

it.effect('remove delete-files requires explicit confirmation', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr(['remove', '371980', '--delete-files']).pipe(Effect.provide(LiveTestLayer))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'sonarr remove 371980 --delete-files',
      error: {
        code: 'SONARR_DELETE_CONFIRMATION_REQUIRED',
        message: 'Deleting files requires --confirm-delete-files',
      },
      fix: 'Re-run with --confirm-delete-files only if you intend to delete media files from disk.',
      next_actions: [
        {
          command: 'sonarr remove <tvdb-id>',
          description: 'Remove the series from Sonarr while keeping files on disk',
          params: { 'tvdb-id': { value: 371_980, description: 'TVDB series ID' } },
        },
      ],
    })
  })
)

it.effect('bounded list commands expose next actions for larger limits', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr(['queue']).pipe(Effect.provide(LiveTestLayer))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }

    assert.deepStrictEqual(envelope.result, {
      count: 1,
      records: [{ title: 'Episode 1', seriesTitle: 'Severance', status: 'downloading' }],
    })
    assert.deepStrictEqual(envelope.next_actions, [
      {
        command: 'sonarr queue --limit <n>',
        description: 'Return more active queue records',
        params: { limit: { default: 10, description: 'Maximum records to return' } },
      },
    ])
  })
)
