import { assert, it } from '@effect/vitest'
import { RadarrApi, RadarrConfig, envMissing } from '@garage/radarr'
import type { MovieLookupResult, MovieRecord } from '@garage/radarr'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'

import { executeRadarr } from '../src/index.js'

const collection = { id: 7, title: 'Linux ISO Collection', tmdbId: 10, monitored: false, searchOnAdd: false }
const linuxIsoLookup = {
  title: 'Linux ISO: The Movie',
  year: 2024,
  tmdbId: 27_205,
  tmdbUrl: 'https://themoviedb.org/movie/27205',
  titleSlug: 'linux-iso-the-movie-2024',
  imdbId: 'tt0000001',
  status: 'released',
  genres: ['Documentary', 'Technology'],
  runtime: 120,
  studio: 'MirrorNet',
  certification: 'PG',
  physicalRelease: '2024-05-01T00:00:00Z',
  digitalRelease: '2024-04-01T00:00:00Z',
  overview: 'A totally legitimate distribution image gets its theatrical moment.',
  collection: { tmdbId: 10, title: 'Linux ISO Collection' },
}
const debianLookup = {
  title: 'Linux ISO: Debian Drift',
  year: 2025,
  tmdbId: 27_206,
  tmdbUrl: 'https://themoviedb.org/movie/27206',
  titleSlug: 'linux-iso-debian-drift-2025',
  collection: { tmdbId: 10, title: 'Linux ISO Collection' },
}
const linuxIsoMovie = {
  id: 42,
  title: 'Linux ISO: The Movie',
  tmdbId: 27_205,
  year: 2024,
  path: '/movies/Linux ISO The Movie (2024)',
  monitored: true,
  status: 'released',
  hasFile: true,
  qualityProfileId: 1,
  qualityProfileName: 'HD-1080p',
}

const ConfigLayer = Layer.succeed(RadarrConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://radarr.example.test',
      apiKey: Redacted.make('secret'),
      defaultQualityProfileId: 1,
    }),
})

const MissingConfigLayer = Layer.succeed(RadarrConfig, {
  get: () => Effect.fail(envMissing('RADARR_URL')),
})

const movieFromLookup = (lookup: MovieLookupResult): MovieRecord => ({
  id: lookup.tmdbId,
  title: lookup.title,
  tmdbId: lookup.tmdbId,
  year: lookup.year,
  path: `/movies/${lookup.title}`,
  monitored: true,
  status: 'released',
  hasFile: false,
  qualityProfileId: 1,
})

const lookupByTmdbId = (tmdbId: number): Option.Option<MovieLookupResult> => {
  const match = [linuxIsoLookup, debianLookup].find((lookup) => lookup.tmdbId === tmdbId)
  return match === undefined ? Option.none() : Option.some(match)
}

const ApiLayer = Layer.effect(
  RadarrApi,
  Effect.gen(function* () {
    const config = yield* RadarrConfig
    return RadarrApi.of({
      status: () =>
        config.get().pipe(
          Effect.as({
            appName: 'Radarr',
            version: '5.0.0',
            branch: 'main',
            runtimeVersion: '8.0.0',
          })
        ),
      rootFolders: () =>
        Effect.succeed([{ id: 1, path: '/movies', freeSpace: 1_000_000, accessible: true, unmappedFolderCount: 0 }]),
      qualityProfiles: () =>
        Effect.succeed([
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
      lookupMovies: (query) => Effect.succeed(query === 'Linux ISO' ? [linuxIsoLookup, debianLookup] : []),
      lookupMovieByTmdbId: (tmdbId) => Effect.succeed(lookupByTmdbId(tmdbId)),
      getMovieByTmdbId: (tmdbId) => Effect.succeed(tmdbId === 27_205 ? Option.some(linuxIsoMovie) : Option.none()),
      addMovie: (lookup) => Effect.succeed(movieFromLookup(lookup)),
      removeMovie: () => Effect.void,
      collections: () => Effect.succeed([collection]),
      setCollectionMonitoring: () => Effect.void,
      queue: () =>
        Effect.succeed({
          count: 1,
          totalRecords: 66,
          records: [
            {
              id: 100,
              title: 'Linux.ISO.The.Movie.2024.1080p.WEB-DL',
              movieTitle: 'Linux ISO: The Movie',
              year: 2024,
              status: 'completed',
              trackedDownloadStatus: 'warning',
              trackedDownloadState: 'importBlocked',
              statusMessages: ['Automatic import is not possible.'],
              quality: 'WEBDL-1080p',
              size: 1000,
              sizeleft: 0,
              timeleft: '00:00:00',
              estimatedCompletionTime: '2026-05-24T04:17:15Z',
              protocol: 'usenet',
              downloadClient: 'SABnzbd',
              indexer: 'NZBgeek (Prowlarr)',
              outputPath: '/downloads/Linux.ISO.The.Movie.2024.1080p.WEB-DL/',
            },
          ],
        }),
      calendar: () =>
        Effect.succeed([
          {
            id: 200,
            title: 'Linux ISO: Next Drop',
            year: 2026,
            tmdbId: 27_208,
            inCinemas: '2026-05-24T00:00:00Z',
            hasFile: false,
            monitored: true,
            status: 'released',
            isAvailable: true,
          },
        ]),
      missing: () =>
        Effect.succeed({
          count: 1,
          totalRecords: 1338,
          records: [
            {
              id: 300,
              title: 'Linux ISO: Missing Checksum',
              year: 2024,
              tmdbId: 27_209,
              physicalRelease: '2026-05-20T00:00:00Z',
              hasFile: false,
              monitored: true,
              status: 'released',
              isAvailable: true,
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
              sourceTitle: 'Linux.ISO.The.Movie.2024.1080p.WEB-DL',
              movieTitle: 'Linux ISO: The Movie',
              year: 2024,
              quality: 'WEBDL-1080p',
              downloadClient: 'SABnzbd',
              releaseGroup: 'GROUP',
              size: 1000,
              downloadId: 'SABnzbd_nzo_1',
            },
          ],
        }),
    })
  })
)

const LiveTestLayer = ApiLayer.pipe(Layer.provideMerge(ConfigLayer))
const MissingTestLayer = ApiLayer.pipe(Layer.provideMerge(MissingConfigLayer))

it.effect('root command returns a self-documenting command tree and health summary', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr([]).pipe(Effect.provide(LiveTestLayer))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }
    if (!('commands' in envelope.result)) {
      assert.fail('expected root command result')
    }

    assert.strictEqual(envelope.command, 'radarr')
    assert.deepStrictEqual(envelope.result.health, { configured: true, appName: 'Radarr', version: '5.0.0' })
    assert.deepStrictEqual(
      envelope.result.commands.map((command) => command.command),
      [
        'radarr',
        'radarr status',
        'radarr config',
        'radarr search <query>',
        'radarr exists <tmdb-id>',
        'radarr add <tmdb-id> [--quality-profile <quality-profile-id>] [--no-search]',
        'radarr add-collection <collection-tmdb-id> [--no-search] [--confirm-add-collection]',
        'radarr collection-info <collection-tmdb-id>',
        'radarr remove <tmdb-id> [--delete-files] [--confirm-delete-files]',
        'radarr queue [--limit <n>]',
        'radarr calendar [--days <n>]',
        'radarr missing [--limit <n>]',
        'radarr history [--limit <n>]',
      ]
    )
  })
)

it.effect('root command still returns the command tree when credentials are missing', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr([]).pipe(Effect.provide(MissingTestLayer))

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
        command: 'radarr',
        description: 'Open a fresh shell after RADARR_URL and RADARR_API_KEY are exported',
      },
    ])
  })
)

it.effect('missing env on subcommands renders a recoverable error envelope', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['status']).pipe(Effect.provide(MissingTestLayer))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'radarr status',
      error: {
        code: 'RADARR_ENV_MISSING',
        message: 'RADARR_URL is not set',
      },
      fix: 'Open a fresh shell so sops-nix exports RADARR_URL and RADARR_API_KEY from modules/programs/shell.nix.',
      next_actions: [{ command: 'radarr', description: 'Show available commands' }],
    })
  })
)

it.effect('search responses include movie and collection next actions', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['search', 'Linux ISO']).pipe(Effect.provide(LiveTestLayer))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }

    assert.deepStrictEqual(envelope.result, {
      query: 'Linux ISO',
      count: 2,
      results: [linuxIsoLookup, debianLookup],
    })
    assert.deepStrictEqual(envelope.next_actions, [
      {
        command: 'radarr exists <tmdb-id>',
        description: 'Check whether a selected movie is already in the library',
        params: { 'tmdb-id': { value: 27_205, description: 'TMDB movie ID' } },
      },
      {
        command: 'radarr add <tmdb-id> [--quality-profile <quality-profile-id>] [--no-search]',
        description: 'Add a selected movie to Radarr',
        params: {
          'tmdb-id': { value: 27_205, description: 'TMDB movie ID' },
          'quality-profile-id': { default: 1, description: 'Radarr quality profile ID' },
        },
      },
      {
        command: 'radarr collection-info <collection-tmdb-id>',
        description: 'Inspect the collection before adding it',
        params: { 'collection-tmdb-id': { value: 10, description: 'TMDB collection ID' } },
      },
      {
        command: 'radarr add-collection <collection-tmdb-id> [--no-search] [--confirm-add-collection]',
        description: 'Add this collection after user confirmation',
        params: { 'collection-tmdb-id': { value: 10, description: 'TMDB collection ID' } },
      },
    ])
  })
)

it.effect('exists false suggests adding the selected TMDB ID', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['exists', '27206']).pipe(Effect.provide(LiveTestLayer))

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }

    assert.deepStrictEqual(envelope.result, { tmdbId: 27_206, exists: false })
    assert.deepStrictEqual(envelope.next_actions, [
      {
        command: 'radarr add <tmdb-id> [--quality-profile <quality-profile-id>] [--no-search]',
        description: 'Add this TMDB movie to Radarr',
        params: {
          'tmdb-id': { value: 27_206, description: 'TMDB movie ID' },
          'quality-profile-id': { default: 1, description: 'Radarr quality profile ID' },
        },
      },
    ])
  })
)

it.effect('add command parses quality overrides and search suppression', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['add', '27206', '--quality-profile', '7', '--no-search']).pipe(
      Effect.provide(LiveTestLayer)
    )

    assert.strictEqual(envelope.ok, true)
    if (!envelope.ok) {
      assert.fail('expected success envelope')
    }

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'radarr add 27206 --quality-profile 7 --no-search',
      result: {
        added: true,
        movie: movieFromLookup(debianLookup),
        qualityProfileId: 7,
        rootFolderPath: '/movies',
        searchForMovie: false,
      },
      next_actions: [],
    })
  })
)

it.effect('add-collection requires explicit confirmation', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['add-collection', '10']).pipe(Effect.provide(LiveTestLayer))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'radarr add-collection 10',
      error: {
        code: 'RADARR_COLLECTION_CONFIRMATION_REQUIRED',
        message: 'Adding a collection requires --confirm-add-collection',
      },
      fix: 'Re-run with --confirm-add-collection only after confirming the collection add with the user.',
      next_actions: [
        {
          command: 'radarr collection-info <collection-tmdb-id>',
          description: 'Inspect the collection before adding it',
          params: { 'collection-tmdb-id': { value: 10, description: 'TMDB collection ID' } },
        },
        {
          command: 'radarr add-collection <collection-tmdb-id> [--no-search] [--confirm-add-collection]',
          description: 'Add this collection after user confirmation',
          params: { 'collection-tmdb-id': { value: 10, description: 'TMDB collection ID' } },
        },
      ],
    })
  })
)

it.effect('confirmed add-collection reaches the domain operation', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['add-collection', '10', '--confirm-add-collection']).pipe(
      Effect.provide(LiveTestLayer)
    )

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'radarr add-collection 10 --confirm-add-collection',
      result: {
        collectionTmdbId: 10,
        title: 'Linux ISO Collection',
        totalMovies: 2,
        added: 1,
        skipped: 1,
        failed: 0,
        searchForMovies: true,
        monitored: true,
        searchOnAdd: true,
        records: [
          {
            action: 'skipped',
            tmdbId: 27_205,
            title: 'Linux ISO: The Movie',
            year: 2024,
            reason: 'already in library',
          },
          {
            action: 'added',
            tmdbId: 27_206,
            title: 'Linux ISO: Debian Drift',
            year: 2025,
            movieId: 27_206,
          },
        ],
        recordsTruncated: false,
      },
      next_actions: [],
    })
  })
)

it.effect('remove delete-files requires explicit confirmation', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['remove', '27205', '--delete-files']).pipe(Effect.provide(LiveTestLayer))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'radarr remove 27205 --delete-files',
      error: {
        code: 'RADARR_DELETE_CONFIRMATION_REQUIRED',
        message: 'Deleting files requires --confirm-delete-files',
      },
      fix: 'Re-run with --confirm-delete-files only if you intend to delete media files from disk.',
      next_actions: [
        {
          command: 'radarr remove <tmdb-id>',
          description: 'Remove the movie from Radarr while keeping files on disk',
          params: { 'tmdb-id': { value: 27_205, description: 'TMDB movie ID' } },
        },
      ],
    })
  })
)

it.effect('confirmed remove delete-files reaches the domain operation', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['remove', '27205', '--delete-files', '--confirm-delete-files']).pipe(
      Effect.provide(LiveTestLayer)
    )

    assert.deepStrictEqual(envelope, {
      ok: true,
      command: 'radarr remove 27205 --delete-files --confirm-delete-files',
      result: { removed: true, tmdbId: 27_205, deleteFiles: true },
      next_actions: [],
    })
  })
)

it.effect('unknown flags render usage errors', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['queue', '--wat']).pipe(Effect.provide(LiveTestLayer))

    assert.deepStrictEqual(envelope, {
      ok: false,
      command: 'radarr queue --wat',
      error: {
        code: 'RADARR_CLI_USAGE',
        message: 'Unknown flag --wat',
      },
      fix: 'Run radarr to inspect available commands and required arguments.',
      next_actions: [{ command: 'radarr', description: 'Show available commands' }],
    })
  })
)

it.effect('bounded list commands expose next actions for larger limits', () =>
  Effect.gen(function* () {
    const envelope = yield* executeRadarr(['queue']).pipe(Effect.provide(LiveTestLayer))

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
          title: 'Linux.ISO.The.Movie.2024.1080p.WEB-DL',
          movieTitle: 'Linux ISO: The Movie',
          year: 2024,
          status: 'completed',
          trackedDownloadStatus: 'warning',
          trackedDownloadState: 'importBlocked',
          statusMessages: ['Automatic import is not possible.'],
          quality: 'WEBDL-1080p',
          size: 1000,
          sizeleft: 0,
          timeleft: '00:00:00',
          estimatedCompletionTime: '2026-05-24T04:17:15Z',
          protocol: 'usenet',
          downloadClient: 'SABnzbd',
          indexer: 'NZBgeek (Prowlarr)',
          outputPath: '/downloads/Linux.ISO.The.Movie.2024.1080p.WEB-DL/',
        },
      ],
    })
    assert.deepStrictEqual(envelope.next_actions, [
      {
        command: 'radarr queue --limit <n>',
        description: 'Return more active queue records',
        params: { limit: { default: 10, description: 'Maximum records to return' } },
      },
    ])
  })
)
