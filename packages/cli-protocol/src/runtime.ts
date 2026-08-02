import * as BunHttpClient from '@effect/platform-bun/BunHttpClient'
import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as BunStdio from '@effect/platform-bun/BunStdio'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Stdio from 'effect/Stdio'

import { renderEnvelope } from './envelope'
import type { CliEnvelope } from './envelope'
import { cliObservabilityLayerFromConfig } from './observability'

export interface RunCliMainOptions<CliResult, Context, LiveError> {
  readonly serviceName: string
  readonly serviceVersion: string
  readonly live: Layer.Layer<Context, LiveError>
  readonly execute: (args: ReadonlyArray<string>) => Effect.Effect<CliEnvelope<CliResult>, never, Context>
}

export const runCliMain = <CliResult, Context, LiveError>(
  options: RunCliMainOptions<CliResult, Context, LiveError>
): void => {
  const ObservabilityLive = cliObservabilityLayerFromConfig({
    serviceName: options.serviceName,
    serviceVersion: options.serviceVersion,
    environment: 'local',
  }).pipe(Layer.provide(BunHttpClient.layer))

  const MainLive = Layer.mergeAll(options.live.pipe(Layer.provideMerge(ObservabilityLive)), BunStdio.layer)

  const program = Effect.gen(function* () {
    const context = yield* Layer.build(MainLive)
    const args = yield* Stdio.Stdio.use((stdio) => stdio.args).pipe(Effect.provideContext(context))
    const envelope = yield* options.execute(args).pipe(Effect.provideContext(context))
    yield* Console.log(renderEnvelope(envelope))
  }).pipe(Effect.scoped)

  BunRuntime.runMain(program)
}
