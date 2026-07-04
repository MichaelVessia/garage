import { BunHttpClient } from '@effect/platform-bun'
import { AdguardApiLive, AdguardConfigLive } from '@garage/adguard'
import { runCliMain } from '@garage/cli-protocol'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeAdguard } from './index.js'

const Live = AdguardApiLive.pipe(Layer.provideMerge(AdguardConfigLive), Layer.provide(BunHttpClient.layer))

runCliMain({
  serviceName: '@garage/adguard-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeAdguard,
})
