import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

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
  return Str.isEmpty(query)
    ? `${normalizeBaseUrl(config.url)}/api${path}`
    : `${normalizeBaseUrl(config.url)}/api${path}?${query}`
}

const withAuth = (config: ImmichConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': Redacted.value(config.apiKey),
  })

const toDecodeError = (error: { readonly message: string }): ImmichError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, ImmichError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = Effect.fn('immich.executeJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, ImmichError, RD> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

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

const postJson = Effect.fn('immich.postJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: ImmichConfigValue,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, ImmichError, RD> {
  const request = yield* HttpClientRequest.post(endpoint(config, path)).pipe(
    withAuth(config),
    HttpClientRequest.bodyJson(body),
    Effect.mapError((error) => decodeError(error.message, error))
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
    const withConfig = <A, E, R>(
      f: (config: ImmichConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | ImmichError, R> => immichConfig.get().pipe(Effect.flatMap(f))

    return ImmichApi.of({
      status: () =>
        withConfig((config) =>
          Effect.all(
            {
              version: getJson(client, config, '/server/version', VersionSchema),
              ping: getJson(client, config, '/server/ping', Ping),
            },
            { concurrency: 'unbounded' }
          ).pipe(Effect.map(({ version, ping }) => systemStatus(version, ping)))
        ),
      stats: () => withConfig((config) => getJson(client, config, '/server/statistics', StatisticsSchema)),
      storage: () => withConfig((config) => getJson(client, config, '/server/storage', StorageSchema)),
      users: () =>
        withConfig((config) =>
          getJson(client, config, '/admin/users', Schema.Array(UserSchema)).pipe(
            Effect.map((records) => usersResult(records)),
            Effect.catchTag('ImmichHttpError', (failure) =>
              failure.status === 403
                ? getJson(client, config, '/users', Schema.Array(UserSchema)).pipe(
                    Effect.map((records) =>
                      usersResult(records, 'admin fields unavailable: API key lacks adminUser.read')
                    )
                  )
                : Effect.fail(failure)
            )
          )
        ),
      me: () => withConfig((config) => getJson(client, config, '/users/me', CurrentUserSchema)),
      albums: (options) =>
        withConfig((config) =>
          getJson(client, config, '/albums', Schema.Array(AlbumSchema)).pipe(
            Effect.map((records) => recordsList(records.slice(0, options.limit)))
          )
        ),
      albumInfo: (options) =>
        withConfig((config) => getJson(client, config, `/albums/${options.id}`, AlbumInfoSchema(options.limit))),
      search: (options) =>
        withConfig((config) =>
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
        ),
      recent: (options) =>
        withConfig((config) =>
          postJson(
            client,
            config,
            '/search/metadata',
            { size: options.limit, order: 'desc' },
            SearchResponseSchema('metadata', 'recent')
          )
        ),
      people: (options) =>
        withConfig((config) =>
          getJson(client, config, '/people', PeopleResponseSchema, [
            ['withHidden', false],
            ['size', options.limit],
          ])
        ),
      personInfo: (personId) => withConfig((config) => getJson(client, config, `/people/${personId}`, PersonSchema)),
      jobs: () => withConfig((config) => getJson(client, config, '/jobs', JobsSchema)),
      tags: () =>
        withConfig((config) => getJson(client, config, '/tags', Schema.Array(TagSchema)).pipe(Effect.map(recordsList))),
    })
  })
)
