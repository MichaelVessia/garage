import { BunFileSystem, BunHttpClient, BunPath } from '@effect/platform-bun'
import { renderEnvelope } from '@garage/cli-protocol'
import { TubearchivistApiLive, TubearchivistConfigLive } from '@garage/tubearchivist'
import { Console, Effect, Layer } from 'effect'

import { executeTubearchivist } from './index.js'
import { TubearchivistSessionCacheFileLive } from './session-cache.js'

const SessionCacheLive = TubearchivistSessionCacheFileLive.pipe(
  Layer.provideMerge(Layer.mergeAll(BunFileSystem.layer, BunPath.layer))
)

const Live = TubearchivistApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TubearchivistConfigLive, SessionCacheLive, BunHttpClient.layer))
)

const program = executeTubearchivist(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
