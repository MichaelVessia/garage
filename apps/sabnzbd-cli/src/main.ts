import { BunHttpClient } from '@effect/platform-bun'
import { renderEnvelope } from '@garage/cli-protocol'
import { SabnzbdApiLive, SabnzbdConfigLive } from '@garage/sabnzbd'
import { Console, Effect, Layer } from 'effect'

import { executeSabnzbd } from './index.js'

const Live = SabnzbdApiLive.pipe(Layer.provideMerge(Layer.mergeAll(SabnzbdConfigLive, BunHttpClient.layer)))

const program = executeSabnzbd(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
