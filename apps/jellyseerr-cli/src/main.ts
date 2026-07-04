import { BunHttpClient } from '@effect/platform-bun'
import { runCliMain } from '@garage/cli-protocol'
import { JellyseerrApiLive, JellyseerrConfigLive } from '@garage/jellyseerr'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeJellyseerr } from './index.js'

const Live = JellyseerrApiLive.pipe(Layer.provideMerge(JellyseerrConfigLive), Layer.provide(BunHttpClient.layer))

runCliMain({
  serviceName: '@garage/jellyseerr-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeJellyseerr,
})
