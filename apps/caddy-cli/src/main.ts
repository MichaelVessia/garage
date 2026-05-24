import { BunHttpClient } from '@effect/platform-bun'
import { CaddyApiLive, CaddyConfigLive } from '@garage/caddy'
import { renderEnvelope } from '@garage/cli-protocol'
import { Console, Effect, Layer } from 'effect'

import { CaddyConfigFileLive } from './config-file.js'
import { executeCaddy } from './index.js'

const Live = Layer.mergeAll(
  CaddyConfigFileLive,
  CaddyApiLive.pipe(Layer.provideMerge(Layer.mergeAll(CaddyConfigLive, BunHttpClient.layer)))
)

const program = executeCaddy(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
