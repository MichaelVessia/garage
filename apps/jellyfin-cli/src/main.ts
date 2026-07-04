import { BunHttpClient } from '@effect/platform-bun'
import { runCliMain } from '@garage/cli-protocol'
import { JellyfinApiLive, JellyfinConfigLive } from '@garage/jellyfin'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeJellyfin } from './index.js'

const Live = JellyfinApiLive.pipe(Layer.provideMerge(JellyfinConfigLive), Layer.provide(BunHttpClient.layer))

runCliMain({
  serviceName: '@garage/jellyfin-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeJellyfin,
})
