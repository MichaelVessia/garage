import * as Cloudflare from '@alchemy.run/cloudflare'
import * as DomainCloudflare from '@alchemy.run/domain/Cloudflare'
import { Logbook, LogbookHandlers } from '@garage/logbook-domain/Logbook.model'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'

import { LogbookRouter } from './LogbookRouter.ts'
import { SessionLive } from './Session.ts'

const LogbookLive = Layer.mergeAll(
  SessionLive.pipe(Layer.provide(FetchHttpClient.layer)),
  Logbook.layer(LogbookHandlers).pipe(Layer.provide(DomainCloudflare.layerDurableObjects()))
)

export default class LogbookWorker extends Cloudflare.Worker<LogbookWorker>()(
  'LogbookWorker',
  { main: import.meta.url, compatibility: { flags: ['nodejs_compat'] } },
  Effect.gen(function* () {
    const services = yield* Layer.build(LogbookLive)
    const { fetch } = yield* Effect.provide(LogbookRouter, services)
    return { fetch: Effect.provide(fetch, services) }
  })
) {}
