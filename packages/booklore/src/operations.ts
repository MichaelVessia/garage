import { Effect } from 'effect'

import type { BookloreError } from './errors.js'
import type {
  BookInfoOptions,
  BookRecord,
  CurrentUser,
  JsonObject,
  LibraryRecord,
  LimitOptions,
  ListResult,
  SearchOptions,
  SearchResult,
  VersionResult,
} from './model.js'
import { BookloreApi, BookloreConfig } from './services.js'

export const defaultLimit = 50
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

const requireConfig = Effect.gen(function* () {
  const config = yield* BookloreConfig
  yield* config.get
})

export const status: Effect.Effect<VersionResult, BookloreError, BookloreApi | BookloreConfig> = Effect.gen(
  function* () {
    yield* requireConfig
    const api = yield* BookloreApi
    return yield* api.status
  }
)

export const version: Effect.Effect<VersionResult, BookloreError, BookloreApi | BookloreConfig> = status

export const me: Effect.Effect<CurrentUser, BookloreError, BookloreApi | BookloreConfig> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* BookloreApi
  return yield* api.me
})

export const libraries: Effect.Effect<
  ListResult<LibraryRecord>,
  BookloreError,
  BookloreApi | BookloreConfig
> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* BookloreApi
  return yield* api.libraries
})

export const books = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<BookRecord>, BookloreError, BookloreApi | BookloreConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* BookloreApi
    return yield* api.books(options)
  })

export const bookInfo = (
  options: BookInfoOptions
): Effect.Effect<BookRecord, BookloreError, BookloreApi | BookloreConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* BookloreApi
    return yield* api.bookInfo(options)
  })

export const search = (
  options: SearchOptions
): Effect.Effect<SearchResult, BookloreError, BookloreApi | BookloreConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* BookloreApi
    return yield* api.search(options)
  })

export const shelves: Effect.Effect<ListResult<JsonObject>, BookloreError, BookloreApi | BookloreConfig> = Effect.gen(
  function* () {
    yield* requireConfig
    const api = yield* BookloreApi
    return yield* api.shelves
  }
)
