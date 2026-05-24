import { BunHttpClient } from '@effect/platform-bun'
import { AdguardApiLive, AdguardConfigLive } from '@garage/adguard'
import { renderEnvelope } from '@garage/cli-protocol'
import { Console, Effect, Layer } from 'effect'

import { executeAdguard } from './index.js'

const Live = AdguardApiLive.pipe(Layer.provideMerge(Layer.mergeAll(AdguardConfigLive, BunHttpClient.layer)))

const program = executeAdguard(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
