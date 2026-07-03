import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers, HttpClient, HttpClientResponse } from 'effect/unstable/http'

import {
  SonarrApiLive,
  SonarrConfig,
  calendar,
  config,
  exists,
  history,
  missing,
  queue,
  search,
  status,
} from '../src/index.js'

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly apiKey?: string | undefined
}

const ConfigLayer = Layer.succeed(SonarrConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://sonarr.example.test/',
      apiKey: Redacted.make('secret'),
      defaultQualityProfileId: 1,
    }),
})

const makeHttpClientLayer = (respond: (url: URL) => unknown) =>
  Effect.gen(function* () {
    const requests = yield* Ref.make<ReadonlyArray<RecordedRequest>>([])
    const client = HttpClient.make((request, url) =>
      Ref.update(requests, (records) => [
        ...records,
        {
          method: request.method,
          url: url.toString(),
          apiKey: Headers.get(request.headers, 'x-api-key').pipe(Option.getOrUndefined),
        },
      ]).pipe(
        Effect.as(
          HttpClientResponse.fromWeb(
            request,
            Response.json(respond(url), {
              status: 200,
            })
          )
        )
      )
    )

    return { layer: Layer.succeed(HttpClient.HttpClient, client), requests }
  })

it.effect('SonarrApiLive sends authenticated requests and decodes JSON responses', () =>
  Effect.gen(function* () {
    const statusResult = {
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
    }
    const fake = yield* makeHttpClientLayer(() => statusResult)
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* status.pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, statusResult)
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sonarr.example.test/api/v3/system/status',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('SonarrApiLive enriches root folders and marks the default quality profile', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((url) => {
      if (url.pathname === '/api/v3/rootfolder') {
        return [
          {
            id: 1,
            path: '/tv',
            freeSpace: 1_000_000,
            accessible: true,
            unmappedFolders: [{ name: 'Unmapped' }],
          },
        ]
      }

      return [
        {
          id: 1,
          name: 'HD-1080p',
          upgradeAllowed: true,
          cutoff: 4,
          minFormatScore: 0,
          cutoffFormatScore: 0,
        },
      ]
    })
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* config.pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, {
      rootFolders: [{ id: 1, path: '/tv', freeSpace: 1_000_000, accessible: true, unmappedFolderCount: 1 }],
      qualityProfiles: [
        {
          id: 1,
          name: 'HD-1080p',
          isDefault: true,
          upgradeAllowed: true,
          cutoff: 4,
          minFormatScore: 0,
          cutoffFormatScore: 0,
        },
      ],
    })
  })
)

it.effect('SonarrApiLive enriches lookup results for disambiguation', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => [
      {
        title: 'Linux ISO Weekly',
        year: 2022,
        tvdbId: 371_980,
        titleSlug: 'severance',
        imdbId: 'tt0000001',
        tmdbId: 95_396,
        status: 'continuing',
        network: 'MirrorNet',
        genres: ['Documentary', 'Technology'],
        runtime: 49,
        firstAired: '2022-02-18T00:00:00Z',
        remotePoster: 'https://example.com/linux-iso-weekly.jpg',
        overview: 'A weekly digest of totally legitimate Linux ISO release candidates.',
      },
    ])
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* search('Linux ISO').pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, {
      query: 'Linux ISO',
      count: 1,
      results: [
        {
          title: 'Linux ISO Weekly',
          year: 2022,
          tvdbId: 371_980,
          tvdbUrl: 'https://thetvdb.com/dereferrer/series/371980',
          titleSlug: 'severance',
          imdbId: 'tt0000001',
          tmdbId: 95_396,
          status: 'continuing',
          network: 'MirrorNet',
          genres: ['Documentary', 'Technology'],
          runtime: 49,
          firstAired: '2022-02-18T00:00:00Z',
          remotePoster: 'https://example.com/linux-iso-weekly.jpg',
          overview: 'A weekly digest of totally legitimate Linux ISO release candidates.',
        },
      ],
    })
  })
)

it.effect('SonarrApiLive enriches existing series records', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer((url) => {
      if (url.pathname === '/api/v3/qualityprofile') {
        return [{ id: 1, name: 'HD-1080p' }]
      }

      return [
        {
          id: 42,
          title: 'Linux ISO Weekly',
          tvdbId: 371_980,
          year: 2022,
          path: '/tv/Linux ISO Weekly',
          monitored: true,
          status: 'continuing',
          qualityProfileId: 1,
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
        },
      ]
    })
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* exists(371_980).pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, {
      tvdbId: 371_980,
      exists: true,
      series: {
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
      },
    })
  })
)

it.effect('SonarrApiLive requests expanded queue records and decodes missing series safely', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      totalRecords: 66,
      records: [
        {
          id: 1_594_103_525,
          title: 'Debian.Netinst.Daily.S07E50.1080p.WEB-DL.H264.AAC-CHDWEB',
          series: { title: 'Tiny Penguin ISO Club' },
          seasonNumber: 7,
          episode: { episodeNumber: 50, title: 'Little Trains' },
          status: 'completed',
          trackedDownloadStatus: 'warning',
          trackedDownloadState: 'importBlocked',
          statusMessages: [{ title: 'Import blocked', messages: ['Automatic import is not possible.'] }],
          quality: { quality: { name: 'WEBDL-1080p' } },
          languages: [{ id: 1, name: 'English' }],
          size: 107_903_351,
          sizeleft: 0,
          timeleft: '00:00:00',
          estimatedCompletionTime: '2026-05-24T04:17:15Z',
          protocol: 'usenet',
          downloadClient: 'SABnzbd',
          indexer: 'NZBgeek (Prowlarr)',
          outputPath: '/mnt/media/complete/tv/Debian.Netinst.Daily.S07E50.1080p.WEB-DL.H264.AAC-CHDWEB/',
        },
        {
          id: 1_594_103_524,
          title: 'Debian.Netinst.Daily.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
          status: 'completed',
          seriesId: 12,
        },
      ],
    }))
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* queue({ limit: 5 }).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, {
      count: 2,
      totalRecords: 66,
      records: [
        {
          id: 1_594_103_525,
          title: 'Debian.Netinst.Daily.S07E50.1080p.WEB-DL.H264.AAC-CHDWEB',
          seriesTitle: 'Tiny Penguin ISO Club',
          seasonNumber: 7,
          episodeNumber: 50,
          episodeTitle: 'Little Trains',
          status: 'completed',
          trackedDownloadStatus: 'warning',
          trackedDownloadState: 'importBlocked',
          statusMessages: ['Automatic import is not possible.'],
          quality: 'WEBDL-1080p',
          languages: ['English'],
          size: 107_903_351,
          sizeleft: 0,
          timeleft: '00:00:00',
          estimatedCompletionTime: '2026-05-24T04:17:15Z',
          protocol: 'usenet',
          downloadClient: 'SABnzbd',
          indexer: 'NZBgeek (Prowlarr)',
          outputPath: '/mnt/media/complete/tv/Debian.Netinst.Daily.S07E50.1080p.WEB-DL.H264.AAC-CHDWEB/',
        },
        {
          id: 1_594_103_524,
          title: 'Debian.Netinst.Daily.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
          seriesTitle: 'Unknown Series',
          status: 'completed',
          statusMessages: [],
          languages: [],
        },
      ],
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sonarr.example.test/api/v3/queue?pageSize=5&includeSeries=true&includeEpisode=true',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('SonarrApiLive requests expanded missing records and does not require queue status', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      totalRecords: 1338,
      records: [
        {
          id: 11_091,
          title: 'Kernel Config Deep Cuts',
          seasonNumber: 1,
          episodeNumber: 4,
          airDateUtc: '2026-04-15T02:44:00Z',
          hasFile: false,
          monitored: true,
          lastSearchTime: '2026-04-16T02:44:00Z',
          overview: 'Boy band legends and insiders share the untold stories.',
          series: { title: 'Distro Maintainer After Dark', status: 'continuing', network: 'Repo Max' },
        },
        {
          id: 11_092,
          title: 'Mystery Episode',
          airDateUtc: '2026-04-16T02:44:00Z',
          seriesId: 12,
        },
      ],
    }))
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* missing({ limit: 5 }).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, {
      count: 2,
      totalRecords: 1338,
      records: [
        {
          id: 11_091,
          title: 'Kernel Config Deep Cuts',
          seriesTitle: 'Distro Maintainer After Dark',
          seasonNumber: 1,
          episodeNumber: 4,
          airDateUtc: '2026-04-15T02:44:00Z',
          hasFile: false,
          monitored: true,
          seriesStatus: 'continuing',
          network: 'Repo Max',
          lastSearchTime: '2026-04-16T02:44:00Z',
          overview: 'Boy band legends and insiders share the untold stories.',
        },
        {
          id: 11_092,
          title: 'Mystery Episode',
          seriesTitle: 'Unknown Series',
          airDateUtc: '2026-04-16T02:44:00Z',
        },
      ],
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sonarr.example.test/api/v3/wanted/missing?pageSize=5&includeSeries=true',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('SonarrApiLive enriches calendar records with episode and series context', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => [
      {
        id: 11_089,
        title: 'Questionable Checksums',
        seasonNumber: 1,
        episodeNumber: 9,
        airDateUtc: '2026-05-25T01:00:00Z',
        hasFile: false,
        monitored: true,
        overview: 'Trivia night gets tense.',
        series: { title: 'The Real Mirrors of Rack Island', status: 'continuing', network: 'rsyncTV' },
      },
    ])
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* calendar({ days: 7 }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, {
      days: 7,
      count: 1,
      records: [
        {
          id: 11_089,
          title: 'Questionable Checksums',
          seriesTitle: 'The Real Mirrors of Rack Island',
          seasonNumber: 1,
          episodeNumber: 9,
          airDateUtc: '2026-05-25T01:00:00Z',
          hasFile: false,
          monitored: true,
          seriesStatus: 'continuing',
          network: 'rsyncTV',
          overview: 'Trivia night gets tense.',
        },
      ],
    })
  })
)

it.effect('SonarrApiLive requests expanded history records and decodes missing series safely', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      totalRecords: 13_124,
      records: [
        {
          id: 13_296,
          date: '2026-05-24T02:29:14Z',
          eventType: 'downloadFolderImported',
          sourceTitle: 'Arch.BTW.ISO.Dynasty.S01E10.1080p.WEB.h264-EDITH',
          series: { title: 'Arch BTW ISO Dynasty' },
          episode: { seasonNumber: 1, episodeNumber: 10, title: 'A Fair-ly Cached ISO' },
          quality: { quality: { name: 'WEBDL-1080p' } },
          languages: [{ id: 1, name: 'English' }],
          downloadId: 'SABnzbd_nzo_08ni4402',
          data: { downloadClientName: 'SABnzbd', releaseGroup: 'EDITH', size: '1819208917' },
        },
        {
          id: 13_295,
          eventType: 'downloadFolderImported',
          sourceTitle: 'Debian.Netinst.Daily.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
          seriesId: 12,
        },
      ],
    }))
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* history({ limit: 5 }).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, {
      count: 2,
      totalRecords: 13_124,
      records: [
        {
          id: 13_296,
          date: '2026-05-24T02:29:14Z',
          sourceTitle: 'Arch.BTW.ISO.Dynasty.S01E10.1080p.WEB.h264-EDITH',
          seriesTitle: 'Arch BTW ISO Dynasty',
          seasonNumber: 1,
          episodeNumber: 10,
          episodeTitle: 'A Fair-ly Cached ISO',
          eventType: 'downloadFolderImported',
          quality: 'WEBDL-1080p',
          languages: ['English'],
          downloadClient: 'SABnzbd',
          releaseGroup: 'EDITH',
          size: 1_819_208_917,
          downloadId: 'SABnzbd_nzo_08ni4402',
        },
        {
          id: 13_295,
          sourceTitle: 'Debian.Netinst.Daily.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
          seriesTitle: 'Unknown Series',
          eventType: 'downloadFolderImported',
          languages: [],
        },
      ],
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sonarr.example.test/api/v3/history?pageSize=5&includeSeries=true&includeEpisode=true',
        apiKey: 'secret',
      },
    ])
  })
)
