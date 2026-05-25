import { DateTime, Effect, Layer, Option, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  CollectionRecordSchema,
  HistoryResponseSchema,
  JsonObjectSchema,
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

const optionFromUndefined = <A>(value: A | undefined): Option.Option<A> =>
  value === undefined ? Option.none() : Option.some(value)

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
  return query.length === 0
    ? `${normalizeBaseUrl(config.url)}${path}`
    : `${normalizeBaseUrl(config.url)}${path}?${query}`
}

const withAuth = (config: RadarrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': config.apiKey,
  })

const toDecodeError = (error: { readonly message: string }): RadarrError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, RadarrError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, RadarrError, RD> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

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

const postJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: RadarrConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, RadarrError, RD> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
      withAuth(config),
      HttpClientRequest.bodyJson(body),
      Effect.mapError((error) => decodeError(error.message))
    )

    return yield* executeJson(client, request, schema)
  })

const putJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: RadarrConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, RadarrError, RD> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.put(endpoint(config, path)).pipe(
      withAuth(config),
      HttpClientRequest.bodyJson(body),
      Effect.mapError((error) => decodeError(error.message))
    )

    return yield* executeJson(client, request, schema)
  })

const lookupByTmdbId = (
  client: HttpClient.HttpClient,
  config: RadarrConfigValue,
  tmdbId: number
): Effect.Effect<Option.Option<MovieLookupResult>, RadarrError> =>
  getJson(client, config, '/api/v3/movie/lookup', Schema.Array(MovieLookupSchema), [['term', `tmdb:${tmdbId}`]]).pipe(
    Effect.map((results) => optionFromUndefined(results[0]))
  )

const currentCalendarRange = (days: number): Effect.Effect<ReadonlyArray<readonly [string, string]>> =>
  DateTime.now.pipe(
    Effect.map((now) => {
      const end = now.pipe(DateTime.add({ days }))
      return [
        ['start', DateTime.formatIso(now)],
        ['end', DateTime.formatIso(end)],
      ]
    })
  )

export const RadarrApiLive = Layer.effect(
  RadarrApi,
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    const config = yield* radarrConfig.get
    const client = yield* HttpClient.HttpClient

    return RadarrApi.of({
      status: getJson(client, config, '/api/v3/system/status', StatusSchema),
      rootFolders: getJson(client, config, '/api/v3/rootfolder', Schema.Array(RootFolderSchema)),
      qualityProfiles: getJson(client, config, '/api/v3/qualityprofile', Schema.Array(QualityProfileSchema)),
      lookupMovies: (query) =>
        getJson(client, config, '/api/v3/movie/lookup', Schema.Array(MovieLookupSchema), [['term', query]]),
      lookupMovieByTmdbId: (tmdbId) => lookupByTmdbId(client, config, tmdbId),
      getMovieByTmdbId: (tmdbId) =>
        getJson(client, config, '/api/v3/movie', Schema.Array(MovieRecordSchema), [['tmdbId', tmdbId]]).pipe(
          Effect.map((records) => optionFromUndefined(records[0]))
        ),
      addMovie: (lookup, options) =>
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
        ),
      removeMovie: (movieId, options) =>
        deleteJson(client, config, `/api/v3/movie/${movieId}`, Schema.Unknown, [
          ['deleteFiles', options.deleteFiles],
          ['addImportExclusion', false],
        ]).pipe(Effect.asVoid),
      collections: getJson(client, config, '/api/v3/collection', Schema.Array(CollectionRecordSchema)),
      setCollectionMonitoring: (collectionId) =>
        Effect.gen(function* () {
          const collection = yield* getJson(client, config, `/api/v3/collection/${collectionId}`, JsonObjectSchema)
          yield* putJson(
            client,
            config,
            `/api/v3/collection/${collectionId}`,
            { ...collection, monitored: true, searchOnAdd: true },
            Schema.Unknown
          )
        }),
      queue: (limit) =>
        getJson(client, config, '/api/v3/queue', QueueResponseSchema, [
          ['pageSize', limit],
          ['includeUnknownMovieItems', true],
          ['includeMovie', true],
        ]),
      calendar: (days) =>
        currentCalendarRange(days).pipe(
          Effect.flatMap((range) =>
            getJson(client, config, '/api/v3/calendar', Schema.Array(MovieReleaseSchema), [
              ...range,
              ['unmonitored', false],
            ])
          )
        ),
      missing: (limit) =>
        getJson(client, config, '/api/v3/wanted/missing', MissingResponseSchema, [
          ['pageSize', limit],
          ['monitored', true],
          ['sortKey', 'releaseDate'],
          ['sortDirection', 'descending'],
        ]),
      history: (limit) =>
        getJson(client, config, '/api/v3/history', HistoryResponseSchema, [
          ['pageSize', limit],
          ['includeMovie', true],
          ['sortKey', 'date'],
          ['sortDirection', 'descending'],
        ]),
    })
  })
)
