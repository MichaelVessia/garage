import { assert, it } from '@effect/vitest'
import { makeRecordingHttpClient } from '@garage/cli-protocol/testing'
import type { RecordedHttpRequest } from '@garage/cli-protocol/testing'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import { Headers, HttpClient, HttpClientError } from 'effect/unstable/http'

import { RadarrApi, RadarrApiLive, RadarrConfig } from '../src/index.js'
import type { MovieLookupResult } from '../src/index.js'

const ConfigLayer = Layer.succeed(RadarrConfig, {
  get: () =>
    Effect.succeed({
      url: 'http://radarr.example.test/',
      apiKey: Redacted.make('secret'),
      defaultQualityProfileId: 1,
    }),
})

const withApiKey = (records: ReadonlyArray<RecordedHttpRequest>) =>
  records.map((request) => ({
    method: request.method,
    url: request.url,
    apiKey: Headers.get(request.raw.headers, 'x-api-key').pipe(Option.getOrUndefined),
  }))

const unreachableLayer = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error('ECONNREFUSED'),
          description: 'connection refused',
        }),
      })
    )
  )
)

const statusResult = {
  appName: 'Radarr',
  version: '5.9.1.9070',
  instanceName: 'Radarr',
  branch: 'master',
  runtimeVersion: '8.0.13',
  startupPath: '/app',
  appData: '/config',
  osName: 'ubuntu',
  osVersion: '22.04',
  isLinux: true,
  isDocker: true,
}

const linuxIsoLookupApi = {
  title: 'Linux ISO: The Movie',
  year: 2024,
  tmdbId: 27_205,
  titleSlug: 'linux-iso-the-movie-2024',
  imdbId: 'tt0000001',
  status: 'released',
  overview: 'A totally legitimate distribution image gets its theatrical moment.',
  genres: ['Documentary', 'Technology'],
}

const linuxIsoLookupDomain: MovieLookupResult = {
  title: 'Linux ISO: The Movie',
  year: 2024,
  tmdbId: 27_205,
  tmdbUrl: 'https://themoviedb.org/movie/27205',
  titleSlug: 'linux-iso-the-movie-2024',
  imdbId: 'tt0000001',
  status: 'released',
  overview: 'A totally legitimate distribution image gets its theatrical moment.',
  runtime: undefined,
  certification: undefined,
  genres: ['Documentary', 'Technology'],
  studio: undefined,
  inCinemas: undefined,
  physicalRelease: undefined,
  digitalRelease: undefined,
  remotePoster: undefined,
  collection: undefined,
}

const linuxIsoMovieApi = {
  id: 42,
  title: 'Linux ISO: The Movie',
  year: 2024,
  tmdbId: 27_205,
  path: '/movies/Linux ISO The Movie (2024)',
  monitored: true,
  status: 'released',
  hasFile: true,
  qualityProfileId: 1,
  minimumAvailability: 'released',
  isAvailable: true,
  sizeOnDisk: 123_456,
}

it.effect('RadarrApiLive sends an authenticated status request and decodes the response', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({ status: 200, body: statusResult }))
    const layer = RadarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* Effect.gen(function* () {
      const api = yield* RadarrApi
      return yield* api.status()
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, statusResult)
    assert.deepStrictEqual(withApiKey(yield* Ref.get(fake.requests)), [
      {
        method: 'GET',
        url: 'http://radarr.example.test/api/v3/system/status',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('RadarrApiLive looks up movies with an encoded query parameter', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({ status: 200, body: [linuxIsoLookupApi] }))
    const layer = RadarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* Effect.gen(function* () {
      const api = yield* RadarrApi
      return yield* api.lookupMovies('Linux ISO')
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, [linuxIsoLookupDomain])
    assert.deepStrictEqual(withApiKey(yield* Ref.get(fake.requests)), [
      {
        method: 'GET',
        url: 'http://radarr.example.test/api/v3/movie/lookup?term=Linux%20ISO',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('RadarrApiLive adds a movie via an authenticated POST with a JSON body', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({ status: 201, body: linuxIsoMovieApi }))
    const layer = RadarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const result = yield* Effect.gen(function* () {
      const api = yield* RadarrApi
      return yield* api.addMovie(linuxIsoLookupDomain, {
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        searchForMovie: true,
      })
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(result, {
      id: 42,
      title: 'Linux ISO: The Movie',
      year: 2024,
      tmdbId: 27_205,
      path: '/movies/Linux ISO The Movie (2024)',
      monitored: true,
      status: 'released',
      hasFile: true,
      qualityProfileId: 1,
      minimumAvailability: 'released',
      isAvailable: true,
      sizeOnDisk: 123_456,
      inCinemas: undefined,
      physicalRelease: undefined,
      digitalRelease: undefined,
      added: undefined,
      studio: undefined,
      runtime: undefined,
      certification: undefined,
      genres: undefined,
    })
    assert.deepStrictEqual(withApiKey(yield* Ref.get(fake.requests)), [
      {
        method: 'POST',
        url: 'http://radarr.example.test/api/v3/movie',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('RadarrApiLive removes a movie via an authenticated DELETE with query parameters', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({ status: 200, body: null }))
    const layer = RadarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    yield* Effect.gen(function* () {
      const api = yield* RadarrApi
      return yield* api.removeMovie(42, { deleteFiles: true })
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(withApiKey(yield* Ref.get(fake.requests)), [
      {
        method: 'DELETE',
        url: 'http://radarr.example.test/api/v3/movie/42?deleteFiles=true&addImportExclusion=false',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('RadarrApiLive fetches then updates collection monitoring via authenticated GET and PUT', () =>
  Effect.gen(function* () {
    const collectionBody = { id: 7, title: 'Linux ISO Collection', tmdbId: 10, monitored: false, searchOnAdd: false }
    const fake = yield* makeRecordingHttpClient(() => ({ status: 200, body: collectionBody }))
    const layer = RadarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    yield* Effect.gen(function* () {
      const api = yield* RadarrApi
      return yield* api.setCollectionMonitoring(7)
    }).pipe(Effect.provide(layer))

    assert.deepStrictEqual(withApiKey(yield* Ref.get(fake.requests)), [
      {
        method: 'GET',
        url: 'http://radarr.example.test/api/v3/collection/7',
        apiKey: 'secret',
      },
      {
        method: 'PUT',
        url: 'http://radarr.example.test/api/v3/collection/7',
        apiKey: 'secret',
      },
    ])
  })
)

it.effect('RadarrApiLive maps non-2xx responses to RadarrHttpError', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({ status: 500, body: { message: 'server error' } }))
    const layer = RadarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const error = yield* Effect.gen(function* () {
      const api = yield* RadarrApi
      return yield* api.qualityProfiles()
    }).pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(error._tag, 'RadarrHttpError')
    assert.strictEqual(error.code, 'RADARR_HTTP_ERROR')
    assert.strictEqual(error.message, 'Radarr returned HTTP 500')
  })
)

it.effect('RadarrApiLive maps transport failures to RadarrUnreachableError', () =>
  Effect.gen(function* () {
    const layer = RadarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, unreachableLayer)))

    const error = yield* Effect.gen(function* () {
      const api = yield* RadarrApi
      return yield* api.status()
    }).pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(error._tag, 'RadarrUnreachableError')
    assert.strictEqual(error.code, 'RADARR_UNREACHABLE')
  })
)

it.effect('RadarrApiLive maps malformed response bodies to RadarrDecodeError', () =>
  Effect.gen(function* () {
    const fake = yield* makeRecordingHttpClient(() => ({ status: 200, body: [{ title: 'Missing TMDB id' }] }))
    const layer = RadarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ConfigLayer, fake.layer)))

    const error = yield* Effect.gen(function* () {
      const api = yield* RadarrApi
      return yield* api.lookupMovies('Linux ISO')
    }).pipe(Effect.provide(layer), Effect.flip)

    assert.strictEqual(error._tag, 'RadarrDecodeError')
    assert.strictEqual(error.code, 'RADARR_DECODE_ERROR')
  })
)
