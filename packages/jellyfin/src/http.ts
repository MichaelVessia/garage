import { listResult, makeJsonClient } from '@garage/cli-protocol'
import type { JsonClient } from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

import {
  ItemsResponseSchema,
  BaseItemSchema,
  LibrarySchema,
  LibraryStatsSchema,
  ScheduledTaskSchema,
  SessionSchema,
  SystemInfoSchema,
  UserSchema,
} from './api-schema.js'
import {
  ambiguousAdministrator,
  decodeError,
  disabledConfiguredUser,
  httpError,
  missingConfiguredUser,
  noEnabledAdministrator,
  unreachable,
} from './errors.js'
import type { JellyfinError } from './errors.js'
import type { JellyfinConfigValue } from './model.js'
import { JellyfinApi, JellyfinConfig } from './services.js'

const applyAuth = (config: JellyfinConfigValue) =>
  HttpClientRequest.setHeaders({ accept: 'application/json', 'x-emby-token': Redacted.value(config.apiKey) })

const httpClientFor = (client: HttpClient.HttpClient, config: JellyfinConfigValue) =>
  makeJsonClient<JellyfinError>({
    client,
    baseUrl: config.url,
    applyAuth: applyAuth(config),
    errors: { httpError, unreachable, decodeError },
  })

const mediaUserId = Effect.fn('jellyfin.mediaUserId')(function* (
  http: JsonClient<JellyfinError>,
  configuredUserId: Option.Option<string>
): Effect.fn.Return<string, JellyfinError> {
  const users = yield* http.getJson('/Users', Schema.Array(UserSchema))

  if (Option.isSome(configuredUserId)) {
    const userId = configuredUserId.value
    const configuredUser = users.find((user) => user.id === userId)
    if (configuredUser === undefined) {
      return yield* missingConfiguredUser(userId)
    }
    if (configuredUser.isDisabled === true) {
      return yield* disabledConfiguredUser(userId)
    }
    return configuredUser.id
  }

  const enabledAdministrators = users.filter((user) => user.isAdministrator === true && user.isDisabled !== true)
  if (enabledAdministrators.length > 1) {
    return yield* ambiguousAdministrator(enabledAdministrators.length)
  }

  const [selected] = enabledAdministrators
  if (selected === undefined) {
    return yield* noEnabledAdministrator()
  }
  return selected.id
})

export const JellyfinApiLive = Layer.effect(
  JellyfinApi,
  Effect.gen(function* () {
    const jellyfinConfig = yield* JellyfinConfig
    const client = yield* HttpClient.HttpClient
    const withConfiguredHttp = <A, E>(
      f: (http: JsonClient<JellyfinError>, config: JellyfinConfigValue) => Effect.Effect<A, E>
    ) => jellyfinConfig.get().pipe(Effect.flatMap((config) => f(httpClientFor(client, config), config)))
    const withConfig = <A, E>(f: (http: JsonClient<JellyfinError>) => Effect.Effect<A, E>) =>
      withConfiguredHttp((http) => f(http))

    return JellyfinApi.of({
      status: () => withConfig((http) => http.getJson('/System/Info', SystemInfoSchema)),
      users: () => withConfig((http) => http.getJson('/Users', Schema.Array(UserSchema)).pipe(Effect.map(listResult))),
      libraries: () =>
        withConfig((http) =>
          http.getJson('/Library/VirtualFolders', Schema.Array(LibrarySchema)).pipe(Effect.map(listResult))
        ),
      sessions: () =>
        withConfig((http) => http.getJson('/Sessions', Schema.Array(SessionSchema)).pipe(Effect.map(listResult))),
      recentlyAdded: (options) =>
        withConfiguredHttp(
          Effect.fn('JellyfinApi.recentlyAdded.configured')(function* (http, config) {
            const userId = yield* mediaUserId(http, Option.fromNullishOr(config.userId))
            return yield* http
              .getJson(`/Users/${userId}/Items/Latest`, Schema.Array(BaseItemSchema), [['Limit', options.limit]])
              .pipe(Effect.map(listResult))
          })
        ),
      itemSearch: (options) =>
        withConfiguredHttp(
          Effect.fn('JellyfinApi.itemSearch.configured')(function* (http, config) {
            const userId = yield* mediaUserId(http, Option.fromNullishOr(config.userId))
            return yield* http.getJson(`/Users/${userId}/Items`, ItemsResponseSchema, [
              ['searchTerm', options.query],
              ['Recursive', true],
              ['IncludeItemTypes', 'Movie,Series,Episode'],
              ['Limit', options.limit],
            ])
          })
        ),
      libraryStats: () => withConfig((http) => http.getJson('/Items/Counts', LibraryStatsSchema)),
      scheduledTasks: () =>
        withConfig((http) =>
          http.getJson('/ScheduledTasks', Schema.Array(ScheduledTaskSchema)).pipe(Effect.map(listResult))
        ),
      runTask: (taskId) =>
        withConfig((http) =>
          http
            .requestStatus('post', `/ScheduledTasks/Running/${taskId}`)
            .pipe(Effect.map((httpStatus) => ({ started: true, taskId, httpStatus })))
        ),
    })
  })
)
