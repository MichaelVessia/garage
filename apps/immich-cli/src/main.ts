import { BunHttpClient, BunRuntime } from '@effect/platform-bun'
import { cliObservabilityLayer, renderEnvelope } from '@garage/cli-protocol'
import { ImmichApiLive, ImmichConfigLive } from '@garage/immich'
import { Console, Effect, Layer } from 'effect'

import packageJson from '../package.json' with { type: 'json' }
import { executeImmich } from './index.js'

const ObservabilityLive = cliObservabilityLayer({
  serviceName: '@garage/immich-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
  tracesUrl: Bun.env.GARAGE_OTLP_TRACES_URL,
  logsUrl: Bun.env.GARAGE_OTLP_LOGS_URL,
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = ImmichApiLive.pipe(
  Layer.provideMerge(ImmichConfigLive),
  Layer.provide(BunHttpClient.layer),
  Layer.provideMerge(ObservabilityLive)
)

const program = Effect.gen(function* () {
  const context = yield* Layer.build(Live)
  const envelope = yield* executeImmich(Bun.argv.slice(2)).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
