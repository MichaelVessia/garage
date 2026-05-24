import { BunHttpClient } from '@effect/platform-bun'
import { renderEnvelope } from '@garage/cli-protocol'
import { RadarrApiLive, RadarrConfigLive } from '@garage/radarr'
import { Console, Effect, Layer } from 'effect'

import { executeRadarr } from './index.js'

const Live = RadarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(RadarrConfigLive, BunHttpClient.layer)))

const program = executeRadarr(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
