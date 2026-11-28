import * as Cloudflare from '@alchemy.run/cloudflare'
import BattleblocksWorker from '@garage/battleblocks-server/BattleblocksWorker'
import { AlchemyContext, localState, Stack } from 'alchemy'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Str from 'effect/String'

export default Stack(
  'Battleblocks',
  {
    providers: Cloudflare.providers(),
    state: Layer.unwrap(Effect.map(AlchemyContext, ({ dev }) => (dev ? localState() : Cloudflare.state()))),
  },
  Effect.gen(function* () {
    const battleblocks = yield* BattleblocksWorker
    const { dev } = yield* AlchemyContext
    const domain = dev
      ? null
      : yield* Config.String('BATTLEBLOCKS_DOMAIN').pipe(
          Config.withDefault(''),
          Config.map((hostname) => Str.trim(hostname) || 'battleblocks.vessia.net')
        )
    const app = yield* Cloudflare.Website.Vite('BattleblocksApp', {
      rootDir: 'web',
      main: 'src/worker.ts',
      env: { BATTLEBLOCKS: battleblocks },
      domain,
      assets: {
        runWorkerFirst: ['/api', '/api/*', '/health', '/version.json'],
        notFoundHandling: 'single-page-application',
      },
    })

    return { url: app.url }
  })
)
