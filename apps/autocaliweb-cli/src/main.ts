import { BunHttpClient } from '@effect/platform-bun'
import { AutocaliwebApiLive, AutocaliwebConfigLive } from '@garage/autocaliweb'
import { runCliMain } from '@garage/cli-protocol'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeAutocaliweb } from './index.js'

const Live = AutocaliwebApiLive.pipe(Layer.provideMerge(AutocaliwebConfigLive), Layer.provide(BunHttpClient.layer))

runCliMain({
  serviceName: '@garage/autocaliweb-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeAutocaliweb,
})
