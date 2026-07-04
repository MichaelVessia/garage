import { BunHttpClient } from '@effect/platform-bun'
import { runCliMain } from '@garage/cli-protocol'
import { ProwlarrApiLive, ProwlarrConfigLive } from '@garage/prowlarr'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeProwlarr } from './index.js'

const Live = ProwlarrApiLive.pipe(Layer.provideMerge(ProwlarrConfigLive), Layer.provide(BunHttpClient.layer))

runCliMain({
  serviceName: '@garage/prowlarr-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeProwlarr,
})
