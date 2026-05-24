import { renderEnvelope } from '@garage/cli-protocol'
import { TailscaleApiLive } from '@garage/tailscale'
import { Console, Effect, Layer } from 'effect'

import { executeTailscale } from './index.js'
import { TailscaleProcessLive } from './process.js'

const Live = TailscaleApiLive.pipe(Layer.provideMerge(TailscaleProcessLive))

const program = executeTailscale(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
