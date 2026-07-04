import { BunHttpClient } from '@effect/platform-bun'
import { runCliMain } from '@garage/cli-protocol'
import { RadarrApiLive, RadarrConfigLive } from '@garage/radarr'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeRadarr } from './index.js'

const Live = RadarrApiLive.pipe(Layer.provideMerge(RadarrConfigLive), Layer.provide(BunHttpClient.layer))

runCliMain({
  serviceName: '@garage/radarr-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeRadarr,
})
