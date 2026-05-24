import { assert, it } from '@effect/vitest'
import { Effect, Layer, Option, Ref } from 'effect'
import { Headers, HttpClient, HttpClientResponse } from 'effect/unstable/http'

import { SonarrApiLive, SonarrConfig, history, queue, status } from '../src/index.js'

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

it.effect('SonarrApiLive decodes queue records without expanded series objects', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      records: [
        {
          title: 'Peppa.Pig.2019.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
          status: 'completed',
          seriesId: 12,
        },
      ],
    }))
    const layer = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* queue({ limit: 5 }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, {
      count: 1,
      records: [
        {
          title: 'Peppa.Pig.2019.S07E49.1080p.WEB-DL.H264.AAC-CHDWEB',
          seriesTitle: 'Unknown Series',
          status: 'completed',
        },
      ],
    })
  })
)

it.effect('SonarrApiLive decodes history records without expanded series objects', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      records: [
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
      count: 1,
      records: [
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
        url: 'http://sonarr.lan/api/v3/history?pageSize=5',
        apiKey: 'secret',
      },
    ])
  })
)
