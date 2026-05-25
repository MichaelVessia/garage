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

const metadataSearch = (
  client: HttpClient.HttpClient,
  config: ImmichConfigValue,
  options: SearchOptions
): Effect.Effect<SearchResult, ImmichError> =>
  postJson(
    client,
    config,
    '/search/metadata',
    { originalFileName: options.query, size: options.limit },
    SearchResponseSchema('metadata', options.query)
  )

const systemStatus = (versionParts: VersionParts, ping: typeof PingSchema.Type): SystemStatus => ({
  version: `${versionParts.major}.${versionParts.minor}.${versionParts.patch}`,
  versionParts,
  ping: ping.res === null ? undefined : ping.res,
})

export const ImmichApiLive = Layer.effect(
  ImmichApi,
  Effect.gen(function* () {
    const immichConfig = yield* ImmichConfig
    const config = yield* immichConfig.get
    const client = yield* HttpClient.HttpClient

    return ImmichApi.of({
      status: Effect.all({
        version: getJson(client, config, '/server/version', VersionSchema),
        ping: getJson(client, config, '/server/ping', PingSchema),
      }).pipe(Effect.map(({ version, ping }) => systemStatus(version, ping))),
      stats: getJson(client, config, '/server/statistics', StatisticsSchema),
      storage: getJson(client, config, '/server/storage', StorageSchema),
      users: getJson(client, config, '/admin/users', Schema.Array(UserSchema)).pipe(
        Effect.map((records) => usersResult(records)),
        Effect.matchEffect({
          onFailure: () =>
            getJson(client, config, '/users', Schema.Array(UserSchema)).pipe(
              Effect.map((records) => usersResult(records, 'admin fields unavailable: API key lacks adminUser.read'))
            ),
          onSuccess: (result) => Effect.succeed(result),
        })
      ),
      me: getJson(client, config, '/users/me', CurrentUserSchema),
      albums: (options) =>
        getJson(client, config, '/albums', Schema.Array(AlbumSchema)).pipe(
          Effect.map((records) => recordsList(records.slice(0, options.limit)))
        ),
      albumInfo: (options) => getJson(client, config, `/albums/${options.id}`, AlbumInfoSchema(options.limit)),
      search: (options) =>
        postJson(
          client,
          config,
          '/search/smart',
          { query: options.query, size: options.limit },
          SearchResponseSchema('smart', options.query)
        ).pipe(
          Effect.matchEffect({
            onFailure: () => metadataSearch(client, config, options),
            onSuccess: (response) =>
              response.count > 0 ? Effect.succeed(response) : metadataSearch(client, config, options),
          })
        ),
      recent: (options) =>
        postJson(
          client,
          config,
          '/search/metadata',
          { size: options.limit, order: 'desc' },
          SearchResponseSchema('metadata', 'recent')
        ),
      people: (options) =>
        getJson(client, config, '/people', PeopleResponseSchema, [
          ['withHidden', false],
          ['size', options.limit],
        ]),
      personInfo: (personId) => getJson(client, config, `/people/${personId}`, PersonSchema),
      jobs: getJson(client, config, '/jobs', JobsSchema),
      tags: getJson(client, config, '/tags', Schema.Array(TagSchema)).pipe(Effect.map(recordsList)),
    })
  })
)
