import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import type * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

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

const endpoint = (config: AutocaliwebConfigValue, path: string): string =>
  path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${normalizeBaseUrl(config.url)}${path.startsWith('/') ? path : `/${path}`}`

const basicAuth = (config: AutocaliwebConfigValue): string =>
  `Basic ${btoa(`${config.username}:${Redacted.value(config.password)}`)}`

const withBasicAuth = (config: AutocaliwebConfigValue, accept: string) =>
  HttpClientRequest.setHeaders({ accept, authorization: basicAuth(config) })

const toDecodeError = (error: { readonly message: string }): AutocaliwebError => decodeError(error.message, error)

const decodeJsonBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, AutocaliwebError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const responseText = (response: HttpClientResponse.HttpClientResponse): Effect.Effect<string, AutocaliwebError> =>
  response.text.pipe(Effect.mapError(toDecodeError))

const execute = Effect.fn('autocaliweb.execute')(function* (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.fn.Return<HttpClientResponse.HttpClientResponse, AutocaliwebError> {
  const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message, error)))
  if (response.status < 200 || response.status >= 300) {
    return yield* httpError(response.status)
  }
  return response
})

const getJson = <A, I, RD, RE>(
  client: HttpClient.HttpClient,
  config: AutocaliwebConfigValue,
  path: string,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, AutocaliwebError, RD> =>
  execute(client, HttpClientRequest.get(endpoint(config, path)).pipe(withBasicAuth(config, 'application/json'))).pipe(
    Effect.flatMap((response) => decodeJsonBody(response, schema))
  )

const getFeed = (
  client: HttpClient.HttpClient,
  config: AutocaliwebConfigValue,
  path: string
): Effect.Effect<OpdsFeed, AutocaliwebError> =>
  execute(
    client,
    HttpClientRequest.get(endpoint(config, path)).pipe(withBasicAuth(config, 'application/atom+xml'))
  ).pipe(
    Effect.flatMap(responseText),
    Effect.flatMap((xml) => parseOpdsFeed(config.url, xml))
  )

const toListResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({
  count: records.length,
  records,
})

const withQuery = (path: string, query: string): string => `${path}?query=${encodeURIComponent(query)}`

const collectBookFeed = (
  client: HttpClient.HttpClient,
  config: AutocaliwebConfigValue,
  path: string,
  limit: number
): Effect.Effect<ListResult<BookRecord>, AutocaliwebError> => {
  const loop = (
    nextPath: string,
    records: ReadonlyArray<BookRecord>
  ): Effect.Effect<ReadonlyArray<BookRecord>, AutocaliwebError> =>
    getFeed(client, config, nextPath).pipe(
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
    const withConfig = <A, E, R>(
      f: (config: AutocaliwebConfigValue) => Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | AutocaliwebError, R> => autocaliwebConfig.get().pipe(Effect.flatMap(f))

    const loadStats = (config: AutocaliwebConfigValue) => getJson(client, config, '/opds/stats', StatsSchema)

    return AutocaliwebApi.of({
      status: () =>
        withConfig(
          Effect.fn('AutocaliwebApi.status.configured')(function* (config) {
            const feed = yield* getFeed(client, config, '/opds')
            const statRecords = yield* loadStats(config)
            yield* Effect.annotateCurrentSpan({ 'autocaliweb.route_count': feed.navigation.length })
            return {
              title: Option.getOrUndefined(feed.title),
              updated: Option.getOrUndefined(feed.updated),
              catalogCount: feed.navigation.length,
              stats: statRecords,
            }
          })
        ),
      stats: () => withConfig(loadStats),
      catalog: () =>
        withConfig((config) =>
          getFeed(client, config, '/opds').pipe(Effect.map((feed) => toListResult(feed.navigation)))
        ),
      books: (options) =>
        withConfig((config) => collectBookFeed(client, config, '/opds/books/letter/00', options.limit)),
      recent: (options) => withConfig((config) => collectBookFeed(client, config, '/opds/new', options.limit)),
      search: (options) =>
        withConfig((config) =>
          getFeed(client, config, withQuery('/opds/search', options.query)).pipe(
            Effect.map((feed) => {
              const records = feed.books.slice(0, options.limit)
              return { query: options.query, total: feed.books.length, count: records.length, records }
            })
          )
        ),
      bookInfo: (options) =>
        withConfig((config) =>
          getJson(client, config, `/ajax/book/${encodeURIComponent(options.uuid)}`, BookInfoSchema)
        ),
      shelves: () =>
        withConfig((config) =>
          getFeed(client, config, '/opds/shelfindex').pipe(
            Effect.map((feed): ListResult<CatalogEntry> => toListResult(feed.navigation))
          )
        ),
    })
  })
)
