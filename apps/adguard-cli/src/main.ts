import { BunHttpClient, BunRuntime, BunStdio } from '@effect/platform-bun'
import { AdguardApiLive, AdguardConfigLive } from '@garage/adguard'
import { cliObservabilityLayerFromConfig, renderEnvelope } from '@garage/cli-protocol'
import { Console, Effect, Layer, Stdio } from 'effect'

import packageJson from '../package.json' with { type: 'json' }
import { executeAdguard } from './index.js'

const ObservabilityLive = cliObservabilityLayerFromConfig({
  serviceName: '@garage/adguard-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = AdguardApiLive.pipe(
  Layer.provideMerge(AdguardConfigLive),
  Layer.provide(BunHttpClient.layer),
  Layer.provideMerge(ObservabilityLive)
)
const MainLive = Layer.mergeAll(Live, BunStdio.layer)

const program = Effect.gen(function* () {
  const context = yield* Layer.build(MainLive)
  const args = yield* Stdio.Stdio.use((stdio) => stdio.args).pipe(Effect.provideContext(context))
  const envelope = yield* executeAdguard(args).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
