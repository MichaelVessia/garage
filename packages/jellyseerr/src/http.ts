import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import type * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

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

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: ReadonlyArray<readonly [string, string | number | boolean]>): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const endpoint = (
  config: JellyseerrConfigValue,
  path: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): string => {
  const query = queryString(params)
  return Str.isEmpty(query)
    ? `${normalizeBaseUrl(config.url)}${path}`
    : `${normalizeBaseUrl(config.url)}${path}?${query}`
}

const withAuth = (config: JellyseerrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': Redacted.value(config.apiKey),
  })

const toDecodeError = (error: { readonly message: string }): JellyseerrError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, JellyseerrError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = Effect.fn('jellyseerr.executeJson')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, JellyseerrError, RD> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

  if (response.status < 200 || response.status >= 300) {
    return yield* httpError(response.status)
  }

  return yield* decodeBody(response, schema)
})

const executeStatus = Effect.fn('jellyseerr.executeStatus')(function* (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.fn.Return<number, JellyseerrError> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))

  if (response.status < 200 || response.status >= 300) {
    return yield* httpError(response.status)
  }

  return response.status
})

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: JellyseerrConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, JellyseerrError, RD> =>
  executeJson(client, HttpClientRequest.get(endpoint(config, path, params)).pipe(withAuth(config)), schema)

const postJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: JellyseerrConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, JellyseerrError, RD> =>
  executeJson(client, HttpClientRequest.post(endpoint(config, path)).pipe(withAuth(config)), schema)

const deleteStatus = (
  client: HttpClient.HttpClient,
  config: JellyseerrConfigValue,
  path: string
): Effect.Effect<number, JellyseerrError> =>
  executeStatus(client, HttpClientRequest.delete(endpoint(config, path)).pipe(withAuth(config)))

export const JellyseerrApiLive = Layer.effect(
  JellyseerrApi,
  Effect.gen(function* () {
    const jellyseerrConfig = yield* JellyseerrConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E, R>(
      f: (config: JellyseerrConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | JellyseerrError, R> => jellyseerrConfig.get().pipe(Effect.flatMap(f))

    return JellyseerrApi.of({
      status: () => withConfig((config) => getJson(client, config, '/api/v1/status', StatusSchema)),
      requests: (options) =>
        withConfig((config) =>
          getJson(client, config, '/api/v1/request', RequestsResponseSchema, [
            ['take', options.limit],
            ['sort', 'added'],
            ['filter', options.filter],
          ])
        ),
      requestCounts: () =>
        withConfig((config) => getJson(client, config, '/api/v1/request/count', RequestCountsSchema)),
      search: (options) =>
        withConfig((config) =>
          getJson(client, config, '/api/v1/search', SearchResponseSchema, [
            ['query', options.query],
            ['take', options.limit],
          ])
        ),
      mediaStatus: (mediaId) =>
        withConfig((config) => getJson(client, config, `/api/v1/media/${mediaId}`, MediaResponseSchema)),
      recentlyAdded: (options) =>
        withConfig((config) =>
          getJson(client, config, '/api/v1/media', MediaListResponseSchema, [
            ['filter', 'available'],
            ['sort', 'mediaAdded'],
            ['take', options.limit],
          ])
        ),
      approve: (requestId) =>
        withConfig((config) => postJson(client, config, `/api/v1/request/${requestId}/approve`, RequestSchema)),
      decline: (requestId) =>
        withConfig((config) => postJson(client, config, `/api/v1/request/${requestId}/decline`, RequestSchema)),
      deleteRequest: (requestId) =>
        withConfig((config) =>
          deleteStatus(client, config, `/api/v1/request/${requestId}`).pipe(
            Effect.map((httpStatus) => ({ deleted: true, requestId, httpStatus }))
          )
        ),
      users: (options) =>
        withConfig((config) =>
          getJson(client, config, '/api/v1/user', UserListResponseSchema, [['take', options.limit]])
        ),
      issues: (options) =>
        withConfig((config) =>
          getJson(client, config, '/api/v1/issue', IssueListResponseSchema, [
            ['take', options.limit],
            ['filter', 'open'],
          ])
        ),
    })
  })
)
