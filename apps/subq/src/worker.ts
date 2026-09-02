import { D1Client } from '@effect/sql-d1'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as P from 'effect/Predicate'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http'
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc'

import { AppRpcs } from '#shared'

import { BetterAuthApiError } from './auth/better-auth-error.js'
import { AuthRpcMiddlewareLive, AuthService, makeAuth } from './auth/index.js'
import { DataExportRpcHandlersLive, DataExportServiceLive } from './data-export/index.js'
import { AssetRequestError, UnexpectedRequestSource } from './errors.js'
import { GoalRepoLive, GoalRpcHandlersLive, GoalServiceLive } from './goals/index.js'
import { InjectionLogRepoLive, InjectionRpcHandlersLive, ScheduleAssignmentLive } from './injection/index.js'
import { ScheduleCadenceServiceLive, ScheduleRepoLive, ScheduleRpcHandlersLive } from './schedule/index.js'
import { SettingsRepoLive, SettingsRpcHandlersLive } from './settings/index.js'
import { isSpaNavigationPath } from './spa-routes.js'
import { StatsRpcHandlersLive, StatsServiceLive } from './stats/index.js'
import { WeightLogRepoLive, WeightRpcHandlersLive } from './weight/index.js'

// D1 database resource. Drizzle-generated migrations are applied at deploy
// time by the resource itself (sorted by numeric prefix, tracked in
// `drizzle_migrations`).
export const Database = Cloudflare.D1.Database('Database', {
  // Prod pins the existing database name so state recovery adopts it instead of creating an empty replacement.
  name: Config.string('SUBQ_DATABASE_NAME').pipe(Config.option, Config.map(Option.getOrUndefined)),
  migrationsDir: './drizzle',
  migrationsTable: 'drizzle_migrations',
})

const RpcHandlersLive = Layer.mergeAll(
  WeightRpcHandlersLive,
  InjectionRpcHandlersLive,
  ScheduleRpcHandlersLive,
  StatsRpcHandlersLive,
  GoalRpcHandlersLive,
  SettingsRpcHandlersLive,
  DataExportRpcHandlersLive
)

const RepositoriesLive = Layer.mergeAll(
  WeightLogRepoLive,
  InjectionLogRepoLive,
  ScheduleRepoLive,
  GoalRepoLive,
  SettingsRepoLive
)

interface AssetFetcherService {
  readonly fetch: (request: Request) => Promise<Response>
}

const AssetFetcher = Schema.declare(
  (input): input is AssetFetcherService =>
    P.isObject(input) && P.hasProperty(input, 'fetch') && P.isFunction(input.fetch)
)

const ServicesLive = Layer.mergeAll(
  StatsServiceLive,
  GoalServiceLive,
  DataExportServiceLive,
  ScheduleCadenceServiceLive,
  ScheduleAssignmentLive
)

export default class SubqWorker extends Cloudflare.Worker<SubqWorker>()(
  'Subq',
  {
    main: import.meta.filename,
    // Custom domain, set only in prod's env file (.env.prod); dev stages
    // stay on workers.dev.
    domain: Config.string('SUBQ_DOMAIN').pipe(Config.option, Config.map(Option.getOrUndefined)),
    compatibility: {
      // Cloudflare native Effect tracing requires tracing.startActiveSpan (GA from 2026-07-28).
      date: '2026-07-28',
      flags: ['nodejs_compat'],
    },
    assets: {
      directory: './web/dist',
      htmlHandling: 'auto-trailing-slash',
      notFoundHandling: 'none',
      runWorkerFirst: true,
    },
  },
  Effect.gen(function* () {
    // Init phase: runs at plan time (registers bindings) and at runtime.
    // Raw binding access must stay lazy — bindings only exist at runtime.
    const db = yield* Cloudflare.D1.QueryDatabase(Database)
    const workerEnvironment = yield* Cloudflare.WorkerEnvironment
    const authSecret = yield* Config.redacted('BETTER_AUTH_SECRET')
    const authUrl = yield* Config.string('BETTER_AUTH_URL')

    const auth = yield* Effect.cached(
      db.raw.pipe(
        Effect.map((d1) =>
          makeAuth({
            db: d1,
            secret: Redacted.value(authSecret),
            baseURL: authUrl,
          })
        )
      )
    )

    const SqlLive = Layer.unwrap(db.raw.pipe(Effect.map((d1) => D1Client.layer({ db: d1 }))))
    const AuthLive = Layer.effect(AuthService, auth.pipe(Effect.map((instance) => ({ auth: instance }))))

    const AppLive = Layer.mergeAll(RpcHandlersLive, AuthRpcMiddlewareLive).pipe(
      Layer.provide(ServicesLive),
      Layer.provide(RepositoriesLive),
      Layer.provide(AuthLive),
      Layer.provide(SqlLive)
    )

    // toHttpEffect returns an inner per-request handler; flatten it INSIDE the
    // provide so the handler runs while the layer scope is still open.
    const rpcApp = RpcServer.toHttpEffect(AppRpcs).pipe(
      Effect.flatten,
      Effect.provide([AppLive, RpcSerialization.layerJson])
    )

    const handleAuthRequest = Effect.fn('handleAuthRequest')(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const { source } = request
      if (!(source instanceof Request)) {
        return yield* Effect.die(new UnexpectedRequestSource({ message: 'expected a web Request source' }))
      }
      const instance = yield* auth
      const response = yield* Effect.tryPromise({
        try: () => instance.handler(source),
        catch: (cause) => BetterAuthApiError.make({ cause }),
      })
      return HttpServerResponse.fromWeb(response)
    })

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        // request.url is path-only under the Workers runtime
        const url = new URL(request.url, 'http://localhost')
        if (url.pathname === '/health') {
          return HttpServerResponse.text('ok')
        }
        if (url.pathname.startsWith('/api/auth/')) {
          return yield* handleAuthRequest()
        }
        if (url.pathname === '/rpc' || url.pathname === '/rpc/') {
          return yield* rpcApp
        }

        const { source } = request
        if (!(source instanceof Request)) {
          return yield* Effect.die(new UnexpectedRequestSource({ message: 'expected a web Request source' }))
        }
        if (source.method !== 'GET' && source.method !== 'HEAD') {
          return HttpServerResponse.empty({ status: 404 })
        }

        const assetRequest = isSpaNavigationPath(url.pathname)
          ? new Request(new URL('/', source.url).toString(), source)
          : source
        const assets = yield* Schema.decodeUnknownEffect(AssetFetcher)(workerEnvironment.ASSETS)
        const assetResponse = yield* Effect.tryPromise({
          try: () => assets.fetch(assetRequest),
          catch: (cause) => AssetRequestError.make({ cause }),
        })
        return HttpServerResponse.fromWeb(assetResponse)
      }).pipe(Effect.orDie),
    }
  }).pipe(
    // The worker init IS the application entry point; binding layers are
    // provided here by design (see Alchemy's Worker docs).
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(Cloudflare.D1.QueryDatabaseBinding)
  )
) {}
