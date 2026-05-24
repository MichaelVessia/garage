import { Config, Context, Effect, Layer } from 'effect'

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
  { readonly get: Effect.Effect<JellyfinConfigValue, JellyfinError> }
>()('@garage/jellyfin/services/JellyfinConfig') {}

export class JellyfinApi extends Context.Service<
  JellyfinApi,
  {
    readonly status: Effect.Effect<SystemStatus, JellyfinError>
    readonly users: Effect.Effect<ListResult<UserRecord>, JellyfinError>
    readonly libraries: Effect.Effect<ListResult<LibraryRecord>, JellyfinError>
    readonly sessions: Effect.Effect<ListResult<SessionRecord>, JellyfinError>
    readonly recentlyAdded: (options: LimitOptions) => Effect.Effect<ListResult<ItemRecord>, JellyfinError>
    readonly itemSearch: (options: SearchOptions) => Effect.Effect<ListResult<ItemRecord>, JellyfinError>
    readonly libraryStats: Effect.Effect<LibraryStats, JellyfinError>
    readonly scheduledTasks: Effect.Effect<ListResult<ScheduledTaskRecord>, JellyfinError>
    readonly runTask: (taskId: string) => Effect.Effect<RunTaskResult, JellyfinError>
  }
>()('@garage/jellyfin/services/JellyfinApi') {}

const readRequiredString = (name: string): Effect.Effect<string, JellyfinError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

export const JellyfinConfigLive = Layer.succeed(JellyfinConfig, {
  get: Effect.gen(function* () {
    const url = yield* readRequiredString('JELLYFIN_URL')
    const apiKey = yield* readRequiredString('JELLYFIN_API_KEY')
    return { url, apiKey }
  }),
})
