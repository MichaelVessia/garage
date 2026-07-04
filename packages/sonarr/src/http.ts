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
  EpisodeRecordSchema,
  HistoryResponseSchema,
  LookupSeriesSchema,
  MissingResponseSchema,
  QualityProfileSchema,
  QueueResponseSchema,
  RootFolderSchema,
  SeriesRecordSchema,
  StatusSchema,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { SonarrError } from './errors.js'
import type { SeriesLookupResult, SonarrConfigValue } from './model.js'
import { SonarrApi, SonarrConfig } from './services.js'

const applyAuth = (config: SonarrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': Redacted.value(config.apiKey),
  })

const httpClientFor = (client: HttpClient.HttpClient, config: SonarrConfigValue) =>
  makeJsonClient<SonarrError>({
    client,
    baseUrl: config.url,
    applyAuth: applyAuth(config),
    errors: { httpError, unreachable, decodeError },
  })

const lookupByTvdbId = Effect.fn('sonarr.lookupByTvdbId')(function* (
  http: JsonClient<SonarrError>,
  tvdbId: number
): Effect.fn.Return<Option.Option<SeriesLookupResult>, SonarrError> {
  yield* Effect.annotateCurrentSpan({ 'sonarr.tvdb_id': tvdbId })
  return yield* http
    .getJson('/api/v3/series/lookup', Schema.Array(LookupSeriesSchema), [['term', `tvdb:${tvdbId}`]])
    .pipe(Effect.map((results) => Option.fromUndefinedOr(results[0])))
})

const currentCalendarRange = Effect.fn('sonarr.currentCalendarRange')(function* (
  days: number
): Effect.fn.Return<ReadonlyArray<readonly [string, string]>> {
  const now = yield* DateTime.now
  const end = now.pipe(DateTime.add({ days }))
  return [
    ['start', DateTime.formatIso(now)],
    ['end', DateTime.formatIso(end)],
  ]
})

export const SonarrApiLive = Layer.effect(
  SonarrApi,
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E>(f: (http: JsonClient<SonarrError>) => Effect.Effect<A, E>) =>
      sonarrConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config))))

    return SonarrApi.of({
      status: () => withConfig((http) => http.getJson('/api/v3/system/status', StatusSchema)),
      rootFolders: () => withConfig((http) => http.getJson('/api/v3/rootfolder', Schema.Array(RootFolderSchema))),
      qualityProfiles: () =>
        withConfig((http) => http.getJson('/api/v3/qualityprofile', Schema.Array(QualityProfileSchema))),
      lookupSeries: (query) =>
        withConfig((http) =>
          http.getJson('/api/v3/series/lookup', Schema.Array(LookupSeriesSchema), [['term', query]])
        ),
      lookupSeriesByTvdbId: (tvdbId) => withConfig((http) => lookupByTvdbId(http, tvdbId)),
      getSeriesByTvdbId: (tvdbId) =>
        withConfig((http) =>
          http
            .getJson('/api/v3/series', Schema.Array(SeriesRecordSchema))
            .pipe(Effect.map((records) => Option.fromUndefinedOr(records.find((record) => record.tvdbId === tvdbId))))
        ),
      addSeries: (lookup, options) =>
        withConfig((http) =>
          http.postJson('/api/v3/series', SeriesRecordSchema, {
            title: lookup.title,
            titleSlug: lookup.titleSlug,
            tvdbId: lookup.tvdbId,
            qualityProfileId: options.qualityProfileId,
            rootFolderPath: options.rootFolderPath,
            monitored: true,
            addOptions: { searchForMissingEpisodes: options.searchForMissingEpisodes },
          })
        ),
      removeSeries: (seriesId, options) =>
        withConfig((http) =>
          http
            .deleteJson(`/api/v3/series/${seriesId}`, Schema.Unknown, [['deleteFiles', options.deleteFiles]])
            .pipe(Effect.asVoid)
        ),
      queue: (limit) =>
        withConfig((http) =>
          http.getJson('/api/v3/queue', QueueResponseSchema, [
            ['pageSize', limit],
            ['includeSeries', true],
            ['includeEpisode', true],
          ])
        ),
      calendar: (days) =>
        withConfig(
          Effect.fn('SonarrApi.calendar.configured')(function* (http) {
            const range = yield* currentCalendarRange(days)
            return yield* http.getJson('/api/v3/calendar', Schema.Array(EpisodeRecordSchema), [
              ...range,
              ['includeSeries', true],
              ['unmonitored', false],
            ])
          })
        ),
      missing: (limit) =>
        withConfig((http) =>
          http.getJson('/api/v3/wanted/missing', MissingResponseSchema, [
            ['pageSize', limit],
            ['includeSeries', true],
          ])
        ),
      history: (limit) =>
        withConfig((http) =>
          http.getJson('/api/v3/history', HistoryResponseSchema, [
            ['pageSize', limit],
            ['includeSeries', true],
            ['includeEpisode', true],
          ])
        ),
    })
  })
)
