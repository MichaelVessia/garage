import { BunFileSystem, BunHttpClient } from '@effect/platform-bun'
import { CaddyApiLive, CaddyConfigLive } from '@garage/caddy'
import { runCliMain } from '@garage/cli-protocol'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { CaddyConfigFileLive } from './config-file.js'
import { executeCaddy } from './index.js'

const ConfigFileLive = CaddyConfigFileLive.pipe(Layer.provide(BunFileSystem.layer))

const Live = Layer.mergeAll(
  ConfigFileLive,
  CaddyApiLive.pipe(Layer.provideMerge(CaddyConfigLive), Layer.provide(BunHttpClient.layer))
)

runCliMain({
  serviceName: '@garage/caddy-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeCaddy,
})
