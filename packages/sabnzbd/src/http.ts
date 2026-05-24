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
  toActionResult,
  toHistoryResult,
  toQueueResult,
  toServerStats,
  toSystemStatus,
  toVersionResult,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { SabnzbdError } from './errors.js'
import type { SabnzbdConfigValue } from './model.js'
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

export const SabnzbdApiLive = Layer.effect(
  SabnzbdApi,
  Effect.gen(function* () {
    const sabnzbdConfig = yield* SabnzbdConfig
    const config = yield* sabnzbdConfig.get
    const client = yield* HttpClient.HttpClient

    return SabnzbdApi.of({
      status: getJson(client, config, 'fullstatus', FullStatusResponseSchema).pipe(
        Effect.map((response) => toSystemStatus(response.status))
      ),
      version: getJson(client, config, 'version', VersionResponseSchema).pipe(Effect.map(toVersionResult)),
      queue: (options) =>
        getJson(client, config, 'queue', QueueResponseSchema, [
          ['start', 0],
          ['limit', options.limit],
        ]).pipe(Effect.map(toQueueResult)),
      history: (options) =>
        getJson(client, config, 'history', HistoryResponseSchema, [
          ['start', 0],
          ['limit', options.limit],
        ]).pipe(Effect.map(toHistoryResult)),
      pause: getJson(client, config, 'pause', ActionResponseSchema).pipe(
        Effect.map((response) => toActionResult('pause', response))
      ),
      resume: getJson(client, config, 'resume', ActionResponseSchema).pipe(
        Effect.map((response) => toActionResult('resume', response))
      ),
      delete: (nzoId, options) =>
        getJson(client, config, 'queue', ActionResponseSchema, [
          ['name', 'delete'],
          ['value', nzoId],
          ['del_files', options.deleteFiles ? 1 : 0],
        ]).pipe(Effect.map((response) => toActionResult('delete', response, nzoId, options.deleteFiles))),
      serverStats: getJson(client, config, 'server_stats', ServerStatsSchema).pipe(Effect.map(toServerStats)),
    })
  })
)
