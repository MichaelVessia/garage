import { BunHttpClient, BunRuntime } from '@effect/platform-bun'
import { AutocaliwebApiLive, AutocaliwebConfigLive } from '@garage/autocaliweb'
import { cliObservabilityLayer, renderEnvelope } from '@garage/cli-protocol'
import { Console, Effect, Layer } from 'effect'

import packageJson from '../package.json' with { type: 'json' }
import { executeAutocaliweb } from './index.js'

const ObservabilityLive = cliObservabilityLayer({
  serviceName: '@garage/autocaliweb-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
  tracesUrl: Bun.env.GARAGE_OTLP_TRACES_URL,
  logsUrl: Bun.env.GARAGE_OTLP_LOGS_URL,
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = AutocaliwebApiLive.pipe(
  Layer.provideMerge(AutocaliwebConfigLive),
  Layer.provide(BunHttpClient.layer),
  Layer.provideMerge(ObservabilityLive)
)

const program = Effect.gen(function* () {
  const context = yield* Layer.build(Live)
  const envelope = yield* executeAutocaliweb(Bun.argv.slice(2)).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
