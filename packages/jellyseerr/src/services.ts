import { makeConfigReaders } from '@garage/cli-protocol'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { envMissing } from './errors.js'
import type { JellyseerrError } from './errors.js'
import type {
  DeleteRequestResult,
  IssueRecord,
  JellyseerrConfigValue,
  LimitOptions,
  ListResult,
  MediaSummary,
  RequestCounts,
  RequestListOptions,
  RequestRecord,
  SearchOptions,
  SearchRecord,
  SystemStatus,
  UserRecord,
} from './model.js'

export class JellyseerrConfig extends Context.Service<
  JellyseerrConfig,
  {
    readonly get: () => Effect.Effect<JellyseerrConfigValue, JellyseerrError>
  }
>()('@garage/jellyseerr/services/JellyseerrConfig') {}

export class JellyseerrApi extends Context.Service<
  JellyseerrApi,
  {
    readonly status: () => Effect.Effect<SystemStatus, JellyseerrError>
    readonly requests: (options: RequestListOptions) => Effect.Effect<ListResult<RequestRecord>, JellyseerrError>
    readonly requestCounts: () => Effect.Effect<RequestCounts, JellyseerrError>
    readonly search: (options: SearchOptions) => Effect.Effect<ListResult<SearchRecord>, JellyseerrError>
    readonly mediaStatus: (mediaId: number) => Effect.Effect<MediaSummary, JellyseerrError>
    readonly recentlyAdded: (options: LimitOptions) => Effect.Effect<ListResult<MediaSummary>, JellyseerrError>
    readonly approve: (requestId: number) => Effect.Effect<RequestRecord, JellyseerrError>
    readonly decline: (requestId: number) => Effect.Effect<RequestRecord, JellyseerrError>
    readonly deleteRequest: (requestId: number) => Effect.Effect<DeleteRequestResult, JellyseerrError>
    readonly users: (options: LimitOptions) => Effect.Effect<ListResult<UserRecord>, JellyseerrError>
    readonly issues: (options: LimitOptions) => Effect.Effect<ListResult<IssueRecord>, JellyseerrError>
  }
>()('@garage/jellyseerr/services/JellyseerrApi') {}

const { readRequiredString, readRequiredSecret } = makeConfigReaders(envMissing)

const loadConfig = Effect.fn('JellyseerrConfig.get')(
  function* () {
    const url = yield* readRequiredString('JELLYSEERR_URL')
    const apiKey = yield* readRequiredSecret('JELLYSEERR_API_KEY')

    return { url, apiKey }
  },
  Effect.annotateLogs({ package: '@garage/jellyseerr', service: 'JellyseerrConfig', method: 'get' })
)

export const JellyseerrConfigLive = Layer.effect(
  JellyseerrConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(loadConfig())
    return JellyseerrConfig.of({ get: () => cachedGet })
  })
)
