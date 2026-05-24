import { Effect, Layer } from 'effect'
import type { Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http'

import { BookInfoSchema, StatsSchema, toBookInfoRecord, toStatsResult } from './api-schema.js'
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

const basicAuth = (config: AutocaliwebConfigValue): string => `Basic ${btoa(`${config.username}:${config.password}`)}`

const withBasicAuth = (config: AutocaliwebConfigValue, accept: string) =>
  HttpClientRequest.setHeaders({ accept, authorization: basicAuth(config) })

const toDecodeError = (error: { readonly message: string }): AutocaliwebError => decodeError(error.message)

const decodeJsonBody = <A, I, RD, RE>(
  response: HttpClientResponse.HttpClientResponse,
  schema: Schema.Codec<A, I, RD, RE>
): Effect.Effect<A, AutocaliwebError, RD> =>
  HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(toDecodeError))

const responseText = (response: HttpClientResponse.HttpClientResponse): Effect.Effect<string, AutocaliwebError> =>
  response.text.pipe(Effect.mapError(toDecodeError))

const execute = (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest
): Effect.Effect<HttpClientResponse.HttpClientResponse, AutocaliwebError> =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(Effect.mapError((error) => unreachable(error.message)))
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
      Effect.flatMap((feed) => {
        const nextRecords = [...records, ...feed.books].slice(0, limit)
        if (nextRecords.length >= limit || feed.nextHref === undefined) {
          return Effect.succeed(nextRecords)
        }
        return loop(feed.nextHref, nextRecords)
      })
    )

  return loop(path, []).pipe(Effect.map(toListResult))
}

export const AutocaliwebApiLive = Layer.effect(
  AutocaliwebApi,
  Effect.gen(function* () {
    const autocaliwebConfig = yield* AutocaliwebConfig
    const config = yield* autocaliwebConfig.get
    const client = yield* HttpClient.HttpClient

    const stats = getJson(client, config, '/opds/stats', StatsSchema).pipe(Effect.map(toStatsResult))
    const catalog = getFeed(client, config, '/opds').pipe(Effect.map((feed) => toListResult(feed.navigation)))

    return AutocaliwebApi.of({
      status: Effect.gen(function* () {
        const feed = yield* getFeed(client, config, '/opds')
        const statRecords = yield* stats
        return { title: feed.title, updated: feed.updated, catalogCount: feed.navigation.length, stats: statRecords }
      }),
      stats,
      catalog,
      books: (options) => collectBookFeed(client, config, '/opds/books/letter/00', options.limit),
      recent: (options) => collectBookFeed(client, config, '/opds/new', options.limit),
      search: (options) =>
        getFeed(client, config, withQuery('/opds/search', options.query)).pipe(
          Effect.map((feed) => {
            const records = feed.books.slice(0, options.limit)
            return { query: options.query, total: feed.books.length, count: records.length, records }
          })
        ),
      bookInfo: (options) =>
        getJson(client, config, `/ajax/book/${encodeURIComponent(options.uuid)}`, BookInfoSchema).pipe(
          Effect.map(toBookInfoRecord)
        ),
      shelves: getFeed(client, config, '/opds/shelfindex').pipe(
        Effect.map((feed): ListResult<CatalogEntry> => toListResult(feed.navigation))
      ),
    })
  })
)
