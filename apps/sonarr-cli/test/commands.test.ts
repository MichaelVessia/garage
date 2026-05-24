import { assert, it } from '@effect/vitest'
import { SonarrApi, SonarrConfig, envMissing } from '@garage/sonarr'
import { Effect, Layer, Option } from 'effect'

import { executeSonarr } from '../src/index.js'

const severanceLookup = {
  title: 'Linux ISO Weekly',
  year: 2022,
  tvdbId: 371_980,
  tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
  imdbId: 'tt0000001',
  tmdbId: 95_396,
  status: 'continuing',
  network: 'MirrorNet',
  genres: ['Documentary', 'Technology'],
  runtime: 49,
  firstAired: '2022-02-18T00:00:00Z',
  remotePoster: 'https://example.com/linux-iso-weekly.jpg',
  overview: 'A weekly digest of totally legitimate Linux ISO release candidates.',
}
const severanceSeries = {
  id: 42,
  title: 'Linux ISO Weekly',
  tvdbId: 371_980,
  year: 2022,
  path: '/tv/Linux ISO Weekly',
  monitored: true,
  status: 'continuing',
  qualityProfileId: 1,
  qualityProfileName: 'HD-1080p',
  network: 'MirrorNet',
  seasonFolder: true,
  seriesType: 'standard',
  statistics: {
    seasonCount: 2,
    episodeFileCount: 19,
    episodeCount: 19,
    totalEpisodeCount: 19,
    sizeOnDisk: 123_456,
    percentOfEpisodes: 100,
  },
}

const ConfigLayer = Layer.succeed(SonarrConfig, {
  get: Effect.succeed({
    url: 'http://sonarr.example.test',
    apiKey: 'secret',
    defaultQualityProfileId: 1,
  }),
})

const MissingConfigLayer = Layer.succeed(SonarrConfig, {
  get: Effect.fail(envMissing('SONARR_URL')),
})

const ApiLayer = Layer.succeed(SonarrApi, {
  status: Effect.succeed({
    appName: 'Sonarr',
    version: '4.0.0',
    instanceName: 'Sonarr',
    runtimeVersion: '6.0.13',
    databaseVersion: '3.40.1',
    startupPath: '/opt/Sonarr',
    appData: '/var/lib/sonarr',
    mode: 'console',
    authentication: 'forms',
    startTime: '2026-04-16T11:59:52Z',
    urlBase: '',
    isDocker: true,
    branch: 'main',
  }),
  rootFolders: Effect.succeed([{ id: 1, path: '/tv', freeSpace: 1_000_000, accessible: true, unmappedFolderCount: 0 }]),
  qualityProfiles: Effect.succeed([
    {
      id: 1,
      name: 'HD-1080p',
      isDefault: true,
      upgradeAllowed: true,
      cutoff: 4,
      minFormatScore: 0,
      cutoffFormatScore: 0,
    },
  ]),
  lookupSeries: (query) => Effect.succeed(query === 'Linux ISO' ? [severanceLookup] : []),
  lookupSeriesByTvdbId: (tvdbId) => Effect.succeed(tvdbId === 371_980 ? Option.some(severanceLookup) : Option.none()),
  getSeriesByTvdbId: (tvdbId) => Effect.succeed(tvdbId === 371_980 ? Option.some(severanceSeries) : Option.none()),
  addSeries: () => Effect.succeed(severanceSeries),
  removeSeries: () => Effect.void,
  queue: () =>
    Effect.succeed({
      count: 1,
      totalRecords: 66,
      records: [
        {
          id: 100,
          title: 'Linux.ISO.Weekly.S01E01.Ubuntu.LTS.1080p.WEB-DL',
          seriesTitle: 'Linux ISO Weekly',
          seasonNumber: 1,
          episodeNumber: 1,
          episodeTitle: 'Ubuntu LTS Mirror Tour',
          status: 'completed',
          trackedDownloadStatus: 'warning',
          trackedDownloadState: 'importBlocked',
          statusMessages: ['Automatic import is not possible.'],
          quality: 'WEBDL-1080p',
          languages: ['English'],
          size: 1000,
          sizeleft: 0,
          timeleft: '00:00:00',
          estimatedCompletionTime: '2026-05-24T04:17:15Z',
          protocol: 'usenet',
          downloadClient: 'SABnzbd',
          indexer: 'NZBgeek (Prowlarr)',
          outputPath: '/downloads/Linux.ISO.Weekly.S01E01.Ubuntu.LTS.1080p.WEB-DL/',
        },
      ],
    }),
  calendar: () =>
    Effect.succeed([
      {
        id: 200,
        title: 'Next ISO Drop',
        seriesTitle: 'Linux ISO Weekly',
        seasonNumber: 1,
        episodeNumber: 1,
        airDateUtc: '2026-05-24',
        hasFile: false,
        monitored: true,
        seriesStatus: 'continuing',
        network: 'MirrorNet',
        overview: 'A suspiciously well-seeded release candidate appears.',
      },
    ]),
  missing: () =>
    Effect.succeed({
      count: 1,
      totalRecords: 1338,
      records: [
        {
          id: 300,
          title: 'Checksum Mismatch',
          seriesTitle: 'Linux ISO Weekly',
          seasonNumber: 1,
          episodeNumber: 1,
          airDateUtc: '2026-05-20',
          hasFile: false,
          monitored: true,
          seriesStatus: 'continuing',
          network: 'MirrorNet',
          lastSearchTime: '2026-05-21T00:00:00Z',
          overview: 'The SHA256 sum refuses to cooperate.',
        },
      ],
    }),
  history: () =>
    Effect.succeed({
      count: 1,
      totalRecords: 13_124,
      records: [
        {
          id: 400,
          date: '2026-05-24T02:29:14Z',
          eventType: 'grabbed',
          sourceTitle: 'Linux.ISO.Weekly.S01E01.Ubuntu.LTS.1080p.WEB-DL',
          seriesTitle: 'Linux ISO Weekly',
          seasonNumber: 1,
          episodeNumber: 1,
          episodeTitle: 'Ubuntu LTS Mirror Tour',
          quality: 'WEBDL-1080p',
          languages: ['English'],
          downloadClient: 'SABnzbd',
          releaseGroup: 'GROUP',
          size: 1000,
          downloadId: 'SABnzbd_nzo_1',
        },
      ],
    }),
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
    const envelope = yield* executeSonarr(['search', 'Linux ISO']).pipe(Effect.provide(LiveTestLayer))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }

    assert.deepStrictEqual(envelope.result, {
      query: 'Linux ISO',
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

it.effect('exists false suggests adding the selected TVDB ID', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr(['exists', '12345']).pipe(Effect.provide(LiveTestLayer))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }

    assert.deepStrictEqual(envelope.result, { tvdbId: 12_345, exists: false })
    assert.deepStrictEqual(envelope.next_actions, [
      {
        command: 'sonarr add <tvdb-id> [--quality-profile <quality-profile-id>] [--no-search]',
        description: 'Add this TVDB series to Sonarr',
        params: {
          'tvdb-id': { value: 12_345, description: 'TVDB series ID' },
          'quality-profile-id': { default: 1, description: 'Sonarr quality profile ID' },
        },
      },
    ])
  })
)

it.effect('add command parses quality overrides and search suppression', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr(['add', '371980', '--quality-profile', '7', '--no-search']).pipe(
      Effect.provide(LiveTestLayer)
    )

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'sonarr add 371980 --quality-profile 7 --no-search',
      result: {
        added: true,
        series: severanceSeries,
        qualityProfileId: 7,
        rootFolderPath: '/tv',
        searchForMissingEpisodes: false,
      },
      next_actions: [],
    })
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

it.effect('confirmed remove delete-files reaches the domain operation', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr(['remove', '371980', '--delete-files', '--confirm-delete-files']).pipe(
      Effect.provide(LiveTestLayer)
    )

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'sonarr remove 371980 --delete-files --confirm-delete-files',
      result: { removed: true, tvdbId: 371_980, deleteFiles: true },
      next_actions: [],
    })
  })
)

it.effect('unknown flags render usage errors', () =>
  Effect.gen(function* () {
    const envelope = yield* executeSonarr(['queue', '--wat']).pipe(Effect.provide(LiveTestLayer))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'sonarr queue --wat',
      error: {
        code: 'SONARR_CLI_USAGE',
        message: 'Unknown flag --wat',
      },
      fix: 'Run sonarr to inspect available commands and required arguments.',
      next_actions: [{ command: 'sonarr', description: 'Show available commands' }],
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
      totalRecords: 66,
      records: [
        {
          id: 100,
          title: 'Linux.ISO.Weekly.S01E01.Ubuntu.LTS.1080p.WEB-DL',
          seriesTitle: 'Linux ISO Weekly',
          seasonNumber: 1,
          episodeNumber: 1,
          episodeTitle: 'Ubuntu LTS Mirror Tour',
          status: 'completed',
          trackedDownloadStatus: 'warning',
          trackedDownloadState: 'importBlocked',
          statusMessages: ['Automatic import is not possible.'],
          quality: 'WEBDL-1080p',
          languages: ['English'],
          size: 1000,
          sizeleft: 0,
          timeleft: '00:00:00',
          estimatedCompletionTime: '2026-05-24T04:17:15Z',
          protocol: 'usenet',
          downloadClient: 'SABnzbd',
          indexer: 'NZBgeek (Prowlarr)',
          outputPath: '/downloads/Linux.ISO.Weekly.S01E01.Ubuntu.LTS.1080p.WEB-DL/',
        },
      ],
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
