import { makeJsonClient } from '@garage/cli-protocol'
import type { JsonClient } from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

import {
  IssueListResponseSchema,
  MediaListResponseSchema,
  MediaResponseSchema,
  RequestCountsSchema,
  RequestSchema,
  RequestsResponseSchema,
  SearchResponseSchema,
  StatusSchema,
  UserListResponseSchema,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { JellyseerrError } from './errors.js'
import type { JellyseerrConfigValue } from './model.js'
import { JellyseerrApi, JellyseerrConfig } from './services.js'

const applyAuth = (config: JellyseerrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': Redacted.value(config.apiKey),
  })

const httpClientFor = (client: HttpClient.HttpClient, config: JellyseerrConfigValue) =>
  makeJsonClient<JellyseerrError>({
    client,
    baseUrl: config.url,
    applyAuth: applyAuth(config),
    errors: { httpError, unreachable, decodeError },
  })

export const JellyseerrApiLive = Layer.effect(
  JellyseerrApi,
  Effect.gen(function* () {
    const jellyseerrConfig = yield* JellyseerrConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E>(f: (http: JsonClient<JellyseerrError>) => Effect.Effect<A, E>) =>
      jellyseerrConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config))))

    return JellyseerrApi.of({
      status: () => withConfig((http) => http.getJson('/api/v1/status', StatusSchema)),
      requests: (options) =>
        withConfig((http) =>
          http.getJson('/api/v1/request', RequestsResponseSchema, [
            ['take', options.limit],
            ['sort', 'added'],
            ['filter', options.filter],
          ])
        ),
      requestCounts: () => withConfig((http) => http.getJson('/api/v1/request/count', RequestCountsSchema)),
      search: (options) =>
        withConfig((http) =>
          http.getJson('/api/v1/search', SearchResponseSchema, [
            ['query', options.query],
            ['take', options.limit],
          ])
        ),
      mediaStatus: (mediaId) => withConfig((http) => http.getJson(`/api/v1/media/${mediaId}`, MediaResponseSchema)),
      recentlyAdded: (options) =>
        withConfig((http) =>
          http.getJson('/api/v1/media', MediaListResponseSchema, [
            ['filter', 'available'],
            ['sort', 'mediaAdded'],
            ['take', options.limit],
          ])
        ),
      approve: (requestId) =>
        withConfig((http) => http.postJson(`/api/v1/request/${requestId}/approve`, RequestSchema)),
      decline: (requestId) =>
        withConfig((http) => http.postJson(`/api/v1/request/${requestId}/decline`, RequestSchema)),
      deleteRequest: (requestId) =>
        withConfig((http) =>
          http
            .requestStatus('delete', `/api/v1/request/${requestId}`)
            .pipe(Effect.map((httpStatus) => ({ deleted: true, requestId, httpStatus })))
        ),
      users: (options) =>
        withConfig((http) => http.getJson('/api/v1/user', UserListResponseSchema, [['take', options.limit]])),
      issues: (options) =>
        withConfig((http) =>
          http.getJson('/api/v1/issue', IssueListResponseSchema, [
            ['take', options.limit],
            ['filter', 'open'],
          ])
        ),
    })
  })
)
