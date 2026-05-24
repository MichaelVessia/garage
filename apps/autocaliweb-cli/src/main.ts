import { BunHttpClient } from '@effect/platform-bun'
import { AutocaliwebApiLive, AutocaliwebConfigLive } from '@garage/autocaliweb'
import { renderEnvelope } from '@garage/cli-protocol'
import { Console, Effect, Layer } from 'effect'

import { executeAutocaliweb } from './index.js'

const Live = AutocaliwebApiLive.pipe(Layer.provideMerge(Layer.mergeAll(AutocaliwebConfigLive, BunHttpClient.layer)))

const program = executeAutocaliweb(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
