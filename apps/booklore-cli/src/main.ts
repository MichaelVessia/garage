import { BunFileSystem, BunHttpClient, BunPath } from '@effect/platform-bun'
import { BookloreApiLive, BookloreConfigLive } from '@garage/booklore'
import { renderEnvelope } from '@garage/cli-protocol'
import { Console, Effect, Layer } from 'effect'

import { executeBooklore } from './index.js'
import { BookloreTokenCacheFileLive } from './token-cache.js'

const TokenCacheLive = BookloreTokenCacheFileLive.pipe(
  Layer.provideMerge(Layer.mergeAll(BunFileSystem.layer, BunPath.layer))
)

const Live = BookloreApiLive.pipe(
  Layer.provideMerge(Layer.mergeAll(BookloreConfigLive, TokenCacheLive, BunHttpClient.layer))
)

const program = executeBooklore(Bun.argv.slice(2)).pipe(
  Effect.flatMap((envelope) => Console.log(renderEnvelope(envelope))),
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(Live)
)

await Effect.runPromise(program)
