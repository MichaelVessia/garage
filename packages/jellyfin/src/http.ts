import { Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  ItemsResponseSchema,
  BaseItemSchema,
  LibrarySchema,
  LibraryStatsSchema,
  ScheduledTaskSchema,
  SessionSchema,
  SystemInfoSchema,
  UserSchema,
} from './api-schema.js'
import { decodeError, httpError, notFound, unreachable } from './errors.js'
import type { JellyfinError } from './errors.js'
import type { JellyfinConfigValue, ListResult } from './model.js'
import { JellyfinApi, JellyfinConfig } from './services.js'

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: ReadonlyArray<readonly [string, string | number | boolean]>): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const endpoint = (
  config: JellyfinConfigValue,
  path: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): string => {
  const query = queryString(params)
  return query.length === 0
    ? `${normalizeBaseUrl(config.url)}${path}`
    : `${normalizeBaseUrl(config.url)}${path}?${query}`
}

const withAuth = (config: JellyfinConfigValue) =>
  HttpClientRequest.setHeaders({ accept: 'application/json', 'x-emby-token': config.apiKey })

const toDecodeError = (error: { readonly message: string }): JellyfinError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, JellyfinError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, JellyfinError, RD> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))
    if (response.status < 200 || response.status >= 300) {
      return yield* httpError(response.status)
    }
    return yield* decodeBody(response, schema)
  })

const executeStatus = (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.Effect<number, JellyfinError> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))
    if (response.status < 200 || response.status >= 300) {
      return yield* httpError(response.status)
    }
    return response.status
  })

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: JellyfinConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, JellyfinError, RD> =>
  executeJson(client, HttpClientRequest.get(endpoint(config, path, params)).pipe(withAuth(config)), schema)

const listResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({ count: records.length, records })

const enabledUserId = (
  client: HttpClient.HttpClient,
  config: JellyfinConfigValue
): Effect.Effect<string, JellyfinError> =>
  getJson(client, config, '/Users', Schema.Array(UserSchema)).pipe(
    Effect.flatMap((users) => {
      const selected = users.find((user) => user.isDisabled !== true)
      return selected === undefined
        ? Effect.fail(notFound('No enabled Jellyfin user found'))
        : Effect.succeed(selected.id)
    })
  )

export const JellyfinApiLive = Layer.effect(
  JellyfinApi,
  Effect.gen(function* () {
    const jellyfinConfig = yield* JellyfinConfig
    const config = yield* jellyfinConfig.get
    const client = yield* HttpClient.HttpClient

    return JellyfinApi.of({
      status: getJson(client, config, '/System/Info', SystemInfoSchema),
      users: getJson(client, config, '/Users', Schema.Array(UserSchema)).pipe(Effect.map(listResult)),
      libraries: getJson(client, config, '/Library/VirtualFolders', Schema.Array(LibrarySchema)).pipe(
        Effect.map(listResult)
      ),
      sessions: getJson(client, config, '/Sessions', Schema.Array(SessionSchema)).pipe(Effect.map(listResult)),
      recentlyAdded: (options) =>
        enabledUserId(client, config).pipe(
          Effect.flatMap((userId) =>
            getJson(client, config, `/Users/${userId}/Items/Latest`, Schema.Array(BaseItemSchema), [
              ['Limit', options.limit],
            ])
          ),
          Effect.map(listResult)
        ),
      itemSearch: (options) =>
        enabledUserId(client, config).pipe(
          Effect.flatMap((userId) =>
            getJson(client, config, `/Users/${userId}/Items`, ItemsResponseSchema, [
              ['searchTerm', options.query],
              ['Recursive', true],
              ['IncludeItemTypes', 'Movie,Series,Episode'],
              ['Limit', options.limit],
            ])
          )
        ),
      libraryStats: getJson(client, config, '/Items/Counts', LibraryStatsSchema),
      scheduledTasks: getJson(client, config, '/ScheduledTasks', Schema.Array(ScheduledTaskSchema)).pipe(
        Effect.map(listResult)
      ),
      runTask: (taskId) =>
        executeStatus(
          client,
          HttpClientRequest.post(endpoint(config, `/ScheduledTasks/Running/${taskId}`)).pipe(withAuth(config))
        ).pipe(Effect.map((httpStatus) => ({ started: true, taskId, httpStatus }))),
    })
  })
)
