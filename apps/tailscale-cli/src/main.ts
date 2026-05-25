import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun'
import { cliObservabilityLayer, renderEnvelope } from '@garage/cli-protocol'
import { TailscaleApiLive } from '@garage/tailscale'
import { Console, Effect, Layer } from 'effect'

import packageJson from '../package.json' with { type: 'json' }
import { executeTailscale } from './index.js'
import { TailscaleProcessLive } from './process.js'

const ProcessLive = TailscaleProcessLive.pipe(Layer.provide(BunServices.layer))
const ObservabilityLive = cliObservabilityLayer({
  serviceName: '@garage/tailscale-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
  tracesUrl: Bun.env.GARAGE_OTLP_TRACES_URL,
  logsUrl: Bun.env.GARAGE_OTLP_LOGS_URL,
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = TailscaleApiLive.pipe(Layer.provide(ProcessLive), Layer.provideMerge(ObservabilityLive))

const program = Effect.gen(function* () {
  const context = yield* Layer.build(Live)
  const envelope = yield* executeTailscale(Bun.argv.slice(2)).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
