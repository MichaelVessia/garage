import { Effect, Layer, Option, Schema } from 'effect'
import { Headers, HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import {
  ChannelDetailSchema,
  ChannelResponseSchema,
  DownloadResponseSchema,
  JsonObjectSchema,
  PlaylistResponseSchema,
  SearchResponseSchema,
  TasksSchema,
  VideoDetailSchema,
  VideoResponseSchema,
  toChannel,
  toChannelList,
  toDownloadList,
  toJsonObject,
  toPlaylistList,
  toSearchResult,
  toTaskList,
  toVideo,
  toVideoList,
} from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { TubearchivistError } from './errors.js'
import type { SessionCookies, SubscriptionOptions, TubearchivistConfigValue } from './model.js'
import { TubearchivistApi, TubearchivistConfig, TubearchivistSessionCache } from './services.js'
import type { TubearchivistSessionCacheService } from './services.js'

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const queryString = (params: ReadonlyArray<readonly [string, string | number | boolean]>): string =>
  params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')

const endpoint = (
  config: TubearchivistConfigValue,
  path: string,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): string => {
  const query = queryString(params)
  return query.length === 0
    ? `${normalizeBaseUrl(config.url)}/api${path}`
    : `${normalizeBaseUrl(config.url)}/api${path}?${query}`
}

const cacheKey = (config: TubearchivistConfigValue): string => `${normalizeBaseUrl(config.url)}\n${config.username}`

const cookieHeader = (session: SessionCookies): string =>
  `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`

const withSession = (session: SessionCookies) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    cookie: cookieHeader(session),
  })

const withMutationHeaders = (config: TubearchivistConfigValue, session: SessionCookies) =>
  HttpClientRequest.setHeaders({
    accept: 'application/json',
    cookie: cookieHeader(session),
    referer: `${normalizeBaseUrl(config.url)}/`,
    'x-csrftoken': session.csrfToken,
  })

const toDecodeError = (error: { readonly message: string }): TubearchivistError => decodeError(error.message)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, TubearchivistError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeResponse = (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.Effect<HttpClientResponse.HttpClientResponse, TubearchivistError> =>
  client.execute(request).pipe(Effect.mapError((cause) => unreachable(cause.message)))

const decodeJsonResponse = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, TubearchivistError, RD> =>
  response.status < 200 || response.status >= 300 ? httpError(response.status) : decodeBody(response, schema)

const setCookieHeader = (response: HttpClientResponse.HttpClientResponse): string | undefined =>
  Headers.get(response.headers, 'set-cookie').pipe(Option.getOrUndefined)

const cookieValue = (header: string, name: string): string | undefined => {
  const marker = `${name}=`
  const start = header.indexOf(marker)
  if (start === -1) {
    return undefined
  }
  const valueStart = start + marker.length
  const semi = header.indexOf(';', valueStart)
  const comma = header.indexOf(',', valueStart)
  const candidates = [semi, comma].filter((index) => index >= 0)
  const end = candidates.length === 0 ? header.length : Math.min(...candidates)
  const value = header.slice(valueStart, end)
  return value.length === 0 ? undefined : value
}

const parseSession = (
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<SessionCookies, TubearchivistError> => {
  const header = setCookieHeader(response)
  if (header === undefined) {
    return Effect.fail(decodeError('login response did not include set-cookie'))
  }
  const sessionId = cookieValue(header, 'sessionid')
  const csrfToken = cookieValue(header, 'csrftoken')
  if (sessionId === undefined || csrfToken === undefined) {
    return Effect.fail(decodeError('login response did not include sessionid and csrftoken cookies'))
  }
  return Effect.succeed({ sessionId, csrfToken })
}

const login = (
  client: HttpClient.HttpClient,
  config: TubearchivistConfigValue,
  cache: TubearchivistSessionCacheService
): Effect.Effect<SessionCookies, TubearchivistError> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(endpoint(config, '/user/login/')).pipe(
      HttpClientRequest.setHeaders({ accept: 'application/json' }),
      HttpClientRequest.bodyJson({ username: config.username, password: config.password }),
      Effect.mapError((cause) => decodeError(cause.message))
    )
    const response = yield* executeResponse(client, request)
    if (response.status !== 204 && response.status !== 200) {
      return yield* httpError(response.status)
    }
    const session = yield* parseSession(response)
    yield* cache.write(cacheKey(config), session)
    return session
  })

const session = (
  client: HttpClient.HttpClient,
  config: TubearchivistConfigValue,
  cache: TubearchivistSessionCacheService
): Effect.Effect<SessionCookies, TubearchivistError> =>
  Effect.gen(function* () {
    const cached = yield* cache.read(cacheKey(config))
    return cached ?? (yield* login(client, config, cache))
  })

const retryWithFreshSession = (error: TubearchivistError): boolean =>
  error.code === 'TUBEARCHIVIST_HTTP_ERROR' && (error.status === 401 || error.status === 403)

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: TubearchivistConfigValue,
  cache: TubearchivistSessionCacheService,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.Effect<A, TubearchivistError, RD> =>
  Effect.gen(function* () {
    const current = yield* session(client, config, cache)
    const request = HttpClientRequest.get(endpoint(config, path, params)).pipe(withSession(current))
    const attempt = executeResponse(client, request).pipe(
      Effect.flatMap((response) => decodeJsonResponse(response, schema))
    )
    return yield* attempt.pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          retryWithFreshSession(error)
            ? login(client, config, cache).pipe(
                Effect.flatMap((fresh) =>
                  executeResponse(
                    client,
                    HttpClientRequest.get(endpoint(config, path, params)).pipe(withSession(fresh))
                  ).pipe(Effect.flatMap((response) => decodeJsonResponse(response, schema)))
                )
              )
            : Effect.fail(error),
        onSuccess: (value) => Effect.succeed(value),
      })
    )
  })

const postJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: TubearchivistConfigValue,
  cache: TubearchivistSessionCacheService,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, TubearchivistError, RD> =>
  Effect.gen(function* () {
    const current = yield* session(client, config, cache)
    const build = (next: SessionCookies) =>
      HttpClientRequest.post(endpoint(config, path)).pipe(
        withMutationHeaders(config, next),
        HttpClientRequest.bodyJson(body),
        Effect.mapError((cause) => decodeError(cause.message))
      )
    const request = yield* build(current)
    const attempt = executeResponse(client, request).pipe(
      Effect.flatMap((response) => decodeJsonResponse(response, schema))
    )
    return yield* attempt.pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          retryWithFreshSession(error)
            ? login(client, config, cache).pipe(
                Effect.flatMap((fresh) => build(fresh)),
                Effect.flatMap((freshRequest) =>
                  executeResponse(client, freshRequest).pipe(
                    Effect.flatMap((response) => decodeJsonResponse(response, schema))
                  )
                )
              )
            : Effect.fail(error),
        onSuccess: (value) => Effect.succeed(value),
      })
    )
  })

const subscriptionBody = (options: SubscriptionOptions, subscribed: boolean) => ({
  data: [{ channel_id: options.target, channel_subscribed: subscribed }],
})

export const TubearchivistApiLive = Layer.effect(
  TubearchivistApi,
  Effect.gen(function* () {
    const tubearchivistConfig = yield* TubearchivistConfig
    const config = yield* tubearchivistConfig.get
    const client = yield* HttpClient.HttpClient
    const cache = yield* TubearchivistSessionCache

    return TubearchivistApi.of({
      status: Effect.all(
        {
          health: getJson(client, config, cache, '/health/', Schema.String),
          config: getJson(client, config, cache, '/appsettings/config/', JsonObjectSchema).pipe(
            Effect.map(toJsonObject)
          ),
          video: getJson(client, config, cache, '/stats/video/', JsonObjectSchema).pipe(Effect.map(toJsonObject)),
          channel: getJson(client, config, cache, '/stats/channel/', JsonObjectSchema).pipe(Effect.map(toJsonObject)),
          download: getJson(client, config, cache, '/stats/download/', JsonObjectSchema).pipe(Effect.map(toJsonObject)),
          watch: getJson(client, config, cache, '/stats/watch/', JsonObjectSchema).pipe(Effect.map(toJsonObject)),
        },
        { concurrency: 1 }
      ).pipe(
        Effect.map((parts) => ({
          url: normalizeBaseUrl(config.url),
          health: parts.health,
          config: parts.config,
          stats: { video: parts.video, channel: parts.channel, download: parts.download, watch: parts.watch },
        }))
      ),
      channels: (options) =>
        getJson(client, config, cache, '/channel/', ChannelResponseSchema).pipe(
          Effect.map((response) => toChannelList(response, options.limit))
        ),
      channelInfo: (options) =>
        getJson(client, config, cache, `/channel/${options.id}/`, ChannelDetailSchema).pipe(Effect.map(toChannel)),
      subscribe: (options) =>
        postJson(client, config, cache, '/channel/', subscriptionBody(options, true), JsonObjectSchema).pipe(
          Effect.map((response) => ({
            target: options.target,
            subscribed: true,
            response: toJsonObject(response),
            note: 'Subscribe task queued. Run tasks to inspect Celery progress.',
          }))
        ),
      unsubscribe: (options) =>
        postJson(client, config, cache, '/channel/', subscriptionBody(options, false), JsonObjectSchema).pipe(
          Effect.map((response) => ({ target: options.target, subscribed: false, response: toJsonObject(response) }))
        ),
      videos: (options) =>
        getJson(client, config, cache, '/video/', VideoResponseSchema, [['page', 0]]).pipe(
          Effect.map((response) => toVideoList(response, options.limit))
        ),
      videoInfo: (options) =>
        getJson(client, config, cache, `/video/${options.id}/`, VideoDetailSchema).pipe(Effect.map(toVideo)),
      downloads: (options) =>
        getJson(client, config, cache, '/download/', DownloadResponseSchema).pipe(
          Effect.map((response) => toDownloadList(response, options.limit))
        ),
      playlists: (options) =>
        getJson(client, config, cache, '/playlist/', PlaylistResponseSchema).pipe(
          Effect.map((response) => toPlaylistList(response, options.limit))
        ),
      tasks: (options) =>
        getJson(client, config, cache, '/task/by-name/', TasksSchema).pipe(
          Effect.map((records) => toTaskList(records, options.limit))
        ),
      search: (options) =>
        getJson(client, config, cache, '/search/', SearchResponseSchema, [['query', options.query]]).pipe(
          Effect.map((response) => toSearchResult(options.query, response, options.limit))
        ),
    })
  })
)
