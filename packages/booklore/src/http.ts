import { Clock, Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  BookSchema,
  JsonObjectSchema,
  LibrarySchema,
  LoginResponseSchema,
  UserSchema,
  VersionSchema,
  toBookRecord,
  toCurrentUser,
  toJsonObjects,
  toLibraryRecord,
  toListResult,
  toSearchResult,
  toVersionResult,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { BookloreError } from './errors.js'
import type { BookloreConfigValue, SearchOptions } from './model.js'
import { BookloreApi, BookloreConfig, BookloreTokenCache } from './services.js'
import type { BookloreTokenCacheService } from './services.js'

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const endpoint = (config: BookloreConfigValue, path: string): string => `${normalizeBaseUrl(config.url)}/api/v1${path}`

const cacheKey = (config: BookloreConfigValue): string => `${normalizeBaseUrl(config.url)}\n${config.username}`

const isJsonObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const decodeBase64Url = (value: string): string => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padLength = (4 - (normalized.length % 4)) % 4
  return globalThis.atob(`${normalized}${'='.repeat(padLength)}`)
}

const tokenExpiry = (token: string): number | undefined => {
  const [, payload] = token.split('.')
  if (payload === undefined) {
    return undefined
  }

  try {
    const decoded: unknown = JSON.parse(decodeBase64Url(payload))
    if (!isJsonObject(decoded)) {
      return undefined
    }
    const { exp } = decoded
    return typeof exp === 'number' ? exp : undefined
  } catch {
    return undefined
  }
}

const isUsableToken = (token: string, nowSeconds: number): boolean => {
  const exp = tokenExpiry(token)
  return exp !== undefined && nowSeconds < exp - 30
}

const withBearer = (token: string) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  })

const toDecodeError = (error: { readonly message: string }): BookloreError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, BookloreError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, BookloreError, RD> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))

    if (response.status < 200 || response.status >= 300) {
      return yield* httpError(response.status)
    }

    return yield* decodeBody(response, schema)
  })

const login = (
  client: HttpClient.HttpClient,
  config: BookloreConfigValue
): Effect.Effect<typeof LoginResponseSchema.Type, BookloreError> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(endpoint(config, '/auth/login')).pipe(
      HttpClientRequest.setHeaders({ accept: 'application/json' }),
      HttpClientRequest.bodyJson({ username: config.username, password: config.password }),
      Effect.mapError((error) => decodeError(error.message))
    )

    return yield* executeJson(client, request, LoginResponseSchema)
  })

const accessToken = (
  client: HttpClient.HttpClient,
  config: BookloreConfigValue,
  tokenCache: BookloreTokenCacheService
): Effect.Effect<string, BookloreError> =>
  Effect.gen(function* () {
    const key = cacheKey(config)
    const cached = yield* tokenCache.read(key)
    const nowMillis = yield* Clock.currentTimeMillis
    if (cached !== undefined && isUsableToken(cached, Math.floor(nowMillis / 1000))) {
      return cached
    }

    const response = yield* login(client, config)
    yield* tokenCache.write(key, response.accessToken)
    return response.accessToken
  })

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: BookloreConfigValue,
  token: string,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, BookloreError, RD> =>
  executeJson(client, HttpClientRequest.get(endpoint(config, path)).pipe(withBearer(token)), schema)

const books = (client: HttpClient.HttpClient, config: BookloreConfigValue, token: string) =>
  getJson(client, config, token, '/books', Schema.Array(BookSchema)).pipe(
    Effect.map((records) => records.map(toBookRecord))
  )

const searchBooks = (
  client: HttpClient.HttpClient,
  config: BookloreConfigValue,
  token: string,
  options: SearchOptions
) =>
  books(client, config, token).pipe(
    Effect.map((records) => {
      const normalizedQuery = options.query.toLocaleLowerCase()
      const matches = records.filter((book) => (book.title ?? '').toLocaleLowerCase().includes(normalizedQuery))
      return toSearchResult(options.query, matches.slice(0, options.limit), matches.length)
    })
  )

export const BookloreApiLive = Layer.effect(
  BookloreApi,
  Effect.gen(function* () {
    const bookloreConfig = yield* BookloreConfig
    const config = yield* bookloreConfig.get
    const client = yield* HttpClient.HttpClient
    const tokenCache = yield* BookloreTokenCache
    const token = yield* accessToken(client, config, tokenCache)

    return BookloreApi.of({
      status: getJson(client, config, token, '/version', VersionSchema).pipe(Effect.map(toVersionResult)),
      me: getJson(client, config, token, '/users/me', UserSchema).pipe(Effect.map(toCurrentUser)),
      libraries: getJson(client, config, token, '/libraries', Schema.Array(LibrarySchema)).pipe(
        Effect.map((records) => toListResult(records.map(toLibraryRecord)))
      ),
      books: (options) =>
        books(client, config, token).pipe(Effect.map((records) => toListResult(records.slice(0, options.limit)))),
      bookInfo: (options) =>
        getJson(client, config, token, `/books/${options.id}`, BookSchema).pipe(Effect.map(toBookRecord)),
      search: (options) => searchBooks(client, config, token, options),
      shelves: getJson(client, config, token, '/shelves', Schema.Array(JsonObjectSchema)).pipe(
        Effect.map((records) => toListResult(toJsonObjects(records)))
      ),
    })
  })
)
