import { listResult, makeJsonClient } from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

import {
  ActiveClientsSchema,
  ClientsSchema,
  DhcpStatusSchema,
  FilteringRulesSchema,
  FilteringStatusSchema,
  JsonObjectApi,
  ProtectionStateStatusSchema,
  QueryLogResponseSchema,
  StatsInfoSchema,
  StatsSchema,
  StatusSchema,
  VersionStatusSchema,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { AdguardError } from './errors.js'
import type { AdguardConfigValue } from './model.js'
import { AdguardApi, AdguardConfig } from './services.js'

const applyAuth =
  (config: AdguardConfigValue) =>
  (request: HttpClientRequest.HttpClientRequest): HttpClientRequest.HttpClientRequest =>
    request.pipe(
      HttpClientRequest.setHeaders({ accept: 'application/json' }),
      HttpClientRequest.basicAuth(config.username, Redacted.value(config.password))
    )

const httpClientFor = (client: HttpClient.HttpClient, config: AdguardConfigValue) =>
  makeJsonClient<AdguardError>({
    client,
    baseUrl: config.url,
    basePath: '/control',
    applyAuth: applyAuth(config),
    errors: { httpError, unreachable, decodeError },
  })

export const AdguardApiLive = Layer.effect(
  AdguardApi,
  Effect.gen(function* () {
    const adguardConfig = yield* AdguardConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E>(
      f: (http: ReturnType<typeof httpClientFor>, config: AdguardConfigValue) => Effect.Effect<A, E>
    ) => adguardConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config), config)))

    return AdguardApi.of({
      status: () => withConfig((http) => http.getJson('/status', StatusSchema)),
      version: () => withConfig((http) => http.getJson('/status', VersionStatusSchema)),
      stats: () => withConfig((http) => http.getJson('/stats', StatsSchema)),
      statsInfo: () => withConfig((http) => http.getJson('/stats_info', StatsInfoSchema)),
      queryLog: (options) =>
        withConfig((http) => http.getJson('/querylog', QueryLogResponseSchema, [['limit', options.limit]])),
      queryLogSearch: (options) =>
        withConfig((http) =>
          http.getJson('/querylog', QueryLogResponseSchema, [
            ['search', options.query],
            ['limit', options.limit],
          ])
        ),
      clients: () => withConfig((http) => http.getJson('/clients', ClientsSchema)),
      clientsActive: (options) =>
        withConfig((http) =>
          http.getJson('/clients/find', ActiveClientsSchema, [['ip0', options.ip]]).pipe(Effect.map(listResult))
        ),
      filters: () => withConfig((http) => http.getJson('/filtering/status', FilteringStatusSchema)),
      rules: () => withConfig((http) => http.getJson('/filtering/status', FilteringRulesSchema)),
      dnsConfig: () => withConfig((http) => http.getJson('/dns_info', JsonObjectApi)),
      dhcpStatus: () => withConfig((http) => http.getJson('/dhcp/status', DhcpStatusSchema)),
      protectionToggle: (options) =>
        withConfig((http) =>
          http
            .requestStatus('post', '/protection', { body: { enabled: options.state === 'on', duration: 0 } })
            .pipe(Effect.flatMap(() => http.getJson('/status', ProtectionStateStatusSchema)))
        ),
    })
  })
)
