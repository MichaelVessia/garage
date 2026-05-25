import { BunHttpClient } from '@effect/platform-bun'
import { cliObservabilityLayer, renderEnvelope } from '@garage/cli-protocol'
import { SonarrApiLive, SonarrConfigLive } from '@garage/sonarr'
import { Console, Effect, Layer } from 'effect'

import packageJson from '../package.json' with { type: 'json' }
import { executeSonarr } from './index.js'

const ObservabilityLive = cliObservabilityLayer({
  serviceName: '@garage/sonarr-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
  tracesUrl: Bun.env.GARAGE_OTLP_TRACES_URL,
  logsUrl: Bun.env.GARAGE_OTLP_LOGS_URL,
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = SonarrApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(SonarrConfigLive, BunHttpClient.layer)),
  Layer.provideMerge(ObservabilityLive)
)

const program = executeSonarr(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
