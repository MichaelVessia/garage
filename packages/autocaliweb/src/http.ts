import { listResult as toListResult, makeJsonClient } from '@garage/cli-protocol'
import type { JsonClient } from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import type { HttpClientResponse } from 'effect/unstable/http'

import { BookInfoSchema, StatsSchema } from './api-schema.js'
import { decodeError, httpError, unreachable } from './errors.js'
import type { AutocaliwebError } from './errors.js'
import type { AutocaliwebConfigValue, BookRecord, CatalogEntry, ListResult } from './model.js'
import { parseOpdsFeed } from './opds.js'
import type { OpdsFeed } from './opds.js'
import { AutocaliwebApi, AutocaliwebConfig } from './services.js'

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

// OPDS pagination hands back either a relative path or an absolute
// `nextHref` URL to follow. Authorization may only be forwarded to the
// configured origin; an upstream feed must not redirect Basic auth to another
// host. Both JSON and raw feed fetches share the client's transport mapping.
const feedUrl = Effect.fn('autocaliweb.feedUrl')(function* (config: AutocaliwebConfigValue, path: string) {
  const baseUrl = yield* Effect.try({
    try: () => new URL(normalizeBaseUrl(config.url)),
    catch: (cause) => decodeError('AutoCaliWeb base URL is invalid.', cause),
  })
  const candidate = yield* Effect.try({
    try: () =>
      new URL(
        path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/') ? path : `/${path}`,
        baseUrl
      ),
    catch: (cause) => decodeError('AutoCaliWeb returned an invalid OPDS pagination URL.', cause),
  })

  if (candidate.origin !== baseUrl.origin || candidate.username !== '' || candidate.password !== '') {
    return yield* decodeError('AutoCaliWeb returned a cross-origin OPDS pagination URL.')
  }

  return candidate.href
})

const basicAuth = (config: AutocaliwebConfigValue): string =>
  `Basic ${btoa(`${config.username}:${Redacted.value(config.password)}`)}`

const httpClientFor = (client: HttpClient.HttpClient, config: AutocaliwebConfigValue) =>
  makeJsonClient<AutocaliwebError>({
    client,
    baseUrl: config.url,
    applyAuth: (request) =>
      request.pipe(HttpClientRequest.setHeaders({ accept: 'application/json', authorization: basicAuth(config) })),
    errors: { httpError, unreachable, decodeError },
  })

const responseText = (response: HttpClientResponse.HttpClientResponse): Effect.Effect<string, AutocaliwebError> =>
  response.text.pipe(Effect.mapError((cause) => decodeError(cause.message, cause)))

const getFeed = (
  http: JsonClient<AutocaliwebError>,
  config: AutocaliwebConfigValue,
  path: string
): Effect.Effect<OpdsFeed, AutocaliwebError> =>
  feedUrl(config, path).pipe(
    Effect.flatMap((url) =>
      http.execute(
        HttpClientRequest.get(url).pipe(
          HttpClientRequest.setHeaders({ accept: 'application/atom+xml', authorization: basicAuth(config) })
        )
      )
    ),
    Effect.flatMap(responseText),
    Effect.flatMap((xml) => parseOpdsFeed(config.url, xml))
  )

const loadStats = (http: JsonClient<AutocaliwebError>) => http.getJson('/opds/stats', StatsSchema)

const withQuery = (path: string, query: string): string => `${path}?query=${encodeURIComponent(query)}`

const collectBookFeed = (
  http: JsonClient<AutocaliwebError>,
  config: AutocaliwebConfigValue,
  path: string,
  limit: number
): Effect.Effect<ListResult<BookRecord>, AutocaliwebError> => {
  const loop = (
    nextPath: string,
    records: ReadonlyArray<BookRecord>
  ): Effect.Effect<ReadonlyArray<BookRecord>, AutocaliwebError> =>
    getFeed(http, config, nextPath).pipe(
      Effect.withSpan('autocaliweb.collectOpdsPage'),
      Effect.flatMap((feed) => {
        const nextRecords = [...records, ...feed.books].slice(0, limit)
        return Option.match(feed.nextHref, {
          onNone: () => Effect.succeed(nextRecords),
          onSome: (nextHref) =>
            nextRecords.length >= limit ? Effect.succeed(nextRecords) : loop(nextHref, nextRecords),
        })
      })
    )

  return loop(path, []).pipe(Effect.map(toListResult))
}

export const AutocaliwebApiLive = Layer.effect(
  AutocaliwebApi,
  Effect.gen(function* () {
    const autocaliwebConfig = yield* AutocaliwebConfig
    const client = yield* HttpClient.HttpClient
    const withConfig = <A, E>(
      f: (http: JsonClient<AutocaliwebError>, config: AutocaliwebConfigValue) => Effect.Effect<A, E>
    ) => autocaliwebConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config), config)))

    return AutocaliwebApi.of({
      status: () =>
        withConfig(
          Effect.fn('AutocaliwebApi.status.configured')(function* (http, config) {
            const feed = yield* getFeed(http, config, '/opds')
            const statRecords = yield* loadStats(http)
            yield* Effect.annotateCurrentSpan({ 'autocaliweb.route_count': feed.navigation.length })
            return {
              title: Option.getOrUndefined(feed.title),
              updated: Option.getOrUndefined(feed.updated),
              catalogCount: feed.navigation.length,
              stats: statRecords,
            }
          })
        ),
      stats: () => withConfig((http) => loadStats(http)),
      catalog: () =>
        withConfig((http, config) =>
          getFeed(http, config, '/opds').pipe(Effect.map((feed) => toListResult(feed.navigation)))
        ),
      books: (options) =>
        withConfig((http, config) => collectBookFeed(http, config, '/opds/books/letter/00', options.limit)),
      recent: (options) => withConfig((http, config) => collectBookFeed(http, config, '/opds/new', options.limit)),
      search: (options) =>
        withConfig((http, config) =>
          getFeed(http, config, withQuery('/opds/search', options.query)).pipe(
            Effect.map((feed) => {
              const records = feed.books.slice(0, options.limit)
              return { query: options.query, total: feed.books.length, count: records.length, records }
            })
          )
        ),
      bookInfo: (options) =>
        withConfig((http) => http.getJson(`/ajax/book/${encodeURIComponent(options.uuid)}`, BookInfoSchema)),
      shelves: () =>
        withConfig((http, config) =>
          getFeed(http, config, '/opds/shelfindex').pipe(
            Effect.map((feed): ListResult<CatalogEntry> => toListResult(feed.navigation))
          )
        ),
    })
  })
)
