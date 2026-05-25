import { BunHttpClient } from '@effect/platform-bun'
import { cliObservabilityLayer, renderEnvelope } from '@garage/cli-protocol'
import { JellyseerrApiLive, JellyseerrConfigLive } from '@garage/jellyseerr'
import { Console, Effect, Layer } from 'effect'

import packageJson from '../package.json' with { type: 'json' }
import { executeJellyseerr } from './index.js'

const ObservabilityLive = cliObservabilityLayer({
  serviceName: '@garage/jellyseerr-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
  tracesUrl: Bun.env.GARAGE_OTLP_TRACES_URL,
  logsUrl: Bun.env.GARAGE_OTLP_LOGS_URL,
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = JellyseerrApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(JellyseerrConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)

const program = executeJellyseerr(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
