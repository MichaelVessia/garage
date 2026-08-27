import { makeJsonClient } from '@garage/integration-http'
import type { JsonClient } from '@garage/integration-http'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

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

const applyAuth = HttpClientRequest.setHeaders({ accept: 'application/json' })

// SABnzbd has no path-based endpoints: every call is a GET to `/api` with the
// operation named by a `mode` query param and the API key passed as a query
// param rather than a header, so `mode` is threaded through as the sole
// "query" entry and the API key/output format ride along as static query.
const httpClientFor = (client: HttpClient.HttpClient, config: SabnzbdConfigValue) =>
  makeJsonClient<SabnzbdError>({
    client,
    baseUrl: config.url,
    basePath: '/api',
    staticQuery: [
      ['apikey', Redacted.value(config.apiKey)],
      ['output', 'json'],
    ],
    applyAuth,
    errors: { httpError, unreachable, decodeError },
  })

const modeQuery = (
  mode: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): ReadonlyArray<readonly [string, string | number | boolean]> => [['mode', mode], ...params]

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
    const withConfig = <A, E>(f: (http: JsonClient<SabnzbdError>) => Effect.Effect<A, E>) =>
      sabnzbdConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config))))

    return SabnzbdApi.of({
      status: () => withConfig((http) => http.getJson('', FullStatusResponseSchema, modeQuery('fullstatus'))),
      version: () => withConfig((http) => http.getJson('', VersionResponseSchema, modeQuery('version'))),
      queue: (options) =>
        withConfig((http) =>
          http.getJson(
            '',
            QueueResponseSchema,
            modeQuery('queue', [
              ['start', 0],
              ['limit', options.limit],
            ])
          )
        ),
      history: (options) =>
        withConfig((http) =>
          http.getJson(
            '',
            HistoryResponseSchema,
            modeQuery('history', [
              ['start', 0],
              ['limit', options.limit],
            ])
          )
        ),
      pause: () =>
        withConfig((http) =>
          http.getJson('', ActionResponseSchema, modeQuery('pause')).pipe(Effect.map((ok) => actionResult('pause', ok)))
        ),
      resume: () =>
        withConfig((http) =>
          http
            .getJson('', ActionResponseSchema, modeQuery('resume'))
            .pipe(Effect.map((ok) => actionResult('resume', ok)))
        ),
      delete: (nzoId, options) =>
        withConfig((http) =>
          http
            .getJson(
              '',
              ActionResponseSchema,
              modeQuery('queue', [
                ['name', 'delete'],
                ['value', nzoId],
                ['del_files', options.deleteFiles ? 1 : 0],
              ])
            )
            .pipe(Effect.map((ok) => actionResult('delete', ok, nzoId, options.deleteFiles)))
        ),
      serverStats: () => withConfig((http) => http.getJson('', ServerStatsSchema, modeQuery('server_stats'))),
    })
  })
)
