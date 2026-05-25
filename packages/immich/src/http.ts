import { Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  AlbumInfoSchema,
  AlbumSchema,
  CurrentUserSchema,
  JobsSchema,
  PeopleResponseSchema,
  PersonSchema,
  PingSchema,
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

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: ReadonlyArray<readonly [string, string | number | boolean]>): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const endpoint = (
  config: ImmichConfigValue,
  path: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): string => {
  const query = queryString(params)
  return query.length === 0
    ? `${normalizeBaseUrl(config.url)}/api${path}`
    : `${normalizeBaseUrl(config.url)}/api${path}?${query}`
}

const withAuth = (config: ImmichConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': config.apiKey,
  })

const toDecodeError = (error: { readonly message: string }): ImmichError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, ImmichError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, ImmichError, RD> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

    if (response.status < 200 || response.status >= 300) {
      return yield* httpError(response.status)
    }

    return yield* decodeBody(response, schema)
  })

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: ImmichConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, ImmichError, RD> =>
  executeJson(client, HttpClientRequest.get(endpoint(config, path, params)).pipe(withAuth(config)), schema)

const postJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: ImmichConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, ImmichError, RD> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
      withAuth(config),
      HttpClientRequest.bodyJson(body),
      Effect.mapError((error) => decodeError(error.message))
    )

    return yield* executeJson(client, request, schema)
  })

const metadataSearch = Effect.fn('immich.metadataSearch')(function* (
  client: HttpClient.HttpClient,
  config: ImmichConfigValue,
  options: SearchOptions
): Effect.fn.Return<SearchResult, ImmichError> {
  yield* Effect.annotateCurrentSpan({ 'immich.search_strategy': 'metadata' })
  return yield* postJson(
    client,
    config,
    '/search/metadata',
    { originalFileName: options.query, size: options.limit },
    SearchResponseSchema('metadata', options.query)
  )
})

const systemStatus = (versionParts: VersionParts, ping: typeof PingSchema.Type): SystemStatus => ({
  version: `${versionParts.major}.${versionParts.minor}.${versionParts.patch}`,
  versionParts,
  ping: ping.res === null ? undefined : ping.res,
})

export const ImmichApiLive = Layer.effect(
  ImmichApi,
  Effect.gen(function* () {
    const immichConfig = yield* ImmichConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E, R>(
      f: (config: ImmichConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | ImmichError, R> => immichConfig.get().pipe(Effect.flatMap(f))

    return ImmichApi.of({
      status: Effect.fn('ImmichApi.status')(
        function* () {
          return yield* withConfig((config) =>
            Effect.all({
              version: getJson(client, config, '/server/version', VersionSchema),
              ping: getJson(client, config, '/server/ping', PingSchema),
            }).pipe(Effect.map(({ version, ping }) => systemStatus(version, ping)))
          )
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'status' })
      ),
      stats: Effect.fn('ImmichApi.stats')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, '/server/statistics', StatisticsSchema))
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'stats' })
      ),
      storage: Effect.fn('ImmichApi.storage')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, '/server/storage', StorageSchema))
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'storage' })
      ),
      users: Effect.fn('ImmichApi.users')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/admin/users', Schema.Array(UserSchema)).pipe(
              Effect.map((records) => usersResult(records)),
              Effect.catchTag('ImmichHttpError', (error) =>
                error.status === 403
                  ? getJson(client, config, '/users', Schema.Array(UserSchema)).pipe(
                      Effect.map((records) =>
                        usersResult(records, 'admin fields unavailable: API key lacks adminUser.read')
                      )
                    )
                  : Effect.fail(error)
              )
            )
          )
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'users' })
      ),
      me: Effect.fn('ImmichApi.me')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, '/users/me', CurrentUserSchema))
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'me' })
      ),
      albums: Effect.fn('ImmichApi.albums')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'immich.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, '/albums', Schema.Array(AlbumSchema)).pipe(
              Effect.map((records) => recordsList(records.slice(0, options.limit)))
            )
          )
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'albums' })
      ),
      albumInfo: Effect.fn('ImmichApi.albumInfo')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'immich.album_id': options.id, 'immich.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, `/albums/${options.id}`, AlbumInfoSchema(options.limit))
          )
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'albumInfo' })
      ),
      search: Effect.fn('ImmichApi.search')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({
            'immich.query_length': options.query.length,
            'immich.limit': options.limit,
            'immich.search_strategy': 'smart',
          })
          return yield* withConfig((config) =>
            postJson(
              client,
              config,
              '/search/smart',
              { query: options.query, size: options.limit },
              SearchResponseSchema('smart', options.query)
            ).pipe(
              Effect.flatMap((response) =>
                response.count > 0 ? Effect.succeed(response) : metadataSearch(client, config, options)
              )
            )
          )
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'search' })
      ),
      recent: Effect.fn('ImmichApi.recent')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'immich.limit': options.limit, 'immich.search_strategy': 'metadata' })
          return yield* withConfig((config) =>
            postJson(
              client,
              config,
              '/search/metadata',
              { size: options.limit, order: 'desc' },
              SearchResponseSchema('metadata', 'recent')
            )
          )
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'recent' })
      ),
      people: Effect.fn('ImmichApi.people')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'immich.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, '/people', PeopleResponseSchema, [
              ['withHidden', false],
              ['size', options.limit],
            ])
          )
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'people' })
      ),
      personInfo: Effect.fn('ImmichApi.personInfo')(
        function* (personId) {
          yield* Effect.annotateCurrentSpan({ 'immich.person_id': personId })
          return yield* withConfig((config) => getJson(client, config, `/people/${personId}`, PersonSchema))
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'personInfo' })
      ),
      jobs: Effect.fn('ImmichApi.jobs')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, '/jobs', JobsSchema))
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'jobs' })
      ),
      tags: Effect.fn('ImmichApi.tags')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/tags', Schema.Array(TagSchema)).pipe(Effect.map(recordsList))
          )
        },
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichApi', method: 'tags' })
      ),
    })
  })
)
