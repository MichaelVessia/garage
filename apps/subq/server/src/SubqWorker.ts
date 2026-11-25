import * as Cloudflare from '@alchemy.run/cloudflare'
import * as DomainCloudflare from '@alchemy.run/domain/Cloudflare'
import { Subq, SubqHandlers } from '@garage/subq-domain/Subq.model'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'

import { SessionLive } from './Session.ts'
import { SubqRouter } from './SubqRouter.ts'

const SubqLive = Layer.mergeAll(
  SessionLive.pipe(Layer.provide(FetchHttpClient.layer)),
  Subq.layer(SubqHandlers).pipe(Layer.provide(DomainCloudflare.layerDurableObjects()))
)

export default class SubqWorker extends Cloudflare.Worker<SubqWorker>()(
  'SubqWorker',
  { main: import.meta.url, compatibility: { flags: ['nodejs_compat'] } },
  Effect.gen(function* () {
    const services = yield* Layer.build(SubqLive)
    const { fetch } = yield* Effect.provide(SubqRouter, services)
    return { fetch: Effect.provide(fetch, services) }
  })
) {}
