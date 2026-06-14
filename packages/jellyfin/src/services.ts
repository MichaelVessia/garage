import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'

import { envMissing } from './errors.js'
import type { JellyfinError } from './errors.js'
import type {
  ItemRecord,
  JellyfinConfigValue,
  LibraryRecord,
  LibraryStats,
  LimitOptions,
  ListResult,
  RunTaskResult,
  ScheduledTaskRecord,
  SearchOptions,
  SessionRecord,
  SystemStatus,
  UserRecord,
} from './model.js'

export class JellyfinConfig extends Context.Service<
  JellyfinConfig,
  { readonly get: () => Effect.Effect<JellyfinConfigValue, JellyfinError> }
>()('@garage/jellyfin/services/JellyfinConfig') {}

export class JellyfinApi extends Context.Service<
  JellyfinApi,
  {
    readonly status: () => Effect.Effect<SystemStatus, JellyfinError>
    readonly users: () => Effect.Effect<ListResult<UserRecord>, JellyfinError>
    readonly libraries: () => Effect.Effect<ListResult<LibraryRecord>, JellyfinError>
    readonly sessions: () => Effect.Effect<ListResult<SessionRecord>, JellyfinError>
    readonly recentlyAdded: (options: LimitOptions) => Effect.Effect<ListResult<ItemRecord>, JellyfinError>
    readonly itemSearch: (options: SearchOptions) => Effect.Effect<ListResult<ItemRecord>, JellyfinError>
    readonly libraryStats: () => Effect.Effect<LibraryStats, JellyfinError>
    readonly scheduledTasks: () => Effect.Effect<ListResult<ScheduledTaskRecord>, JellyfinError>
    readonly runTask: (taskId: string) => Effect.Effect<RunTaskResult, JellyfinError>
  }
>()('@garage/jellyfin/services/JellyfinApi') {}

const readRequiredString = (name: string): Effect.Effect<string, JellyfinError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

const readRequiredSecret = (name: string) =>
  Config.schema(Schema.Redacted(Schema.NonEmptyString), name).pipe(Effect.mapError(() => envMissing(name)))

const loadConfig = Effect.fn('JellyfinConfig.get')(
  function* () {
    const url = yield* readRequiredString('JELLYFIN_URL')
    const apiKey = yield* readRequiredSecret('JELLYFIN_API_KEY')
    return { url, apiKey }
  },
  Effect.annotateLogs({ package: '@garage/jellyfin', service: 'JellyfinConfig', method: 'get' })
)

export const JellyfinConfigLive = Layer.effect(
  JellyfinConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(loadConfig())
    return JellyfinConfig.of({ get: () => cachedGet })
  })
)
