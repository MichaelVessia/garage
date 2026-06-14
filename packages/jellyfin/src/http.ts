import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
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
  return Str.isEmpty(query)
    ? `${normalizeBaseUrl(config.url)}${path}`
    : `${normalizeBaseUrl(config.url)}${path}?${query}`
}

const withAuth = (config: JellyfinConfigValue) =>
  HttpClientRequest.setHeaders({ accept: 'application/json', 'x-emby-token': Redacted.value(config.apiKey) })

const toDecodeError = (error: { readonly message: string }): JellyfinError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, JellyfinError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = Effect.fn('jellyfin.executeJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, JellyfinError, RD> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))
  if (response.status < 200 || response.status >= 300) {
    return yield* httpError(response.status)
  }
  return yield* decodeBody(response, schema)
})

const executeStatus = Effect.fn('jellyfin.executeStatus')(function* (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.fn.Return<number, JellyfinError> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))
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
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E, R>(
      f: (config: JellyfinConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | JellyfinError, R> => jellyfinConfig.get().pipe(Effect.flatMap(f))

    return JellyfinApi.of({
      status: Effect.fn('JellyfinApi.status')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, '/System/Info', SystemInfoSchema))
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'status' })
      ),
      users: Effect.fn('JellyfinApi.users')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/Users', Schema.Array(UserSchema)).pipe(Effect.map(listResult))
          )
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'users' })
      ),
      libraries: Effect.fn('JellyfinApi.libraries')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/Library/VirtualFolders', Schema.Array(LibrarySchema)).pipe(Effect.map(listResult))
          )
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'libraries' })
      ),
      sessions: Effect.fn('JellyfinApi.sessions')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/Sessions', Schema.Array(SessionSchema)).pipe(Effect.map(listResult))
          )
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'sessions' })
      ),
      recentlyAdded: Effect.fn('JellyfinApi.recentlyAdded')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'jellyfin.limit': options.limit })
          return yield* withConfig(
            Effect.fn('JellyfinApi.recentlyAdded.configured')(function* (config) {
              const userId = yield* enabledUserId(client, config)
              return yield* getJson(client, config, `/Users/${userId}/Items/Latest`, Schema.Array(BaseItemSchema), [
                ['Limit', options.limit],
              ]).pipe(Effect.map(listResult))
            })
          )
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'recentlyAdded' })
      ),
      itemSearch: Effect.fn('JellyfinApi.itemSearch')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({
            'jellyfin.query_length': options.query.length,
            'jellyfin.limit': options.limit,
          })
          return yield* withConfig(
            Effect.fn('JellyfinApi.itemSearch.configured')(function* (config) {
              const userId = yield* enabledUserId(client, config)
              return yield* getJson(client, config, `/Users/${userId}/Items`, ItemsResponseSchema, [
                ['searchTerm', options.query],
                ['Recursive', true],
                ['IncludeItemTypes', 'Movie,Series,Episode'],
                ['Limit', options.limit],
              ])
            })
          )
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'itemSearch' })
      ),
      libraryStats: Effect.fn('JellyfinApi.libraryStats')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, '/Items/Counts', LibraryStatsSchema))
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'libraryStats' })
      ),
      scheduledTasks: Effect.fn('JellyfinApi.scheduledTasks')(
        function* () {
          return yield* withConfig((config) =>
            getJson(client, config, '/ScheduledTasks', Schema.Array(ScheduledTaskSchema)).pipe(Effect.map(listResult))
          )
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'scheduledTasks' })
      ),
      runTask: Effect.fn('JellyfinApi.runTask')(
        function* (taskId) {
          yield* Effect.annotateCurrentSpan({ 'jellyfin.task_id': taskId })
          return yield* withConfig((config) =>
            executeStatus(
              client,
              HttpClientRequest.post(endpoint(config, `/ScheduledTasks/Running/${taskId}`)).pipe(withAuth(config))
            ).pipe(Effect.map((httpStatus) => ({ started: true, taskId, httpStatus })))
          )
        },
        Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinApi', method: 'runTask' })
      ),
    })
  })
)
