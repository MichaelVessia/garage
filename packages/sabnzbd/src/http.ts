import { Effect, Layer } from 'effect'
import type { Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  ActionResponseSchema,
  FullStatusResponseSchema,
  HistoryResponseSchema,
  QueueResponseSchema,
  ServerStatsSchema,
  VersionResponseSchema,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { SabnzbdError } from './errors.js'
import type { SabnzbdAction, SabnzbdConfigValue } from './model.js'
import { SabnzbdApi, SabnzbdConfig } from './services.js'

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: ReadonlyArray<readonly [string, string | number | boolean]>): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const endpoint = (
  config: SabnzbdConfigValue,
  mode: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): string =>
  `${normalizeBaseUrl(config.url)}/api?${queryString([
    ['apikey', config.apiKey],
    ['output', 'json'],
    ['mode', mode],
    ...params,
  ])}`

const toDecodeError = (error: { readonly message: string }): SabnzbdError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, SabnzbdError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, SabnzbdError, RD> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

    if (response.status < 200 || response.status >= 300) {
      return yield* httpError(response.status)
    }

    return yield* decodeBody(response, schema)
  })

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: SabnzbdConfigValue,
  mode: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, SabnzbdError, RD> =>
  executeJson(
    client,
    HttpClientRequest.get(endpoint(config, mode, params)).pipe(
      HttpClientRequest.setHeaders({ accept: 'application/json' })
    ),
    schema
  )

const actionResult = (action: SabnzbdAction, ok: boolean, nzoId?: string, deleteFiles?: boolean) => ({
  action,
  ok,
  nzoId,
  deleteFiles,
})

export const SabnzbdApiLive = Layer.effect(
  SabnzbdApi,
  Effect.gen(function* () {
    const sabnzbdConfig = yield* SabnzbdConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E, R>(
      f: (config: SabnzbdConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | SabnzbdError, R> => sabnzbdConfig.get().pipe(Effect.flatMap(f))

    return SabnzbdApi.of({
      status: Effect.fn('SabnzbdApi.status')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, 'fullstatus', FullStatusResponseSchema))
        },
        Effect.annotateLogs({ package: '@garage/sabnzbd', service: 'SabnzbdApi', method: 'status' })
      ),
      version: Effect.fn('SabnzbdApi.version')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, 'version', VersionResponseSchema))
        },
        Effect.annotateLogs({ package: '@garage/sabnzbd', service: 'SabnzbdApi', method: 'version' })
      ),
      queue: Effect.fn('SabnzbdApi.queue')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'sabnzbd.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, 'queue', QueueResponseSchema, [
              ['start', 0],
              ['limit', options.limit],
            ])
          )
        },
        Effect.annotateLogs({ package: '@garage/sabnzbd', service: 'SabnzbdApi', method: 'queue' })
      ),
      history: Effect.fn('SabnzbdApi.history')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'sabnzbd.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, 'history', HistoryResponseSchema, [
              ['start', 0],
              ['limit', options.limit],
            ])
          )
        },
        Effect.annotateLogs({ package: '@garage/sabnzbd', service: 'SabnzbdApi', method: 'history' })
      ),
      pause: Effect.fn('SabnzbdApi.pause')(
        function* () {
          yield* Effect.annotateCurrentSpan({ 'sabnzbd.action': 'pause' })
          return yield* withConfig((config) =>
            getJson(client, config, 'pause', ActionResponseSchema).pipe(Effect.map((ok) => actionResult('pause', ok)))
          )
        },
        Effect.annotateLogs({ package: '@garage/sabnzbd', service: 'SabnzbdApi', method: 'pause' })
      ),
      resume: Effect.fn('SabnzbdApi.resume')(
        function* () {
          yield* Effect.annotateCurrentSpan({ 'sabnzbd.action': 'resume' })
          return yield* withConfig((config) =>
            getJson(client, config, 'resume', ActionResponseSchema).pipe(Effect.map((ok) => actionResult('resume', ok)))
          )
        },
        Effect.annotateLogs({ package: '@garage/sabnzbd', service: 'SabnzbdApi', method: 'resume' })
      ),
      delete: Effect.fn('SabnzbdApi.delete')(
        function* (nzoId, options) {
          yield* Effect.annotateCurrentSpan({
            'sabnzbd.nzo_id': nzoId,
            'sabnzbd.delete_files': options.deleteFiles,
            'sabnzbd.action': 'delete',
          })
          return yield* withConfig((config) =>
            getJson(client, config, 'queue', ActionResponseSchema, [
              ['name', 'delete'],
              ['value', nzoId],
              ['del_files', options.deleteFiles ? 1 : 0],
            ]).pipe(Effect.map((ok) => actionResult('delete', ok, nzoId, options.deleteFiles)))
          )
        },
        Effect.annotateLogs({ package: '@garage/sabnzbd', service: 'SabnzbdApi', method: 'delete' })
      ),
      serverStats: Effect.fn('SabnzbdApi.serverStats')(
        function* () {
          return yield* withConfig((config) => getJson(client, config, 'server_stats', ServerStatsSchema))
        },
        Effect.annotateLogs({ package: '@garage/sabnzbd', service: 'SabnzbdApi', method: 'serverStats' })
      ),
    })
  })
)
