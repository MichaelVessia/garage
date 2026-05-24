import { BunHttpClient } from '@effect/platform-bun'
import { renderEnvelope } from '@garage/cli-protocol'
import { JellyfinApiLive, JellyfinConfigLive } from '@garage/jellyfin'
import { Console, Effect, Layer } from 'effect'

import { executeJellyfin } from './index.js'

const Live = JellyfinApiLive.pipe(Layer.provideMerge(Layer.mergeAll(JellyfinConfigLive, BunHttpClient.layer)))

const program = executeJellyfin(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
