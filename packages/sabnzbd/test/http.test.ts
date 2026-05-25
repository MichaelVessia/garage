import { assert, it } from '@effect/vitest'
import { Effect, Layer, Ref } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'

import { SabnzbdApiLive, SabnzbdConfig, deleteQueueItem, queue, status } from '../src/index.js'

interface RecordedRequest {
  readonly method: string
  readonly url: string
}

interface FakeResponse {
  readonly status: number
  readonly body: unknown
}

const ConfigLayer = Layer.succeed(SabnzbdConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://sabnzbd.example.test/',
      apiKey: 'secret',
    }),
})

const makeHttpClientLayer = (respond: (url: URL) => FakeResponse) =>
  Effect.gen(function* () {
    const requests = yield* Ref.make<ReadonlyArray<RecordedRequest>>([])
    const client = HttpClient.make((request, url) =>
      Ref.update(requests, (records) => [...records, { method: request.method, url: url.toString() }]).pipe(
        Effect.map(() => {
          const response = respond(url)
          return HttpClientResponse.fromWeb(request, Response.json(response.body, { status: response.status }))
        })
      )
    )

    return { layer: Layer.succeed(HttpClient.HttpClient, client), requests }
  })

it.effect('SabnzbdApiLive sends query-authenticated status requests', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      status: 200,
      body: {
        status: {
          version: '4.5.3',
          uptime: '1d',
          paused: false,
          paused_all: false,
          speedlimit: '0',
          speedlimit_abs: '0',
          diskspace1_norm: '1 TB',
          have_warnings: false,
          warnings: [],
        },
      },
    }))
    const layer = SabnzbdApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* status.pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.strictEqual(result.version, '4.5.3')
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sabnzbd.example.test/api?apikey=secret&output=json&mode=fullstatus',
      },
    ])
  })
)

it.effect('SabnzbdApiLive maps queue responses and limit params', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({
      status: 200,
      body: {
        queue: {
          status: 'Downloading',
          paused: false,
          speed: '5 MB/s',
          speedlimit: '0',
          timeleft: '00:10:00',
          mb: '1000',
          mbleft: '100',
          noofslots: 1,
          noofslots_total: 22,
          slots: [
            {
              nzo_id: 'SABnzbd_nzo_abc',
              filename: 'Linux.ISO.2026',
              status: 'Downloading',
              priority: 'Normal',
              cat: 'software',
              mb: '1000',
              mbleft: '100',
              percentage: '90',
              timeleft: '00:10:00',
            },
          ],
        },
      },
    }))
    const layer = SabnzbdApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* queue({ limit: 5 }).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.strictEqual(result.totalRecords, 22)
    assert.deepStrictEqual(result.slots, [
      {
        nzoId: 'SABnzbd_nzo_abc',
        filename: 'Linux.ISO.2026',
        status: 'Downloading',
        priority: 'Normal',
        category: 'software',
        mb: '1000',
        mbleft: '100',
        percentage: '90',
        timeleft: '00:10:00',
      },
    ])
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sabnzbd.example.test/api?apikey=secret&output=json&mode=queue&start=0&limit=5',
      },
    ])
  })
)

it.effect('SabnzbdApiLive sends delete file flags explicitly', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({ status: 200, body: { status: true } }))
    const layer = SabnzbdApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* deleteQueueItem('SABnzbd_nzo_abc', { deleteFiles: true }).pipe(Effect.provide(layer))
    const requests = yield* Ref.get(fake.requests)

    assert.deepStrictEqual(result, {
      action: 'delete',
      ok: true,
      nzoId: 'SABnzbd_nzo_abc',
      deleteFiles: true,
    })
    assert.deepStrictEqual(requests, [
      {
        method: 'GET',
        url: 'http://sabnzbd.example.test/api?apikey=secret&output=json&mode=queue&name=delete&value=SABnzbd_nzo_abc&del_files=1',
      },
    ])
  })
)

it.effect('SabnzbdApiLive does not treat missing action status as success', () =>
  Effect.gen(function* () {
    const fake = yield* makeHttpClientLayer(() => ({ status: 200, body: {} }))
    const layer = SabnzbdApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* deleteQueueItem('SABnzbd_nzo_abc', { deleteFiles: false }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, {
      action: 'delete',
      ok: false,
      nzoId: 'SABnzbd_nzo_abc',
      deleteFiles: false,
    })
  })
)
