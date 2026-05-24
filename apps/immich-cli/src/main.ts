import { BunHttpClient } from '@effect/platform-bun'
import { renderEnvelope } from '@garage/cli-protocol'
import { ImmichApiLive, ImmichConfigLive } from '@garage/immich'
import { Console, Effect, Layer } from 'effect'

import { executeImmich } from './index.js'

const Live = ImmichApiLive.pipe(Layer.provideMerge(Layer.mergeAll(ImmichConfigLive, BunHttpClient.layer)))

const program = executeImmich(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
