import * as Cloudflare from '@alchemy.run/cloudflare'
import BeltworksWorker from '@garage/beltworks-server/BeltworksWorker'
import { AlchemyContext, localState, Stack } from 'alchemy'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

export default Stack(
  'Beltworks',
  {
    providers: Cloudflare.providers(),
    state: Layer.unwrap(Effect.map(AlchemyContext, ({ dev }) => (dev ? localState() : Cloudflare.state()))),
  },
  Effect.gen(function* () {
    const beltworks = yield* BeltworksWorker
    const { dev } = yield* AlchemyContext
    const domain = dev
      ? undefined
      : yield* Config.String('BELTWORKS_DOMAIN').pipe(Config.option, Config.map(Option.getOrUndefined))
    const app = yield* Cloudflare.Website.Vite('BeltworksApp', {
      rootDir: 'web',
      main: 'src/worker.ts',
      env: { BELTWORKS: beltworks },
      domain: domain ?? null,
      assets: {
        runWorkerFirst: ['/api', '/api/*', '/health'],
        notFoundHandling: 'single-page-application',
      },
    })

    return { url: app.url }
  })
)
