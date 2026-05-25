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

const enabledUserId = Effect.fn('jellyfin.enabledUserId')(function* (
  client: HttpClient.HttpClient,
  config: JellyfinConfigValue
): Effect.fn.Return<string, JellyfinError> {
  const users = yield* getJson(client, config, '/Users', Schema.Array(UserSchema))
  const selected = users.find((user) => user.isDisabled !== true)
  if (selected === undefined) {
    return yield* notFound('No enabled Jellyfin user found')
  }
  return selected.id
})

export const JellyfinApiLive = Layer.effect(
  JellyfinApi,
  Effect.gen(function* () {
    const jellyfinConfig = yield* JellyfinConfig
    const config = yield* jellyfinConfig.get()
    const client = yield* HttpClient.HttpClient

    return JellyfinApi.of({
      status: Effect.fn('JellyfinApi.status')(
        function* () {
          return yield* getJson(client, config, '/System/Info', SystemInfoSchema)
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'status' })
      ),
      users: Effect.fn('JellyfinApi.users')(
        function* () {
          return yield* getJson(client, config, '/Users', Schema.Array(UserSchema)).pipe(Effect.map(listResult))
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'users' })
      ),
      libraries: Effect.fn('JellyfinApi.libraries')(
        function* () {
          return yield* getJson(client, config, '/Library/VirtualFolders', Schema.Array(LibrarySchema)).pipe(
            Effect.map(listResult)
          )
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'libraries' })
      ),
      sessions: Effect.fn('JellyfinApi.sessions')(
        function* () {
          return yield* getJson(client, config, '/Sessions', Schema.Array(SessionSchema)).pipe(Effect.map(listResult))
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'sessions' })
      ),
      recentlyAdded: Effect.fn('JellyfinApi.recentlyAdded')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'jellyfin.limit': options.limit })
          const userId = yield* enabledUserId(client, config).pipe(Effect.withSpan('jellyfin.enabledUserId'))
          return yield* getJson(client, config, `/Users/${userId}/Items/Latest`, Schema.Array(BaseItemSchema), [
            ['Limit', options.limit],
          ]).pipe(Effect.map(listResult))
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'recentlyAdded' })
      ),
      itemSearch: Effect.fn('JellyfinApi.itemSearch')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({
            'jellyfin.query_length': options.query.length,
            'jellyfin.limit': options.limit,
          })
          const userId = yield* enabledUserId(client, config).pipe(Effect.withSpan('jellyfin.enabledUserId'))
          return yield* getJson(client, config, `/Users/${userId}/Items`, ItemsResponseSchema, [
            ['searchTerm', options.query],
            ['Recursive', true],
            ['IncludeItemTypes', 'Movie,Series,Episode'],
            ['Limit', options.limit],
          ])
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'itemSearch' })
      ),
      libraryStats: Effect.fn('JellyfinApi.libraryStats')(
        function* () {
          return yield* getJson(client, config, '/Items/Counts', LibraryStatsSchema)
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'libraryStats' })
      ),
      scheduledTasks: Effect.fn('JellyfinApi.scheduledTasks')(
        function* () {
          return yield* getJson(client, config, '/ScheduledTasks', Schema.Array(ScheduledTaskSchema)).pipe(
            Effect.map(listResult)
          )
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'scheduledTasks' })
      ),
      runTask: Effect.fn('JellyfinApi.runTask')(
        function* (taskId) {
          yield* Effect.annotateCurrentSpan({ 'jellyfin.task_id': taskId })
          return yield* executeStatus(
            client,
            HttpClientRequest.post(endpoint(config, `/ScheduledTasks/Running/${taskId}`)).pipe(withAuth(config))
          ).pipe(Effect.map((httpStatus) => ({ started: true, taskId, httpStatus })))
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'runTask' })
      ),
    })
  })
)
