import { BunHttpClient } from '@effect/platform-bun'
import { runCliMain } from '@garage/cli-protocol'
import { SabnzbdApiLive, SabnzbdConfigLive } from '@garage/sabnzbd'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeSabnzbd } from './index.js'

const Live = SabnzbdApiLive.pipe(Layer.provideMerge(SabnzbdConfigLive), Layer.provide(BunHttpClient.layer))

runCliMain({
  serviceName: '@garage/sabnzbd-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeSabnzbd,
})
