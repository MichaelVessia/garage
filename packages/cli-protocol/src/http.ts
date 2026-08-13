import * as Effect from 'effect/Effect'
import type * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'
import type { HttpClient } from 'effect/unstable/http'

// Shared HTTP-adapter pipeline for the service packages: build a URL from a
// base + optional fixed path prefix, apply the service's auth, execute,
// map transport/status/decode failures to the caller's own error type, and
// decode the JSON body against a schema. Only the request/decode/error
// pipeline lives here - each package still owns its base URL, auth, and
// per-endpoint paths/schemas.

export type HttpMethod = 'get' | 'post' | 'put' | 'delete'

export type QueryParams = ReadonlyArray<readonly [string, string | number | boolean]>

export interface JsonClientErrors<E> {
  readonly httpError: (status: number) => E
  readonly unreachable: (message: string, cause?: unknown) => E
  readonly decodeError: (message: string, cause?: unknown) => E
}

export interface JsonClientConfig<E> {
  readonly client: HttpClient.HttpClient
  readonly baseUrl: string
  readonly basePath?: string
  readonly staticQuery?: QueryParams
  readonly applyAuth: (request: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest
  readonly errors: JsonClientErrors<E>
}

export interface RequestStatusOptions {
  readonly body?: Schema.Json
  readonly query?: QueryParams
}

export interface JsonClient<E> {
  readonly execute: (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, E>
  readonly getJson: <A, I, RD, RE>(
    path: string,
    schema: Schema.Codec<A, I, RD, RE>,
    query?: QueryParams
  ) => Effect.Effect<A, E, RD>
  readonly postJson: <A, I, RD, RE>(
    path: string,
    schema: Schema.Codec<A, I, RD, RE>,
    body?: Schema.Json,
    query?: QueryParams
  ) => Effect.Effect<A, E, RD>
  readonly putJson: <A, I, RD, RE>(
    path: string,
    schema: Schema.Codec<A, I, RD, RE>,
    body?: Schema.Json,
    query?: QueryParams
  ) => Effect.Effect<A, E, RD>
  readonly deleteJson: <A, I, RD, RE>(
    path: string,
    schema: Schema.Codec<A, I, RD, RE>,
    query?: QueryParams
  ) => Effect.Effect<A, E, RD>
  readonly requestStatus: (method: HttpMethod, path: string, options?: RequestStatusOptions) => Effect.Effect<number, E>
}

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: QueryParams): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const methodBuilders = {
  get: HttpClientRequest.get,
  post: HttpClientRequest.post,
  put: HttpClientRequest.put,
  delete: HttpClientRequest.delete,
} satisfies Record<HttpMethod, (url: string) => HttpClientRequest.HttpClientRequest>

export const makeJsonClient = <E>(config: JsonClientConfig<E>): JsonClient<E> => {
  const basePath = config.basePath ?? ''
  const staticQuery = config.staticQuery ?? []
  const { httpError, unreachable, decodeError } = config.errors

  const endpoint = (path: string, query: QueryParams): string => {
    const search = queryString([...staticQuery, ...query])
    const base = `${normalizeBaseUrl(config.baseUrl)}${basePath}${path}`
    return Str.isEmpty(search) ? base : `${base}?${search}`
  }

  const toDecodeError = (error: { readonly message: string }): E => decodeError(error.message, error)

  const decodeBody = <A, I, RD, RE>(
    response: HttpClientResponse.HttpClientResponse,
    schema: Schema.Codec<A, I, RD, RE>
  ): Effect.Effect<A, E, RD> => HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

  const execute = Effect.fnUntraced(function* (request: HttpClientRequest.HttpClientRequest) {
    const response = yield* config.client
      .execute(request)
      .pipe(Effect.mapError((error) => unreachable(error.message, error)))

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(httpError(response.status))
    }

    return response
  })

  const buildRequest = Effect.fnUntraced(function* (method: HttpMethod, path: string, options: RequestStatusOptions) {
    const base = methodBuilders[method](endpoint(path, options.query ?? [])).pipe(config.applyAuth)
    if (options.body === undefined) {
      return base
    }
    return yield* base.pipe(
      HttpClientRequest.bodyJson(options.body),
      Effect.mapError((cause) => decodeError(cause.message, cause))
    )
  })

  const getJson = <A, I, RD, RE>(
    path: string,
    schema: Schema.Codec<A, I, RD, RE>,
    query: QueryParams = []
  ): Effect.Effect<A, E, RD> =>
    execute(methodBuilders.get(endpoint(path, query)).pipe(config.applyAuth)).pipe(
      Effect.flatMap((response) => decodeBody(response, schema))
    )

  const mutateJson =
    (method: 'post' | 'put') =>
    <A, I, RD, RE>(
      path: string,
      schema: Schema.Codec<A, I, RD, RE>,
      body?: Schema.Json,
      query: QueryParams = []
    ): Effect.Effect<A, E, RD> =>
      buildRequest(method, path, body === undefined ? { query } : { body, query }).pipe(
        Effect.flatMap(execute),
        Effect.flatMap((response) => decodeBody(response, schema))
      )

  const deleteJson = <A, I, RD, RE>(
    path: string,
    schema: Schema.Codec<A, I, RD, RE>,
    query: QueryParams = []
  ): Effect.Effect<A, E, RD> =>
    execute(methodBuilders.delete(endpoint(path, query)).pipe(config.applyAuth)).pipe(
      Effect.flatMap((response) => decodeBody(response, schema))
    )

  const requestStatus = (
    method: HttpMethod,
    path: string,
    options: RequestStatusOptions = {}
  ): Effect.Effect<number, E> =>
    buildRequest(method, path, options).pipe(
      Effect.flatMap(execute),
      Effect.map((response) => response.status)
    )

  return {
    execute,
    getJson,
    postJson: mutateJson('post'),
    putJson: mutateJson('put'),
    deleteJson,
    requestStatus,
  }
}
