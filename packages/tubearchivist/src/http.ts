import { Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

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

const toDecodeError = (error: { readonly message: string }): TubearchivistError => decodeError(error.message, error)

const decodeBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, TubearchivistError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const executeResponse = (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.Effect<HttpClientResponse.HttpClientResponse, TubearchivistError> =>
  client.execute(request).pipe(Effect.mapError((cause) => unreachable(cause.message, cause)))

const decodeJsonResponse = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, TubearchivistError, RD> =>
  response.status < 200 || response.status >= 300 ? httpError(response.status) : decodeBody(response, schema)

const parseSession = (
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<SessionCookies, TubearchivistError> => {
  const sessionId = response.cookies.cookies.sessionid?.value
  const csrfToken = response.cookies.cookies.csrftoken?.value
  if (sessionId === undefined || csrfToken === undefined) {
    return Effect.fail(decodeError('login response did not include sessionid and csrftoken cookies'))
  }
  return Effect.succeed({ sessionId, csrfToken })
}

const login = Effect.fn('tubearchivist.login')(
  function* (
    client: HttpClient.HttpClient,
    config: TubearchivistConfigValue,
    cache: TubearchivistSessionCacheService
  ): Effect.fn.Return<SessionCookies, TubearchivistError> {
    const request = yield* HttpClientRequest.post(endpoint(config, '/user/login/')).pipe(
      HttpClientRequest.setHeaders({ accept: 'application/json' }),
      HttpClientRequest.bodyJson({ username: config.username, password: config.password }),
      Effect.mapError((cause) => decodeError(cause.message, cause))
    )
    const response = yield* executeResponse(client, request)
    if (response.status !== 204 && response.status !== 200) {
      return yield* httpError(response.status)
    }
    const session = yield* parseSession(response)
    yield* cache.write(cacheKey(config), session)
    return session
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'login' })
)

const session = Effect.fn('tubearchivist.session')(
  function* (
    client: HttpClient.HttpClient,
    config: TubearchivistConfigValue,
    cache: TubearchivistSessionCacheService
  ): Effect.fn.Return<SessionCookies, TubearchivistError> {
    const cached = yield* cache.read(cacheKey(config))
    return cached ?? (yield* login(client, config, cache))
  },
  Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'session' })
)

const getJson = Effect.fn('tubearchivist.authenticatedGet')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: TubearchivistConfigValue,
  cache: TubearchivistSessionCacheService,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>,
  params: ReadonlyArray<readonly [string, string | number | boolean]> = []
): Effect.fn.Return<A, TubearchivistError, RD> {
  const current = yield* session(client, config, cache)
  const request = HttpClientRequest.get(endpoint(config, path, params)).pipe(withSession(current))
  const attempt = executeResponse(client, request).pipe(
    Effect.flatMap((response) => decodeJsonResponse(response, schema))
  )
  return yield* attempt.pipe(
    Effect.catchTag('TubearchivistHttpError', (error) =>
      error.status === 401 || error.status === 403
        ? Effect.annotateCurrentSpan({ 'tubearchivist.session_refreshed': true }).pipe(
            Effect.flatMap(() => login(client, config, cache)),
            Effect.flatMap((fresh) =>
              executeResponse(
                client,
                HttpClientRequest.get(endpoint(config, path, params)).pipe(withSession(fresh))
              ).pipe(Effect.flatMap((response) => decodeJsonResponse(response, schema)))
            )
          )
        : Effect.fail(error)
    )
  )
})

const postJson = Effect.fn('tubearchivist.authenticatedPost')(function* <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: TubearchivistConfigValue,
  cache: TubearchivistSessionCacheService,
  path: string,
  body: unknown,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.fn.Return<A, TubearchivistError, RD> {
  const current = yield* session(client, config, cache)
  const build = (next: SessionCookies) =>
    HttpClientRequest.post(endpoint(config, path)).pipe(
      withMutationHeaders(config, next),
      HttpClientRequest.bodyJson(body),
      Effect.mapError((cause) => decodeError(cause.message, cause))
    )
  const request = yield* build(current)
  const attempt = executeResponse(client, request).pipe(
    Effect.flatMap((response) => decodeJsonResponse(response, schema))
  )
  return yield* attempt.pipe(
    Effect.catchTag('TubearchivistHttpError', (error) =>
      error.status === 401 || error.status === 403
        ? Effect.annotateCurrentSpan({ 'tubearchivist.session_refreshed': true }).pipe(
            Effect.flatMap(() => login(client, config, cache)),
            Effect.flatMap((fresh) => build(fresh)),
            Effect.flatMap((freshRequest) =>
              executeResponse(client, freshRequest).pipe(
                Effect.flatMap((response) => decodeJsonResponse(response, schema))
              )
            )
          )
        : Effect.fail(error)
    )
  )
})

const subscriptionBody = (options: SubscriptionOptions, subscribed: boolean) => ({
  data: [{ channel_id: options.target, channel_subscribed: subscribed }],
})

export const TubearchivistApiLive = Layer.effect(
  TubearchivistApi,
  Effect.gen(function* () {
    const tubearchivistConfig = yield* TubearchivistConfig
    const client = yield* HttpClient.HttpClient
    const cache = yield* TubearchivistSessionCache
    const withConfig = <A, E, R>(
      f: (config: TubearchivistConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | TubearchivistError, R> => tubearchivistConfig.get().pipe(Effect.flatMap(f))

    return TubearchivistApi.of({
      status: Effect.fn('TubearchivistApi.status')(
        function* () {
          return yield* withConfig((config) =>
            Effect.all(
              {
                health: getJson(client, config, cache, '/health/', Schema.String),
                config: getJson(client, config, cache, '/appsettings/config/', JsonObjectSchema),
                video: getJson(client, config, cache, '/stats/video/', JsonObjectSchema),
                channel: getJson(client, config, cache, '/stats/channel/', JsonObjectSchema),
                download: getJson(client, config, cache, '/stats/download/', JsonObjectSchema),
                watch: getJson(client, config, cache, '/stats/watch/', JsonObjectSchema),
              },
              { concurrency: 1 }
            ).pipe(
              Effect.map((parts) => ({
                url: normalizeBaseUrl(config.url),
                health: parts.health,
                config: parts.config,
                stats: { video: parts.video, channel: parts.channel, download: parts.download, watch: parts.watch },
              }))
            )
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'status' })
      ),
      channels: Effect.fn('TubearchivistApi.channels')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, cache, '/channel/', ChannelResponseSchema(options.limit))
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'channels' })
      ),
      channelInfo: Effect.fn('TubearchivistApi.channelInfo')(
        function* (options) {
          return yield* withConfig((config) =>
            getJson(client, config, cache, `/channel/${options.id}/`, ChannelDetailSchema)
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'channelInfo' })
      ),
      subscribe: Effect.fn('TubearchivistApi.subscribe')(
        function* (options) {
          return yield* withConfig((config) =>
            postJson(client, config, cache, '/channel/', subscriptionBody(options, true), JsonObjectSchema).pipe(
              Effect.map((response) => ({
                target: options.target,
                subscribed: true,
                response,
                note: 'Subscribe task queued. Run tasks to inspect Celery progress.',
              }))
            )
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'subscribe' })
      ),
      unsubscribe: Effect.fn('TubearchivistApi.unsubscribe')(
        function* (options) {
          return yield* withConfig((config) =>
            postJson(client, config, cache, '/channel/', subscriptionBody(options, false), JsonObjectSchema).pipe(
              Effect.map((response) => ({ target: options.target, subscribed: false, response }))
            )
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'unsubscribe' })
      ),
      videos: Effect.fn('TubearchivistApi.videos')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, cache, '/video/', VideoResponseSchema(options.limit), [['page', 0]])
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'videos' })
      ),
      videoInfo: Effect.fn('TubearchivistApi.videoInfo')(
        function* (options) {
          return yield* withConfig((config) =>
            getJson(client, config, cache, `/video/${options.id}/`, VideoDetailSchema)
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'videoInfo' })
      ),
      downloads: Effect.fn('TubearchivistApi.downloads')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, cache, '/download/', DownloadResponseSchema(options.limit))
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'downloads' })
      ),
      playlists: Effect.fn('TubearchivistApi.playlists')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, cache, '/playlist/', PlaylistResponseSchema(options.limit))
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'playlists' })
      ),
      tasks: Effect.fn('TubearchivistApi.tasks')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({ 'tubearchivist.limit': options.limit })
          return yield* withConfig((config) =>
            getJson(client, config, cache, '/task/by-name/', TasksSchema(options.limit))
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'tasks' })
      ),
      search: Effect.fn('TubearchivistApi.search')(
        function* (options) {
          yield* Effect.annotateCurrentSpan({
            'tubearchivist.query_length': options.query.length,
            'tubearchivist.limit': options.limit,
          })
          return yield* withConfig((config) =>
            getJson(client, config, cache, '/search/', SearchResponseSchema(options.query, options.limit), [
              ['query', options.query],
            ])
          )
        },
        Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistApi', method: 'search' })
      ),
    })
  })
)
