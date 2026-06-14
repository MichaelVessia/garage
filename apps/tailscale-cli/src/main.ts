import { BunHttpClient, BunRuntime, BunServices } from '@effect/platform-bun'
import { cliObservabilityLayerFromConfig, renderEnvelope } from '@garage/cli-protocol'
import { TailscaleApiLive } from '@garage/tailscale'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

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

const program = Effect.gen(function* () {
  const context = yield* Layer.build(Live)
  const envelope = yield* executeTailscale(Bun.argv.slice(2)).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
