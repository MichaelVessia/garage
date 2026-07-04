import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import type * as Schema from 'effect/Schema'
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
    ['apikey', Redacted.value(config.apiKey)],
    ['output', 'json'],
    ['mode', mode],
    ...params,
  ])}`

const toDecodeError = (error: { readonly message: string }): SabnzbdError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, SabnzbdError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = Effect.fn('sabnzbd.executeJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, SabnzbdError, RD> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

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
      status: () => withConfig((config) => getJson(client, config, 'fullstatus', FullStatusResponseSchema)),
      version: () => withConfig((config) => getJson(client, config, 'version', VersionResponseSchema)),
      queue: (options) =>
        withConfig((config) =>
          getJson(client, config, 'queue', QueueResponseSchema, [
            ['start', 0],
            ['limit', options.limit],
          ])
        ),
      history: (options) =>
        withConfig((config) =>
          getJson(client, config, 'history', HistoryResponseSchema, [
            ['start', 0],
            ['limit', options.limit],
          ])
        ),
      pause: () =>
        withConfig((config) =>
          getJson(client, config, 'pause', ActionResponseSchema).pipe(Effect.map((ok) => actionResult('pause', ok)))
        ),
      resume: () =>
        withConfig((config) =>
          getJson(client, config, 'resume', ActionResponseSchema).pipe(Effect.map((ok) => actionResult('resume', ok)))
        ),
      delete: (nzoId, options) =>
        withConfig((config) =>
          getJson(client, config, 'queue', ActionResponseSchema, [
            ['name', 'delete'],
            ['value', nzoId],
            ['del_files', options.deleteFiles ? 1 : 0],
          ]).pipe(Effect.map((ok) => actionResult('delete', ok, nzoId, options.deleteFiles)))
        ),
      serverStats: () => withConfig((config) => getJson(client, config, 'server_stats', ServerStatsSchema)),
    })
  })
)
