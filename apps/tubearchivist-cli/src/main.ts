import { BunFileSystem, BunHttpClient, BunPath } from '@effect/platform-bun'
import { runCliMain } from '@garage/cli-protocol'
import { TubearchivistApiLive, TubearchivistConfigLive } from '@garage/tubearchivist'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeTubearchivist } from './index.js'
import { TubearchivistSessionCacheFileLive } from './session-cache.js'

const SessionCacheLive = TubearchivistSessionCacheFileLive.pipe(
  Layer.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer))
)

const Live = TubearchivistApiLive.pipe(
  Layer.provideMerge(TubearchivistConfigLive),
  Layer.provide(Layer.mergeAll(SessionCacheLive, BunHttpClient.layer))
)

runCliMain({
  serviceName: '@garage/tubearchivist-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeTubearchivist,
})
