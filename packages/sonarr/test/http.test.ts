import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'
import { Headers, HttpClient, HttpClientResponse } from 'effect/unstable/http'

import { SonarrApiLive, SonarrConfig, history, missing, queue, status } from '../src/index.js'

interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly apiKey?: string | undefined
}

const ConfigLayer = Layer.succeed(SonarrConfig, {
  get: Effect.succeed({
    url: 'http://sonarr.lan/',
    apiKey: 'secret',
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
    const fake = yield* makeHttpClientLayer(() => ({ appName: 'Sonarr', version: '4.0.0' }))
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* status.pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, { appName: 'Sonarr', version: '4.0.0' })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sonarr.lan/api/v3/system/status',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('SonarrApiLive requests expanded queue records and decodes missing series safely', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      records: [
        {
          title: 'Peppa.Pig.2019.S07E50.1080p.WEB-DL.H264.AAC-CHDWEB',
          series: { title: 'Peppa Pig' },
          status: 'completed',
        },
        {
          title: 'Peppa.Pig.2019.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
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
      records: [
        {
          title: 'Peppa.Pig.2019.S07E50.1080p.WEB-DL.H264.AAC-CHDWEB',
          seriesTitle: 'Peppa Pig',
          status: 'completed',
        },
        {
          title: 'Peppa.Pig.2019.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
          seriesTitle: 'Unknown Series',
          status: 'completed',
        },
      ],
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sonarr.lan/api/v3/queue?pageSize=5&includeSeries=true',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('SonarrApiLive requests expanded missing records and does not require queue status', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      records: [
        {
          title: 'Deeper Cuts',
          airDateUtc: '2026-04-15T02:44:00Z',
          series: { title: 'Boy Band Confidential' },
        },
        {
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
      records: [
        {
          title: 'Deeper Cuts',
          seriesTitle: 'Boy Band Confidential',
          airDateUtc: '2026-04-15T02:44:00Z',
        },
        {
          title: 'Mystery Episode',
          seriesTitle: 'Unknown Series',
          airDateUtc: '2026-04-16T02:44:00Z',
        },
      ],
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sonarr.lan/api/v3/wanted/missing?pageSize=5&includeSeries=true',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('SonarrApiLive requests expanded history records and decodes missing series safely', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      records: [
        {
          eventType: 'downloadFolderImported',
          sourceTitle: 'Buddy.Valastros.Cake.Dynasty.S01E10.1080p.WEB.h264-EDITH',
          series: { title: "Buddy Valastro's Cake Dynasty" },
        },
        {
          eventType: 'downloadFolderImported',
          sourceTitle: 'Peppa.Pig.2019.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
          seriesId: 12,
        },
      ],
    }))
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* history({ limit: 5 }).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, {
      count: 2,
      records: [
        {
          title: 'Buddy.Valastros.Cake.Dynasty.S01E10.1080p.WEB.h264-EDITH',
          seriesTitle: "Buddy Valastro's Cake Dynasty",
          eventType: 'downloadFolderImported',
        },
        {
          title: 'Peppa.Pig.2019.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
          seriesTitle: 'Unknown Series',
          eventType: 'downloadFolderImported',
        },
      ],
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sonarr.lan/api/v3/history?pageSize=5&includeSeries=true',
        apiKey: 'secret',
      },
    ])
  })
)
