import { BunHttpClient } from '@effect/platform-bun'
import { runCliMain } from '@garage/cli-protocol'
import { ImmichApiLive, ImmichConfigLive } from '@garage/immich'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeImmich } from './index.js'

const Live = ImmichApiLive.pipe(Layer.provideMerge(ImmichConfigLive), Layer.provide(BunHttpClient.layer))

runCliMain({
  serviceName: '@garage/immich-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeImmich,
})
