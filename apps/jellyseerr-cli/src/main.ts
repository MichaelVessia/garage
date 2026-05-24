import { BunHttpClient } from '@effect/platform-bun'
import { renderEnvelope } from '@garage/cli-protocol'
import { JellyseerrApiLive, JellyseerrConfigLive } from '@garage/jellyseerr'
import { Console, Effect, Layer } from 'effect'

import { executeJellyseerr } from './index.js'

const Live = JellyseerrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(JellyseerrConfigLive, BunHttpClient.layer)))

const program = executeJellyseerr(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
