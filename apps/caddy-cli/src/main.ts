import { BunFileSystem, BunHttpClient, BunRuntime } from '@effect/platform-bun'
import { CaddyApiLive, CaddyConfigLive } from '@garage/caddy'
import { cliObservabilityLayerFromConfig, renderEnvelope } from '@garage/cli-protocol'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { CaddyConfigFileLive } from './config-file.js'
import { executeCaddy } from './index.js'

const ConfigFileLive = CaddyConfigFileLive.pipe(Layer.provide(BunFileSystem.layer))
const ObservabilityLive = cliObservabilityLayerFromConfig({
  serviceName: '@garage/caddy-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
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
