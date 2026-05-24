import { Config, Context, Effect, Layer, Ref } from 'effect'

import { envMissing } from './errors.js'
import type { BookloreError } from './errors.js'
import type {
  BookInfoOptions,
  BookRecord,
  BookloreConfigValue,
  CurrentUser,
  JsonObject,
  LibraryRecord,
  LimitOptions,
  ListResult,
  SearchOptions,
  SearchResult,
  VersionResult,
} from './model.js'

export class BookloreConfig extends Context.Service<
  BookloreConfig,
  { readonly get: Effect.Effect<BookloreConfigValue, BookloreError> }
>()('@garage/booklore/services/BookloreConfig') {}

export interface BookloreTokenCacheService {
  readonly read: (key: string) => Effect.Effect<string | undefined, never, never>
  readonly write: (key: string, token: string) => Effect.Effect<void, never, never>
}

export class BookloreTokenCache extends Context.Service<BookloreTokenCache, BookloreTokenCacheService>()(
  '@garage/booklore/services/BookloreTokenCache'
) {}

export class BookloreApi extends Context.Service<
  BookloreApi,
  {
    readonly status: Effect.Effect<VersionResult, BookloreError>
    readonly me: Effect.Effect<CurrentUser, BookloreError>
    readonly libraries: Effect.Effect<ListResult<LibraryRecord>, BookloreError>
    readonly books: (options: LimitOptions) => Effect.Effect<ListResult<BookRecord>, BookloreError>
    readonly bookInfo: (options: BookInfoOptions) => Effect.Effect<BookRecord, BookloreError>
    readonly search: (options: SearchOptions) => Effect.Effect<SearchResult, BookloreError>
    readonly shelves: Effect.Effect<ListResult<JsonObject>, BookloreError>
  }
>()('@garage/booklore/services/BookloreApi') {}

const readRequiredString = (name: string): Effect.Effect<string, BookloreError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

export const BookloreConfigLive = Layer.succeed(BookloreConfig, {
  get: Effect.gen(function* () {
    const url = yield* readRequiredString('BOOKLORE_URL')
    const username = yield* readRequiredString('BOOKLORE_USERNAME')
    const password = yield* readRequiredString('BOOKLORE_PASSWORD')
    return { url, username, password }
  }),
})

export const BookloreTokenCacheMemoryLive = Layer.effect(
  BookloreTokenCache,
  Ref.make<ReadonlyMap<string, string>>(new Map<string, string>()).pipe(
    Effect.map((tokens) =>
      BookloreTokenCache.of({
        read: (key) => Ref.get(tokens).pipe(Effect.map((records) => records.get(key))),
        write: (key, token) => Ref.update(tokens, (records) => new Map(records).set(key, token)),
      })
    )
  )
)
