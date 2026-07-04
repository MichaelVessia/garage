import { makeJsonClient } from '@garage/cli-protocol'
import type { JsonClient } from '@garage/cli-protocol'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

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

const applyAuth = (config: RadarrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': Redacted.value(config.apiKey),
  })

const httpClientFor = (client: HttpClient.HttpClient, config: RadarrConfigValue) =>
  makeJsonClient<RadarrError>({
    client,
    baseUrl: config.url,
    applyAuth: applyAuth(config),
    errors: { httpError, unreachable, decodeError },
  })

const lookupByTmdbId = Effect.fn('radarr.lookupByTmdbId')(function* (
  http: JsonClient<RadarrError>,
  tmdbId: number
): Effect.fn.Return<Option.Option<MovieLookupResult>, RadarrError> {
  yield* Effect.annotateCurrentSpan({ 'radarr.tmdb_id': tmdbId })
  return yield* http
    .getJson('/api/v3/movie/lookup', Schema.Array(MovieLookupSchema), [['term', `tmdb:${tmdbId}`]])
    .pipe(Effect.map((results) => Option.fromUndefinedOr(results[0])))
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
    const withConfig = <A, E>(f: (http: JsonClient<RadarrError>) => Effect.Effect<A, E>) =>
      radarrConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config))))

    return RadarrApi.of({
      status: () => withConfig((http) => http.getJson('/api/v3/system/status', StatusSchema)),
      rootFolders: () => withConfig((http) => http.getJson('/api/v3/rootfolder', Schema.Array(RootFolderSchema))),
      qualityProfiles: () =>
        withConfig((http) => http.getJson('/api/v3/qualityprofile', Schema.Array(QualityProfileSchema))),
      lookupMovies: (query) =>
        withConfig((http) => http.getJson('/api/v3/movie/lookup', Schema.Array(MovieLookupSchema), [['term', query]])),
      lookupMovieByTmdbId: (tmdbId) => withConfig((http) => lookupByTmdbId(http, tmdbId)),
      getMovieByTmdbId: (tmdbId) =>
        withConfig((http) =>
          http
            .getJson('/api/v3/movie', Schema.Array(MovieRecordSchema), [['tmdbId', tmdbId]])
            .pipe(Effect.map((records) => Option.fromUndefinedOr(records[0])))
        ),
      addMovie: (lookup, options) =>
        withConfig((http) =>
          http.postJson('/api/v3/movie', MovieRecordSchema, {
            title: lookup.title,
            titleSlug: lookup.titleSlug,
            year: lookup.year,
            tmdbId: lookup.tmdbId,
            qualityProfileId: options.qualityProfileId,
            rootFolderPath: options.rootFolderPath,
            monitored: true,
            minimumAvailability: 'released',
            addOptions: { searchForMovie: options.searchForMovie },
          })
        ),
      removeMovie: (movieId, options) =>
        withConfig((http) =>
          http
            .deleteJson(`/api/v3/movie/${movieId}`, Schema.Unknown, [
              ['deleteFiles', options.deleteFiles],
              ['addImportExclusion', false],
            ])
            .pipe(Effect.asVoid)
        ),
      collections: () => withConfig((http) => http.getJson('/api/v3/collection', Schema.Array(CollectionRecordSchema))),
      setCollectionMonitoring: (collectionId) =>
        withConfig(
          Effect.fn('RadarrApi.setCollectionMonitoring.configured')(function* (http) {
            const collection = yield* http.getJson(`/api/v3/collection/${collectionId}`, JsonObject)
            yield* http.putJson(`/api/v3/collection/${collectionId}`, Schema.Unknown, {
              ...collection,
              monitored: true,
              searchOnAdd: true,
            })
          })
        ),
      queue: (limit) =>
        withConfig((http) =>
          http.getJson('/api/v3/queue', QueueResponseSchema, [
            ['pageSize', limit],
            ['includeUnknownMovieItems', true],
            ['includeMovie', true],
          ])
        ),
      calendar: (days) =>
        withConfig(
          Effect.fn('RadarrApi.calendar.configured')(function* (http) {
            const range = yield* currentCalendarRange(days)
            return yield* http.getJson('/api/v3/calendar', Schema.Array(MovieReleaseSchema), [
              ...range,
              ['unmonitored', false],
            ])
          })
        ),
      missing: (limit) =>
        withConfig((http) =>
          http.getJson('/api/v3/wanted/missing', MissingResponseSchema, [
            ['pageSize', limit],
            ['monitored', true],
            ['sortKey', 'releaseDate'],
            ['sortDirection', 'descending'],
          ])
        ),
      history: (limit) =>
        withConfig((http) =>
          http.getJson('/api/v3/history', HistoryResponseSchema, [
            ['pageSize', limit],
            ['includeMovie', true],
            ['sortKey', 'date'],
            ['sortDirection', 'descending'],
          ])
        ),
    })
  })
)
