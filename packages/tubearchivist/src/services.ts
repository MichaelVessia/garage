import { Config, Context, Effect, Layer, Ref } from 'effect'

import { envMissing } from './errors.js'
import type { TubearchivistError } from './errors.js'
import type {
  ChannelRecord,
  DownloadRecord,
  IdOptions,
  LimitOptions,
  ListResult,
  PlaylistRecord,
  SearchOptions,
  SearchResult,
  SessionCookies,
  StatusResult,
  SubscriptionOptions,
  SubscriptionResult,
  TaskRecord,
  TubearchivistConfigValue,
  VideoRecord,
} from './model.js'

export class TubearchivistConfig extends Context.Service<
  TubearchivistConfig,
  { readonly get: Effect.Effect<TubearchivistConfigValue, TubearchivistError> }
>()('@garage/tubearchivist/services/TubearchivistConfig') {}

export interface TubearchivistSessionCacheService {
  readonly read: (key: string) => Effect.Effect<SessionCookies | undefined, never, never>
  readonly write: (key: string, session: SessionCookies) => Effect.Effect<void, never, never>
}

export class TubearchivistSessionCache extends Context.Service<
  TubearchivistSessionCache,
  TubearchivistSessionCacheService
>()('@garage/tubearchivist/services/TubearchivistSessionCache') {}

export class TubearchivistApi extends Context.Service<
  TubearchivistApi,
  {
    readonly status: Effect.Effect<StatusResult, TubearchivistError>
    readonly channels: (options: LimitOptions) => Effect.Effect<ListResult<ChannelRecord>, TubearchivistError>
    readonly channelInfo: (options: IdOptions) => Effect.Effect<ChannelRecord, TubearchivistError>
    readonly subscribe: (options: SubscriptionOptions) => Effect.Effect<SubscriptionResult, TubearchivistError>
    readonly unsubscribe: (options: SubscriptionOptions) => Effect.Effect<SubscriptionResult, TubearchivistError>
    readonly videos: (options: LimitOptions) => Effect.Effect<ListResult<VideoRecord>, TubearchivistError>
    readonly videoInfo: (options: IdOptions) => Effect.Effect<VideoRecord, TubearchivistError>
    readonly downloads: (options: LimitOptions) => Effect.Effect<ListResult<DownloadRecord>, TubearchivistError>
    readonly playlists: (options: LimitOptions) => Effect.Effect<ListResult<PlaylistRecord>, TubearchivistError>
    readonly tasks: (options: LimitOptions) => Effect.Effect<ListResult<TaskRecord>, TubearchivistError>
    readonly search: (options: SearchOptions) => Effect.Effect<SearchResult, TubearchivistError>
  }
>()('@garage/tubearchivist/services/TubearchivistApi') {}

const readRequiredString = (name: string): Effect.Effect<string, TubearchivistError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

export const TubearchivistConfigLive = Layer.succeed(TubearchivistConfig, {
  get: Effect.gen(function* () {
    const url = yield* readRequiredString('TUBEARCHIVIST_URL')
    const username = yield* readRequiredString('TUBEARCHIVIST_USERNAME')
    const password = yield* readRequiredString('TUBEARCHIVIST_PASSWORD')
    return { url, username, password }
  }),
})

export const TubearchivistSessionCacheMemoryLive = Layer.effect(
  TubearchivistSessionCache,
  Ref.make<ReadonlyMap<string, SessionCookies>>(new Map<string, SessionCookies>()).pipe(
    Effect.map((sessions) =>
      TubearchivistSessionCache.of({
        read: (key) => Ref.get(sessions).pipe(Effect.map((records) => records.get(key))),
        write: (key, session) => Ref.update(sessions, (records) => new Map(records).set(key, session)),
      })
    )
  )
)
