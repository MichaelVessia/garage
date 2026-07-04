import { BunHttpClient } from '@effect/platform-bun'
import { runCliMain } from '@garage/cli-protocol'
import { SonarrApiLive, SonarrConfigLive } from '@garage/sonarr'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeSonarr } from './index.js'

const Live = SonarrApiLive.pipe(Layer.provideMerge(SonarrConfigLive), Layer.provide(BunHttpClient.layer))

runCliMain({
  serviceName: '@garage/sonarr-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeSonarr,
})
