import { BunHttpClient } from '@effect/platform-bun'
import { renderEnvelope } from '@garage/cli-protocol'
import { ProwlarrApiLive, ProwlarrConfigLive } from '@garage/prowlarr'
import { Console, Effect, Layer } from 'effect'

import { executeProwlarr } from './index.js'

const Live = ProwlarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ProwlarrConfigLive, BunHttpClient.layer)))

const program = executeProwlarr(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
