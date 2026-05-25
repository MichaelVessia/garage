import { BunFileSystem, BunHttpClient, BunPath, BunRuntime } from '@effect/platform-bun'
import { cliObservabilityLayer, renderEnvelope } from '@garage/cli-protocol'
import { TubearchivistApiLive, TubearchivistConfigLive } from '@garage/tubearchivist'
import { Console, Effect, Layer } from 'effect'

import packageJson from '../package.json' with { type: 'json' }
import { executeTubearchivist } from './index.js'
import { TubearchivistSessionCacheFileLive } from './session-cache.js'

const SessionCacheLive = TubearchivistSessionCacheFileLive.pipe(
  Layer.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer))
)
const ObservabilityLive = cliObservabilityLayer({
  serviceName: '@garage/tubearchivist-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
  tracesUrl: Bun.env.GARAGE_OTLP_TRACES_URL,
  logsUrl: Bun.env.GARAGE_OTLP_LOGS_URL,
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = TubearchivistApiLive.pipe(
  Layer.provideMerge(TubearchivistConfigLive),
  Layer.provide(Layer.mergeAll(SessionCacheLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)

const program = Effect.gen(function* () {
  const context = yield* Layer.build(Live)
  const envelope = yield* executeTubearchivist(Bun.argv.slice(2)).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
