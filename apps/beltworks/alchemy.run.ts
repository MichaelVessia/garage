import * as Cloudflare from '@alchemy.run/cloudflare'
import BeltworksWorker from '@garage/beltworks-server/BeltworksWorker'
import { AlchemyContext, localState, Stack } from 'alchemy'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Str from 'effect/String'

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
      ? null
      : yield* Config.String('BELTWORKS_DOMAIN').pipe(
          Config.withDefault(''),
          Config.map((hostname) => Str.trim(hostname) || 'beltworks.vessia.net')
        )
    const app = yield* Cloudflare.Website.Vite('BeltworksApp', {
      rootDir: 'web',
      main: 'src/worker.ts',
      env: { BELTWORKS: beltworks },
      domain,
      assets: {
        runWorkerFirst: ['/api', '/api/*', '/health', '/version.json'],
        notFoundHandling: 'single-page-application',
      },
    })

    return { url: app.url }
  })
)
