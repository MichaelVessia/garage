import * as Cloudflare from '@alchemy.run/cloudflare'
import * as DomainCloudflare from '@alchemy.run/domain/Cloudflare'
import LogbookWorker from '@garage/logbook-server/LogbookWorker'
import { AlchemyContext, localState, Stack } from 'alchemy'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

export default Stack(
  'Logbook',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), DomainCloudflare.providers()),
    state: Layer.unwrap(Effect.map(AlchemyContext, ({ dev }) => (dev ? localState() : Cloudflare.state()))),
  },
  Effect.gen(function* () {
    const logbook = yield* LogbookWorker
    const { dev } = yield* AlchemyContext
    const domain = dev
      ? undefined
      : yield* Config.String('LOGBOOK_DOMAIN').pipe(Config.option, Config.map(Option.getOrUndefined))
    const app = yield* Cloudflare.Website.Foldkit('LogbookApp', {
      rootDir: 'web',
      main: 'src/worker.ts',
      env: { LOGBOOK: logbook },
      domain: domain ?? null,
      assets: {
        runWorkerFirst: ['/api', '/api/*', '/v1', '/v1/*', '/mcp', '/frame/due', '/health'],
        notFoundHandling: 'single-page-application',
      },
    })

    return { url: app.url }
  })
)
