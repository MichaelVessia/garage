import { BunHttpClient } from '@effect/platform-bun'
import { renderEnvelope } from '@garage/cli-protocol'
import { SonarrApiLive, SonarrConfigLive } from '@garage/sonarr'
import { Console, Effect, Layer } from 'effect'

import { executeSonarr } from './index.js'

const Live = SonarrApiLive.pipe(Layer.provideMerge(Layer.mergeAll(SonarrConfigLive, BunHttpClient.layer)))

const program = executeSonarr(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
