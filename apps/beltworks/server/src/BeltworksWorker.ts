import * as Cloudflare from '@alchemy.run/cloudflare'
import { RuntimeContext } from 'alchemy/RuntimeContext'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { FactoryStore, router } from './BeltworksRouter.ts'

const factories = Cloudflare.KV.Namespace('BeltworksFactories')
export default class BeltworksWorker extends Cloudflare.Worker<BeltworksWorker>()(
  'BeltworksWorker',
  { main: import.meta.url, compatibility: { flags: ['nodejs_compat'] } },
  Effect.gen(function* () {
    const services = yield* Layer.build(
      Layer.merge(Cloudflare.KV.ReadWriteNamespaceBinding, SecureRandom.layerWebCrypto)
    )
    const kv = yield* Cloudflare.KV.ReadWriteNamespace(factories).pipe(Effect.provide(services))
    return {
      fetch: Effect.gen(function* () {
        const context = yield* RuntimeContext
        return yield* router.pipe(
          Effect.provideService(FactoryStore, {
            get: (key) => kv.get(key, 'json').pipe(Effect.provideService(RuntimeContext, context), Effect.orDie),
            put: (key, value) => kv.put(key, value).pipe(Effect.provideService(RuntimeContext, context), Effect.orDie),
          })
        )
      }).pipe(Effect.provide(services)),
    }
  })
) {}
