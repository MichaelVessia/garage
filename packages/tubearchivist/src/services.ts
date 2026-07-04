import { makeConfigReaders } from '@garage/cli-protocol'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import type * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

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
  { readonly get: () => Effect.Effect<TubearchivistConfigValue, TubearchivistError> }
>()('@garage/tubearchivist/services/TubearchivistConfig') {}

export interface TubearchivistSessionCacheService {
  readonly read: (key: string) => Effect.Effect<Option.Option<SessionCookies>>
  readonly write: (key: string, session: SessionCookies) => Effect.Effect<void>
}

export class TubearchivistSessionCache extends Context.Service<
  TubearchivistSessionCache,
  TubearchivistSessionCacheService
>()('@garage/tubearchivist/services/TubearchivistSessionCache') {}

export class TubearchivistApi extends Context.Service<
  TubearchivistApi,
  {
    readonly status: () => Effect.Effect<StatusResult, TubearchivistError>
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

const { readRequiredString, readRequiredSecret } = makeConfigReaders(envMissing)

export const TubearchivistConfigLive = Layer.effect(
  TubearchivistConfig,
  Effect.gen(function* () {
    const loadConfig = Effect.fn('TubearchivistConfig.get')(
      function* () {
        const url = yield* readRequiredString('TUBEARCHIVIST_URL')
        const username = yield* readRequiredString('TUBEARCHIVIST_USERNAME')
        const password = yield* readRequiredSecret('TUBEARCHIVIST_PASSWORD')
        return { url, username, password }
      },
      Effect.annotateLogs({ package: '@garage/tubearchivist', service: 'TubearchivistConfig', method: 'get' })
    )
    const cachedGet = yield* Effect.cached(loadConfig())
    return TubearchivistConfig.of({ get: () => cachedGet })
  })
)

export const TubearchivistSessionCacheMemoryLive = Layer.effect(
  TubearchivistSessionCache,
  Ref.make<HashMap.HashMap<string, SessionCookies>>(HashMap.empty<string, SessionCookies>()).pipe(
    Effect.map((sessions) =>
      TubearchivistSessionCache.of({
        read: Effect.fn('TubearchivistSessionCache.read')(
          function* (key) {
            return yield* Ref.get(sessions).pipe(Effect.map((records) => HashMap.get(records, key)))
          },
          Effect.annotateLogs({
            package: '@garage/tubearchivist',
            service: 'TubearchivistSessionCache',
            method: 'read',
          })
        ),
        write: Effect.fn('TubearchivistSessionCache.write')(
          function* (key, session) {
            yield* Ref.update(sessions, (records) => HashMap.set(records, key, session))
          },
          Effect.annotateLogs({
            package: '@garage/tubearchivist',
            service: 'TubearchivistSessionCache',
            method: 'write',
          })
        ),
      })
    )
  )
)
