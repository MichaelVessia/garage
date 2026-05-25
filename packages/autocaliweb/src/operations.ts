import { Effect } from 'effect'

import type { AutocaliwebError } from './errors.js'
import type {
  BookInfoOptions,
  BookInfoRecord,
  BookRecord,
  CatalogEntry,
  LimitOptions,
  ListResult,
  SearchOptions,
  SearchResult,
  StatsResult,
  StatusResult,
} from './index.js'
import { AutocaliwebApi } from './services.js'
import type { AutocaliwebConfig } from './services.js'

export const defaultLimit = 50
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

export const status: Effect.Effect<StatusResult, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> = Effect.gen(
  function* () {
    const api = yield* AutocaliwebApi
    return yield* api.status()
  }
).pipe(
  Effect.withSpan('autocaliweb.status'),
  Effect.annotateLogs({ package: '@garage/autocaliweb', operation: 'status' })
)

export const version: Effect.Effect<StatusResult, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> = status.pipe(
  Effect.withSpan('autocaliweb.version'),
  Effect.annotateLogs({ package: '@garage/autocaliweb', operation: 'version' })
)

export const stats: Effect.Effect<StatsResult, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> = Effect.gen(
  function* () {
    const api = yield* AutocaliwebApi
    return yield* api.stats()
  }
).pipe(
  Effect.withSpan('autocaliweb.stats'),
  Effect.annotateLogs({ package: '@garage/autocaliweb', operation: 'stats' })
)

export const catalog: Effect.Effect<
  ListResult<CatalogEntry>,
  AutocaliwebError,
  AutocaliwebApi | AutocaliwebConfig
> = Effect.gen(function* () {
  const api = yield* AutocaliwebApi
  return yield* api.catalog()
}).pipe(
  Effect.withSpan('autocaliweb.catalog'),
  Effect.annotateLogs({ package: '@garage/autocaliweb', operation: 'catalog' })
)

export const books: (
  options?: LimitOptions
) => Effect.Effect<ListResult<BookRecord>, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> = Effect.fn(
  'autocaliweb.books'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<BookRecord>, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'autocaliweb.limit': limitOptions.limit })
    const api = yield* AutocaliwebApi
    return yield* api.books(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/autocaliweb', operation: 'books' })
)

export const recent: (
  options?: LimitOptions
) => Effect.Effect<ListResult<BookRecord>, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> = Effect.fn(
  'autocaliweb.recent'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<BookRecord>, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'autocaliweb.limit': limitOptions.limit })
    const api = yield* AutocaliwebApi
    return yield* api.recent(limitOptions)
  },
  Effect.annotateLogs({ package: '@garage/autocaliweb', operation: 'recent' })
)

export const search = Effect.fn('autocaliweb.search')(
  function* (
    options: SearchOptions
  ): Effect.fn.Return<SearchResult, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> {
    yield* Effect.annotateCurrentSpan({
      'autocaliweb.query_length': options.query.length,
      'autocaliweb.limit': options.limit,
    })
    const api = yield* AutocaliwebApi
    return yield* api.search(options)
  },
  Effect.annotateLogs({ package: '@garage/autocaliweb', operation: 'search' })
)

export const bookInfo = Effect.fn('autocaliweb.bookInfo')(
  function* (
    options: BookInfoOptions
  ): Effect.fn.Return<BookInfoRecord, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> {
    yield* Effect.annotateCurrentSpan({ 'autocaliweb.book_uuid_present': options.uuid.length > 0 })
    const api = yield* AutocaliwebApi
    return yield* api.bookInfo(options)
  },
  Effect.annotateLogs({ package: '@garage/autocaliweb', operation: 'bookInfo' })
)

export const shelves: Effect.Effect<
  ListResult<CatalogEntry>,
  AutocaliwebError,
  AutocaliwebApi | AutocaliwebConfig
> = Effect.gen(function* () {
  const api = yield* AutocaliwebApi
  return yield* api.shelves()
}).pipe(
  Effect.withSpan('autocaliweb.shelves'),
  Effect.annotateLogs({ package: '@garage/autocaliweb', operation: 'shelves' })
)
