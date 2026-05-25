import { BunFileSystem, BunHttpClient } from '@effect/platform-bun'
import { CaddyApiLive, CaddyConfigLive } from '@garage/caddy'
import { cliObservabilityLayer, renderEnvelope } from '@garage/cli-protocol'
import { Console, Effect, Layer } from 'effect'

import packageJson from '../package.json' with { type: 'json' }
import { CaddyConfigFileLive } from './config-file.js'
import { executeCaddy } from './index.js'

const ConfigFileLive = CaddyConfigFileLive.pipe(Layer.provide(BunFileSystem.layer))
const ObservabilityLive = cliObservabilityLayer({
  serviceName: '@garage/caddy-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
  tracesUrl: Bun.env.GARAGE_OTLP_TRACES_URL,
  logsUrl: Bun.env.GARAGE_OTLP_LOGS_URL,
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = Layer.mergeAll(
  ConfigFileLive,
  CaddyApiLive.pipe(Layer.provideMerge(Layer.mergeAll(CaddyConfigLive, BunHttpClient.layer)))
).pipe(Layer.provideMerge(ObservabilityLive))

const program = executeCaddy(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
