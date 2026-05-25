import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Redacted, Ref } from 'effect'

import {
  RadarrApi,
  RadarrConfig,
  addCollection,
  addMovie,
  calendar,
  config,
  exists,
  history,
  missing,
  queue,
  removeMovie,
  search,
  status,
} from '../src/index.js'
import type { MovieLookupResult, MovieRecord } from '../src/index.js'

const rootFolders = [{ id: 1, path: '/movies', freeSpace: 1_000_000, accessible: true, unmappedFolderCount: 0 }]
const qualityProfiles = [
  {
    id: 1,
    name: 'HD-1080p',
    isDefault: true,
    upgradeAllowed: true,
    cutoff: 4,
    minFormatScore: 0,
    cutoffFormatScore: 0,
  },
]
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
const archLookup = {
  title: 'Linux ISO: Arch Arrival',
  year: 2026,
  tmdbId: 27_207,
  tmdbUrl: 'https://themoviedb.org/movie/27207',
  titleSlug: 'linux-iso-arch-arrival-2026',
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
  minimumAvailability: 'released',
  isAvailable: true,
  sizeOnDisk: 123_456,
  studio: 'MirrorNet',
  runtime: 120,
  certification: 'PG',
  genres: ['Documentary', 'Technology'],
}

const ConfigLayer = Layer.succeed(RadarrConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://radarr.example.test',
      apiKey: Redacted.make('secret'),
      defaultQualityProfileId: 1,
    }),
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
  const match = [linuxIsoLookup, debianLookup, archLookup].find((lookup) => lookup.tmdbId === tmdbId)
  return match === undefined ? Option.none() : Option.some(match)
}

const makeApiLayer = Effect.gen(function* () {
  const removedDeleteFiles = yield* Ref.make<ReadonlyArray<boolean>>([])
  const addedSearchFlags = yield* Ref.make<ReadonlyArray<boolean>>([])
  const monitoredCollections = yield* Ref.make<ReadonlyArray<number>>([])
  const queueLimits = yield* Ref.make<ReadonlyArray<number>>([])
  const missingLimits = yield* Ref.make<ReadonlyArray<number>>([])
  const historyLimits = yield* Ref.make<ReadonlyArray<number>>([])
  const api = RadarrApi.of({
    status: () => Effect.succeed({ appName: 'Radarr', version: '5.0.0', branch: 'main', runtimeVersion: '8.0.0' }),
    rootFolders: () => Effect.succeed(rootFolders),
    qualityProfiles: () => Effect.succeed(qualityProfiles),
    lookupMovies: (query) => Effect.succeed(query === 'Linux ISO' ? [linuxIsoLookup, debianLookup, archLookup] : []),
    lookupMovieByTmdbId: (tmdbId) => Effect.succeed(lookupByTmdbId(tmdbId)),
    getMovieByTmdbId: (tmdbId) => Effect.succeed(tmdbId === 27_205 ? Option.some(linuxIsoMovie) : Option.none()),
    addMovie: (lookup, options) =>
      Ref.update(addedSearchFlags, (flags) => [...flags, options.searchForMovie]).pipe(
        Effect.as(movieFromLookup(lookup))
      ),
    removeMovie: (_movieId, options) =>
      Ref.update(removedDeleteFiles, (flags) => [...flags, options.deleteFiles]).pipe(Effect.asVoid),
    collections: () => Effect.succeed([collection]),
    setCollectionMonitoring: (collectionId) =>
      Ref.update(monitoredCollections, (ids) => [...ids, collectionId]).pipe(Effect.asVoid),
    queue: (limit) =>
      Ref.update(queueLimits, (limits) => [...limits, limit]).pipe(
        Effect.as({
          count: 2,
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
            {
              id: 101,
              title: 'Linux.ISO.Debian.Drift.2025.1080p.WEB-DL',
              movieTitle: 'Linux ISO: Debian Drift',
              year: 2025,
              status: 'queued',
            },
          ],
        })
      ),
    calendar: (_days) =>
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
    missing: (limit) =>
      Ref.update(missingLimits, (limits) => [...limits, limit]).pipe(
        Effect.as({
          count: 2,
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
            {
              id: 301,
              title: 'Linux ISO: Mirror Outage',
              year: 2024,
              tmdbId: 27_210,
              hasFile: false,
              monitored: true,
            },
          ],
        })
      ),
    history: (limit) =>
      Ref.update(historyLimits, (limits) => [...limits, limit]).pipe(
        Effect.as({
          count: 2,
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
            {
              id: 401,
              date: '2026-05-24T02:30:14Z',
              eventType: 'downloadFolderImported',
              sourceTitle: 'Linux.ISO.Debian.Drift.2025.1080p.WEB-DL',
              movieTitle: 'Linux ISO: Debian Drift',
              year: 2025,
              quality: 'WEBDL-1080p',
              downloadClient: 'SABnzbd',
            },
          ],
        })
      ),
  })

  return {
    layer: Layer.succeed(RadarrApi, api),
    removedDeleteFiles,
    addedSearchFlags,
    monitoredCollections,
    queueLimits,
    missingLimits,
    historyLimits,
  }
})

it.effect('reads status through the RadarrApi service', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* status.pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, { appName: 'Radarr', version: '5.0.0', branch: 'main', runtimeVersion: '8.0.0' })
  })
)

it.effect('returns bounded search results with TMDB URLs and collection metadata', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* search('Linux ISO', { limit: 1 }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )

    assert.deepStrictEqual(result, {
      query: 'Linux ISO',
      count: 1,
      results: [linuxIsoLookup],
    })
  })
)

it.effect('reports whether a TMDB id already exists', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* exists(27_205).pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, {
      tmdbId: 27_205,
      exists: true,
      movie: linuxIsoMovie,
    })
  })
)

it.effect('adds a resolved movie with default quality and disabled search when requested', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* addMovie(27_206, { searchForMovie: false }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )
    const searchFlags = yield* Ref.get(fake.addedSearchFlags)

    assert.deepStrictEqual(result, {
      added: true,
      movie: movieFromLookup(debianLookup),
      qualityProfileId: 1,
      rootFolderPath: '/movies',
      searchForMovie: false,
    })
    assert.deepStrictEqual(searchFlags, [false])
  })
)

it.effect('adds collection movies, skips existing movies, monitors the collection, and bounds records', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* addCollection(10, { searchForMovies: true, resultLimit: 2 }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )
    const searchFlags = yield* Ref.get(fake.addedSearchFlags)
    const monitoredCollections = yield* Ref.get(fake.monitoredCollections)

    assert.deepStrictEqual(result, {
      collectionTmdbId: 10,
      title: 'Linux ISO Collection',
      totalMovies: 3,
      added: 2,
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
      recordsTruncated: true,
    })
    assert.deepStrictEqual(searchFlags, [true, true])
    assert.deepStrictEqual(monitoredCollections, [7])
  })
)

it.effect('removes a movie and preserves files by default', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* removeMovie(27_205, { deleteFiles: false }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )
    const deleteFlags = yield* Ref.get(fake.removedDeleteFiles)

    assert.deepStrictEqual(result, { removed: true, tmdbId: 27_205, deleteFiles: false })
    assert.deepStrictEqual(deleteFlags, [false])
  })
)

it.effect('bounds list operations at the requested limit', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const layer = Layer.mergeAll(ConfigLayer, fake.layer)

    assert.deepStrictEqual(yield* queue({ limit: 1 }).pipe(Effect.provide(layer)), {
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
    assert.deepStrictEqual(yield* missing({ limit: 1 }).pipe(Effect.provide(layer)), {
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
    })
    assert.deepStrictEqual(yield* history({ limit: 1 }).pipe(Effect.provide(layer)), {
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
    })
    assert.deepStrictEqual(yield* Ref.get(fake.queueLimits), [1])
    assert.deepStrictEqual(yield* Ref.get(fake.missingLimits), [1])
    assert.deepStrictEqual(yield* Ref.get(fake.historyLimits), [1])
  })
)

it.effect('passes calendar day windows to the API', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* calendar({ days: 30 }).pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, {
      days: 30,
      count: 1,
      records: [
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
      ],
    })
  })
)

it.effect('returns root folders and quality profiles for config inspection', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* config.pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, { rootFolders, qualityProfiles })
  })
)
