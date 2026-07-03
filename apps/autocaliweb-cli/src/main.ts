import { BunHttpClient, BunRuntime, BunStdio } from '@effect/platform-bun'
import { AutocaliwebApiLive, AutocaliwebConfigLive } from '@garage/autocaliweb'
import { cliObservabilityLayerFromConfig, renderEnvelope } from '@garage/cli-protocol'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Stdio from 'effect/Stdio'

import packageJson from '../package.json' with { type: 'json' }
import { executeAutocaliweb } from './index.js'

const ObservabilityLive = cliObservabilityLayerFromConfig({
  serviceName: '@garage/autocaliweb-cli',
  serviceVersion: packageJson.version,
  environment: 'local',
}).pipe(Layer.provide(BunHttpClient.layer))

const Live = AutocaliwebApiLive.pipe(
  Layer.provideMerge(AutocaliwebConfigLive),
  Layer.provide(BunHttpClient.layer),
  Layer.provideMerge(ObservabilityLive)
)
const MainLive = Layer.mergeAll(Live, BunStdio.layer)

const program = Effect.gen(function* () {
  const context = yield* Layer.build(MainLive)
  const args = yield* Stdio.Stdio.use((stdio) => stdio.args).pipe(Effect.provideContext(context))
  const envelope = yield* executeAutocaliweb(args).pipe(Effect.provideContext(context))
  yield* Console.log(renderEnvelope(envelope))
}).pipe(Effect.scoped)

BunRuntime.runMain(program)
