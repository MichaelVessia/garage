import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'

import {
  SonarrApi,
  SonarrConfig,
  addSeries,
  calendar,
  config,
  exists,
  history,
  missing,
  queue,
  removeSeries,
  search,
  status,
} from '../src/index.js'

const rootFolders = [{ id: 1, path: '/tv', freeSpace: 1_000_000, accessible: true, unmappedFolderCount: 0 }]
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
    url: 'http://sonarr.lan',
    apiKey: 'secret',
    defaultQualityProfileId: 1,
  }),
})

const makeApiLayer = Effect.gen(function* () {
  const removedDeleteFiles = yield* Ref.make<ReadonlyArray<boolean>>([])
  const addedSearchFlags = yield* Ref.make<ReadonlyArray<boolean>>([])
  const queueLimits = yield* Ref.make<ReadonlyArray<number>>([])
  const missingLimits = yield* Ref.make<ReadonlyArray<number>>([])
  const historyLimits = yield* Ref.make<ReadonlyArray<number>>([])
  const api = SonarrApi.of({
    status: Effect.succeed({ appName: 'Sonarr', version: '4.0.0' }),
    rootFolders: Effect.succeed(rootFolders),
    qualityProfiles: Effect.succeed(qualityProfiles),
    lookupSeries: (query) => Effect.succeed(query === 'Linux ISO' ? [severanceLookup] : []),
    lookupSeriesByTvdbId: (tvdbId) => Effect.succeed(tvdbId === 371_980 ? Option.some(severanceLookup) : Option.none()),
    getSeriesByTvdbId: (tvdbId) => Effect.succeed(tvdbId === 371_980 ? Option.some(severanceSeries) : Option.none()),
    addSeries: (_lookup, options) =>
      Ref.update(addedSearchFlags, (flags) => [...flags, options.searchForMissingEpisodes]).pipe(
        Effect.as(severanceSeries)
      ),
    removeSeries: (_seriesId, options) =>
      Ref.update(removedDeleteFiles, (flags) => [...flags, options.deleteFiles]).pipe(Effect.asVoid),
    queue: (limit) =>
      Ref.update(queueLimits, (limits) => [...limits, limit]).pipe(
        Effect.as({
          count: 2,
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
            {
              id: 101,
              title: 'Linux.ISO.Weekly.S01E02.Arch.BTW.1080p.WEB-DL',
              seriesTitle: 'Linux ISO Weekly',
              seasonNumber: 1,
              episodeNumber: 2,
              episodeTitle: 'Arch BTW Netinstall',
              status: 'queued',
              trackedDownloadStatus: 'ok',
              trackedDownloadState: 'downloading',
              statusMessages: [],
              quality: 'WEBDL-1080p',
              languages: ['English'],
              size: 2000,
              sizeleft: 1000,
              timeleft: '00:10:00',
              protocol: 'usenet',
              downloadClient: 'SABnzbd',
            },
          ],
        })
      ),
    calendar: (_days) =>
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
    missing: (limit) =>
      Ref.update(missingLimits, (limits) => [...limits, limit]).pipe(
        Effect.as({
          count: 2,
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
            {
              id: 301,
              title: 'Mirror Outage',
              seriesTitle: 'Linux ISO Weekly',
              seasonNumber: 1,
              episodeNumber: 2,
              airDateUtc: '2026-05-21',
              hasFile: false,
              monitored: true,
              seriesStatus: 'continuing',
              network: 'MirrorNet',
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
            {
              id: 401,
              date: '2026-05-24T02:30:14Z',
              eventType: 'downloadFolderImported',
              sourceTitle: 'Linux.ISO.Weekly.S01E02.Arch.BTW.1080p.WEB-DL',
              seriesTitle: 'Linux ISO Weekly',
              seasonNumber: 1,
              episodeNumber: 2,
              episodeTitle: 'Arch BTW Netinstall',
              quality: 'WEBDL-1080p',
              languages: ['English'],
              downloadClient: 'SABnzbd',
            },
          ],
        })
      ),
  })

  return {
    layer: Layer.succeed(SonarrApi, api),
    removedDeleteFiles,
    addedSearchFlags,
    queueLimits,
    missingLimits,
    historyLimits,
  }
})

it.effect('reads status through the SonarrApi service', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* status.pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, { appName: 'Sonarr', version: '4.0.0' })
  })
)

it.effect('returns bounded search results with TVDB URLs', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* search('Linux ISO', { limit: 10 }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )

    assert.deepStrictEqual(result, {
      query: 'Linux ISO',
      count: 1,
      results: [severanceLookup],
    })
  })
)

it.effect('reports whether a TVDB id already exists', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* exists(371_980).pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, {
      tvdbId: 371_980,
      exists: true,
      series: severanceSeries,
    })
  })
)

it.effect('adds a resolved series with default quality and disabled search when requested', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* addSeries(371_980, { searchForMissingEpisodes: false }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )
    const searchFlags = yield* Ref.get(fake.addedSearchFlags)

    assert.deepStrictEqual(result, {
      added: true,
      series: severanceSeries,
      qualityProfileId: 1,
      rootFolderPath: '/tv',
      searchForMissingEpisodes: false,
    })
    assert.deepStrictEqual(searchFlags, [false])
  })
)

it.effect('removes a series and preserves files by default', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* removeSeries(371_980, { deleteFiles: false }).pipe(
      Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer))
    )
    const deleteFlags = yield* Ref.get(fake.removedDeleteFiles)

    assert.deepStrictEqual(result, { removed: true, tvdbId: 371_980, deleteFiles: false })
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
    assert.deepStrictEqual(yield* missing({ limit: 1 }).pipe(Effect.provide(layer)), {
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
    })
    assert.deepStrictEqual(yield* history({ limit: 1 }).pipe(Effect.provide(layer)), {
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
    })
    assert.deepStrictEqual(yield* Ref.get(fake.queueLimits), [1])
    assert.deepStrictEqual(yield* Ref.get(fake.missingLimits), [1])
    assert.deepStrictEqual(yield* Ref.get(fake.historyLimits), [1])
  })
)

it.effect('passes calendar day windows to the API', () =>
  Effect.gen(function* () {
    const fake = yield* makeApiLayer
    const result = yield* calendar({ days: 14 }).pipe(Effect.provide(Layer.mergeAll(ConfigLayer, fake.layer)))

    assert.deepStrictEqual(result, {
      days: 14,
      count: 1,
      records: [
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
