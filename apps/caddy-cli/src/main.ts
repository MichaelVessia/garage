import { BunFileSystem, BunHttpClient, BunRuntime } from '@effect/platform-bun'
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
  CaddyApiLive.pipe(Layer.provideMerge(CaddyConfigLive), Layer.provide(BunHttpClient.layer))
).pipe(Layer.provideMerge(ObservabilityLive))

const program = Effect.gen(function* () {
  const context = yield* Layer.build(Live)
  const envelope = yield* executeCaddy(Bun.argv.slice(2)).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
