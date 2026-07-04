import { makeJsonClient } from '@garage/cli-protocol'
import type { JsonClient } from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

import {
  AlbumInfoSchema,
  AlbumSchema,
  CurrentUserSchema,
  JobsSchema,
  PeopleResponseSchema,
  PersonSchema,
  Ping,
  SearchResponseSchema,
  StatisticsSchema,
  StorageSchema,
  TagSchema,
  UserSchema,
  VersionSchema,
  recordsList,
  usersResult,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { ImmichError } from './errors.js'
import type { ImmichConfigValue, SearchOptions, SearchResult, SystemStatus, VersionParts } from './model.js'
import { ImmichApi, ImmichConfig } from './services.js'

const applyAuth = (config: ImmichConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': Redacted.value(config.apiKey),
  })

const httpClientFor = (client: HttpClient.HttpClient, config: ImmichConfigValue) =>
  makeJsonClient<ImmichError>({
    client,
    baseUrl: config.url,
    basePath: '/api',
    applyAuth: applyAuth(config),
    errors: { httpError, unreachable, decodeError },
  })

const metadataSearch = Effect.fn('immich.metadataSearch')(function* (
  http: JsonClient<ImmichError>,
  options: SearchOptions
): Effect.fn.Return<SearchResult, ImmichError> {
  yield* Effect.annotateCurrentSpan({ 'immich.search_strategy': 'metadata' })
  return yield* http.postJson('/search/metadata', SearchResponseSchema('metadata', options.query), {
    originalFileName: options.query,
    size: options.limit,
  })
})

const systemStatus = (versionParts: VersionParts, ping: typeof Ping.Type): SystemStatus => ({
  version: `${versionParts.major}.${versionParts.minor}.${versionParts.patch}`,
  versionParts,
  ping: ping.res === null ? undefined : ping.res,
})

export const ImmichApiLive = Layer.effect(
  ImmichApi,
  Effect.gen(function* () {
    const immichConfig = yield* ImmichConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E>(f: (http: JsonClient<ImmichError>) => Effect.Effect<A, E>) =>
      immichConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config))))

    return ImmichApi.of({
      status: () =>
        withConfig((http) =>
          Effect.all(
            {
              version: http.getJson('/server/version', VersionSchema),
              ping: http.getJson('/server/ping', Ping),
            },
            { concurrency: 'unbounded' }
          ).pipe(Effect.map(({ version, ping }) => systemStatus(version, ping)))
        ),
      stats: () => withConfig((http) => http.getJson('/server/statistics', StatisticsSchema)),
      storage: () => withConfig((http) => http.getJson('/server/storage', StorageSchema)),
      users: () =>
        withConfig((http) =>
          http.getJson('/admin/users', Schema.Array(UserSchema)).pipe(
            Effect.map((records) => usersResult(records)),
            Effect.catchTag('ImmichHttpError', (failure) =>
              failure.status === 403
                ? http
                    .getJson('/users', Schema.Array(UserSchema))
                    .pipe(
                      Effect.map((records) =>
                        usersResult(records, 'admin fields unavailable: API key lacks adminUser.read')
                      )
                    )
                : Effect.fail(failure)
            )
          )
        ),
      me: () => withConfig((http) => http.getJson('/users/me', CurrentUserSchema)),
      albums: (options) =>
        withConfig((http) =>
          http
            .getJson('/albums', Schema.Array(AlbumSchema))
            .pipe(Effect.map((records) => recordsList(records.slice(0, options.limit))))
        ),
      albumInfo: (options) =>
        withConfig((http) => http.getJson(`/albums/${options.id}`, AlbumInfoSchema(options.limit))),
      search: (options) =>
        withConfig((http) =>
          http
            .postJson('/search/smart', SearchResponseSchema('smart', options.query), {
              query: options.query,
              size: options.limit,
            })
            .pipe(
              Effect.flatMap((response) =>
                response.count > 0 ? Effect.succeed(response) : metadataSearch(http, options)
              )
            )
        ),
      recent: (options) =>
        withConfig((http) =>
          http.postJson('/search/metadata', SearchResponseSchema('metadata', 'recent'), {
            size: options.limit,
            order: 'desc',
          })
        ),
      people: (options) =>
        withConfig((http) =>
          http.getJson('/people', PeopleResponseSchema, [
            ['withHidden', false],
            ['size', options.limit],
          ])
        ),
      personInfo: (personId) => withConfig((http) => http.getJson(`/people/${personId}`, PersonSchema)),
      jobs: () => withConfig((http) => http.getJson('/jobs', JobsSchema)),
      tags: () => withConfig((http) => http.getJson('/tags', Schema.Array(TagSchema)).pipe(Effect.map(recordsList))),
    })
  })
)
