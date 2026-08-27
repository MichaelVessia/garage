import * as Effect from 'effect/Effect'
import type * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'
import type { HttpClient } from 'effect/unstable/http'

// Shared HTTP-adapter pipeline for retained integration packages: build a URL
// from a base plus optional fixed path/query values, apply integration-owned
// authentication, execute, map failures to the caller's error type, and decode
// JSON through the caller's schema.

type QueryParams = ReadonlyArray<readonly [string, string | number | boolean]>

export interface JsonClientErrors<E> {
  readonly httpError: (status: number) => E
  readonly unreachable: (message: string, cause?: unknown) => E
  readonly decodeError: (message: string, cause?: unknown) => E
}

interface JsonClientConfig<E> {
  readonly client: HttpClient.HttpClient
  readonly baseUrl: string
  readonly basePath?: string
  readonly staticQuery?: QueryParams
  readonly applyAuth: (request: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest
  readonly errors: JsonClientErrors<E>
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
}

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: QueryParams): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

export const makeJsonClient = <E>(config: JsonClientConfig<E>): JsonClient<E> => {
  const basePath = config.basePath ?? ''
  const staticQuery = config.staticQuery ?? []
  const { httpError, unreachable, decodeError } = config.errors

  const endpoint = (path: string, query: QueryParams): string => {
    const search = queryString([...staticQuery, ...query])
    const base = `${normalizeBaseUrl(config.baseUrl)}${basePath}${path}`
    return Str.isEmpty(search) ? base : `${base}?${search}`
  }

  const execute = Effect.fnUntraced(function* (request: HttpClientRequest.HttpClientRequest) {
    const response = yield* config.client
      .execute(request)
      .pipe(Effect.mapError((error) => unreachable(error.message, error)))

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(httpError(response.status))
    }

    return response
  })

  const toDecodeError = (error: { readonly message: string }): E => decodeError(error.message, error)

  const decodeBody = <A, I, RD, RE>(
    response: HttpClientResponse.HttpClientResponse,
    schema: Schema.Codec<A, I, RD, RE>
  ): Effect.Effect<A, E, RD> => HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

  const getJson = <A, I, RD, RE>(
    path: string,
    schema: Schema.Codec<A, I, RD, RE>,
    query: QueryParams = []
  ): Effect.Effect<A, E, RD> =>
    execute(HttpClientRequest.get(endpoint(path, query)).pipe(config.applyAuth)).pipe(
      Effect.flatMap((response) => decodeBody(response, schema))
    )

  return { execute, getJson }
}
