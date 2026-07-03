import { BunHttpClient, BunRuntime, BunServices, BunStdio } from '@effect/platform-bun'
import { cliObservabilityLayerFromConfig, renderEnvelope } from '@garage/cli-protocol'
import { TailscaleApiLive } from '@garage/tailscale'
import { Console, Effect, Layer, Stdio } from 'effect'

import packageJson from '../package.json' with { type: 'json' }
import { executeTailscale } from './index.js'
import { TailscaleProcessLive } from './process.js'

const ProcessLive = TailscaleProcessLive.pipe(Layer.provide(BunServices.layer))
const ObservabilityLive = cliObservabilityLayerFromConfig({
  serviceName: '@garage/tailscale-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = TailscaleApiLive.pipe(Layer.provide(ProcessLive), Layer.provideMerge(ObservabilityLive))
const MainLive = Layer.mergeAll(Live, BunStdio.layer)

const program = Effect.gen(function* () {
  const context = yield* Layer.build(MainLive)
  const args = yield* Stdio.Stdio.use((stdio) => stdio.args).pipe(Effect.provideContext(context))
  const envelope = yield* executeTailscale(args).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
