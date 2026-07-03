import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  CollectionRecordSchema,
  HistoryResponseSchema,
  JsonObject,
  MissingResponseSchema,
  MovieLookupSchema,
  MovieRecordSchema,
  MovieReleaseSchema,
  QualityProfileSchema,
  QueueResponseSchema,
  RootFolderSchema,
  StatusSchema,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { RadarrError } from './errors.js'
import type { MovieLookupResult, RadarrConfigValue } from './model.js'
import { RadarrApi, RadarrConfig } from './services.js'

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: ReadonlyArray<readonly [string, string | number | boolean]>): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const endpoint = (
  config: RadarrConfigValue,
  path: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): string => {
  const query = queryString(params)
  return Str.isEmpty(query)
    ? `${normalizeBaseUrl(config.url)}${path}`
    : `${normalizeBaseUrl(config.url)}${path}?${query}`
}

const withAuth = (config: RadarrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': Redacted.value(config.apiKey),
  })

const toDecodeError = (error: { readonly message: string }): RadarrError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, RadarrError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = Effect.fn('radarr.executeJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, RadarrError, RD> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

  if (response.status < 200 || response.status >= 300) {
    return yield* httpError(response.status)
  }

  return yield* decodeBody(response, schema)
})

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: RadarrConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, RadarrError, RD> =>
  executeJson(client, HttpClientRequest.get(endpoint(config, path, params)).pipe(withAuth(config)), schema)

const deleteJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: RadarrConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, RadarrError, RD> =>
  executeJson(client, HttpClientRequest.delete(endpoint(config, path, params)).pipe(withAuth(config)), schema)

const postJson = Effect.fn('radarr.postJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: RadarrConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, RadarrError, RD> {
  const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
    withAuth(config),
    HttpClientRequest.bodyJson(body),
    Effect.mapError((error) => decodeError(error.message, error))
  )

  return yield* executeJson(client, request, schema)
})

const putJson = Effect.fn('radarr.putJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: RadarrConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, RadarrError, RD> {
  const request = yield* HttpClientRequest.put(endpoint(config, path)).pipe(
    withAuth(config),
    HttpClientRequest.bodyJson(body),
    Effect.mapError((error) => decodeError(error.message, error))
  )

  return yield* executeJson(client, request, schema)
})

const lookupByTmdbId = Effect.fn('radarr.lookupByTmdbId')(function* (
  client: HttpClient.HttpClient,
  config: RadarrConfigValue,
  tmdbId: number
): Effect.fn.Return<Option.Option<MovieLookupResult>, RadarrError> {
  yield* Effect.annotateCurrentSpan({ 'radarr.tmdb_id': tmdbId })
  return yield* getJson(client, config, '/api/v3/movie/lookup', Schema.Array(MovieLookupSchema), [
    ['term', `tmdb:${tmdbId}`],
  ]).pipe(Effect.map((results) => Option.fromUndefinedOr(results[0])))
})

const currentCalendarRange = Effect.fn('radarr.currentCalendarRange')(function* (
  days: number
): Effect.fn.Return<ReadonlyArray<readonly [string, string]>> {
  const now = yield* DateTime.now
  const end = now.pipe(DateTime.add({ days }))
  return [
    ['start', DateTime.formatIso(now)],
    ['end', DateTime.formatIso(end)],
  ]
})

export const RadarrApiLive = Layer.effect(
  RadarrApi,
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E, R>(
      f: (config: RadarrConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | RadarrError, R> => radarrConfig.get().pipe(Effect.flatMap(f))

    return RadarrApi.of({
      status: Effect.fn('RadarrApi.status')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, '/api/v3/system/status', StatusSchema))
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'status' })
      ),
      rootFolders: Effect.fn('RadarrApi.rootFolders')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v3/rootfolder', Schema.Array(RootFolderSchema))
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'rootFolders' })
      ),
      qualityProfiles: Effect.fn('RadarrApi.qualityProfiles')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v3/qualityprofile', Schema.Array(QualityProfileSchema))
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'qualityProfiles' })
      ),
      lookupMovies: Effect.fn('RadarrApi.lookupMovies')(
        function* (query) {
          yield* Effect.annotateCurrentSpan({ 'radarr.query_length': query.length })
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v3/movie/lookup', Schema.Array(MovieLookupSchema), [['term', query]])
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'lookupMovies' })
      ),
      lookupMovieByTmdbId: Effect.fn('RadarrApi.lookupMovieByTmdbId')(
        function* (tmdbId) {
          yield* Effect.annotateCurrentSpan({ 'radarr.tmdb_id': tmdbId })
          return yield* withConfig((config) => lookupByTmdbId(client, config, tmdbId))
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'lookupMovieByTmdbId' })
      ),
      getMovieByTmdbId: Effect.fn('RadarrApi.getMovieByTmdbId')(
        function* (tmdbId) {
          yield* Effect.annotateCurrentSpan({ 'radarr.tmdb_id': tmdbId })
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v3/movie', Schema.Array(MovieRecordSchema), [['tmdbId', tmdbId]]).pipe(
              Effect.map((records) => Option.fromUndefinedOr(records[0]))
            )
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'getMovieByTmdbId' })
      ),
      addMovie: Effect.fn('RadarrApi.addMovie')(
        function* (lookup, options) {
          yield* Effect.annotateCurrentSpan({ 'radarr.tmdb_id': lookup.tmdbId })
          return yield* withConfig((config) =>
            postJson(
              client,
              config,
              '/api/v3/movie',
              {
                title: lookup.title,
                titleSlug: lookup.titleSlug,
                year: lookup.year,
                tmdbId: lookup.tmdbId,
                qualityProfileId: options.qualityProfileId,
                rootFolderPath: options.rootFolderPath,
                monitored: true,
                minimumAvailability: 'released',
                addOptions: { searchForMovie: options.searchForMovie },
              },
              MovieRecordSchema
            )
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'addMovie' })
      ),
      removeMovie: Effect.fn('RadarrApi.removeMovie')(
        function* (movieId, options) {
          yield* Effect.annotateCurrentSpan({ 'radarr.movie_id': movieId, 'radarr.delete_files': options.deleteFiles })
          return yield* withConfig((config) =>
            deleteJson(client, config, `/api/v3/movie/${movieId}`, Schema.Unknown, [
              ['deleteFiles', options.deleteFiles],
              ['addImportExclusion', false],
            ]).pipe(Effect.asVoid)
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'removeMovie' })
      ),
      collections: Effect.fn('RadarrApi.collections')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v3/collection', Schema.Array(CollectionRecordSchema))
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'collections' })
      ),
      setCollectionMonitoring: Effect.fn('RadarrApi.setCollectionMonitoring')(
        function* (collectionId) {
          yield* Effect.annotateCurrentSpan({ 'radarr.collection_id': collectionId })
          return yield* withConfig(
            Effect.fn('RadarrApi.setCollectionMonitoring.configured')(function* (config) {
              const collection = yield* getJson(client, config, `/api/v3/collection/${collectionId}`, JsonObject)
              yield* putJson(
                client,
                config,
                `/api/v3/collection/${collectionId}`,
                { ...collection, monitored: true, searchOnAdd: true },
                Schema.Unknown
              )
            })
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'setCollectionMonitoring' })
      ),
      queue: Effect.fn('RadarrApi.queue')(
        function* (limit) {
          yield* Effect.annotateCurrentSpan({ 'radarr.limit': limit })
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v3/queue', QueueResponseSchema, [
              ['pageSize', limit],
              ['includeUnknownMovieItems', true],
              ['includeMovie', true],
            ])
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'queue' })
      ),
      calendar: Effect.fn('RadarrApi.calendar')(
        function* (days) {
          yield* Effect.annotateCurrentSpan({ 'radarr.days': days })
          return yield* withConfig(
            Effect.fn('RadarrApi.calendar.configured')(function* (config) {
              const range = yield* currentCalendarRange(days)
              return yield* getJson(client, config, '/api/v3/calendar', Schema.Array(MovieReleaseSchema), [
                ...range,
                ['unmonitored', false],
              ])
            })
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'calendar' })
      ),
      missing: Effect.fn('RadarrApi.missing')(
        function* (limit) {
          yield* Effect.annotateCurrentSpan({ 'radarr.limit': limit })
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v3/wanted/missing', MissingResponseSchema, [
              ['pageSize', limit],
              ['monitored', true],
              ['sortKey', 'releaseDate'],
              ['sortDirection', 'descending'],
            ])
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'missing' })
      ),
      history: Effect.fn('RadarrApi.history')(
        function* (limit) {
          yield* Effect.annotateCurrentSpan({ 'radarr.limit': limit })
          return yield* withConfig((config) =>
            getJson(client, config, '/api/v3/history', HistoryResponseSchema, [
              ['pageSize', limit],
              ['includeMovie', true],
              ['sortKey', 'date'],
              ['sortDirection', 'descending'],
            ])
          )
        },
        Effect.annotateLogs({ package: '@garage/radarr', service: 'RadarrApi', method: 'history' })
      ),
    })
  })
)
