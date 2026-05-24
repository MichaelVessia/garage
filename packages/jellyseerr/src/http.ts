import { Effect, Layer } from 'effect'
import type { Schema } from 'effect'
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
  toIssueListResult,
  toMediaListResult,
  toMediaSummary,
  toRequestCounts,
  toRequestListResult,
  toRequestRecord,
  toSearchListResult,
  toSystemStatus,
  toUserListResult,
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
  return query.length === 0
    ? `${normalizeBaseUrl(config.url)}${path}`
    : `${normalizeBaseUrl(config.url)}${path}?${query}`
}

const withAuth = (config: JellyseerrConfigValue) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    'x-api-key': config.apiKey,
  })

const toDecodeError = (error: { readonly message: string }): JellyseerrError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, JellyseerrError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, JellyseerrError, RD> =>
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
): Effect.Effect<number, JellyseerrError> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

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
    const config = yield* jellyseerrConfig.get
    const client = yield* HttpClient.HttpClient

    return JellyseerrApi.of({
      status: getJson(client, config, '/api/v1/status', StatusSchema).pipe(Effect.map(toSystemStatus)),
      requests: (options) =>
        getJson(client, config, '/api/v1/request', RequestsResponseSchema, [
          ['take', options.limit],
          ['sort', 'added'],
          ['filter', options.filter],
        ]).pipe(Effect.map(toRequestListResult)),
      requestCounts: getJson(client, config, '/api/v1/request/count', RequestCountsSchema).pipe(
        Effect.map(toRequestCounts)
      ),
      search: (options) =>
        getJson(client, config, '/api/v1/search', SearchResponseSchema, [
          ['query', options.query],
          ['take', options.limit],
        ]).pipe(Effect.map(toSearchListResult)),
      mediaStatus: (mediaId) =>
        getJson(client, config, `/api/v1/media/${mediaId}`, MediaResponseSchema).pipe(Effect.map(toMediaSummary)),
      recentlyAdded: (options) =>
        getJson(client, config, '/api/v1/media', MediaListResponseSchema, [
          ['filter', 'available'],
          ['sort', 'mediaAdded'],
          ['take', options.limit],
        ]).pipe(Effect.map(toMediaListResult)),
      approve: (requestId) =>
        postJson(client, config, `/api/v1/request/${requestId}/approve`, RequestSchema).pipe(
          Effect.map(toRequestRecord)
        ),
      decline: (requestId) =>
        postJson(client, config, `/api/v1/request/${requestId}/decline`, RequestSchema).pipe(
          Effect.map(toRequestRecord)
        ),
      deleteRequest: (requestId) =>
        deleteStatus(client, config, `/api/v1/request/${requestId}`).pipe(
          Effect.map((httpStatus) => ({ deleted: true, requestId, httpStatus }))
        ),
      users: (options) =>
        getJson(client, config, '/api/v1/user', UserListResponseSchema, [['take', options.limit]]).pipe(
          Effect.map(toUserListResult)
        ),
      issues: (options) =>
        getJson(client, config, '/api/v1/issue', IssueListResponseSchema, [
          ['take', options.limit],
          ['filter', 'open'],
        ]).pipe(Effect.map(toIssueListResult)),
    })
  })
)
