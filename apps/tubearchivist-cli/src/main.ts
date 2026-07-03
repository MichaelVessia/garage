import { BunFileSystem, BunHttpClient, BunPath, BunRuntime, BunStdio } from '@effect/platform-bun'
import { cliObservabilityLayerFromConfig, renderEnvelope } from '@garage/cli-protocol'
import { TubearchivistApiLive, TubearchivistConfigLive } from '@garage/tubearchivist'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Stdio from 'effect/Stdio'

import packageJson from '../package.json' with { type: 'json' }
import { executeTubearchivist } from './index.js'
import { TubearchivistSessionCacheFileLive } from './session-cache.js'

const SessionCacheLive = TubearchivistSessionCacheFileLive.pipe(
  Layer.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer))
)
const ObservabilityLive = cliObservabilityLayerFromConfig({
  serviceName: '@garage/tubearchivist-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = TubearchivistApiLive.pipe(
  Layer.provideMerge(TubearchivistConfigLive),
  Layer.provide(Layer.mergeAll(SessionCacheLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)
const MainLive = Layer.mergeAll(Live, BunStdio.layer)

const program = Effect.gen(function* () {
  const context = yield* Layer.build(MainLive)
  const args = yield* Stdio.Stdio.use((stdio) => stdio.args).pipe(Effect.provideContext(context))
  const envelope = yield* executeTubearchivist(args).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
