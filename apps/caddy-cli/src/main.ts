import { BunFileSystem, BunHttpClient, BunRuntime, BunStdio } from '@effect/platform-bun'
import { CaddyApiLive, CaddyConfigLive } from '@garage/caddy'
import { cliObservabilityLayerFromConfig, renderEnvelope } from '@garage/cli-protocol'
import { Console, Effect, Layer, Stdio } from 'effect'

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
const MainLive = Layer.mergeAll(Live, BunStdio.layer)

const program = Effect.gen(function* () {
  const context = yield* Layer.build(MainLive)
  const args = yield* Stdio.Stdio.use((stdio) => stdio.args).pipe(Effect.provideContext(context))
  const envelope = yield* executeCaddy(args).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
