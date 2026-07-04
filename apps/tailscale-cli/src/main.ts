import { BunServices } from '@effect/platform-bun'
import { runCliMain } from '@garage/cli-protocol'
import { TailscaleApiLive } from '@garage/tailscale'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { executeTailscale } from './index.js'
import { TailscaleProcessLive } from './process.js'

const ProcessLive = TailscaleProcessLive.pipe(Layer.provide(BunServices.layer))

const Live = TailscaleApiLive.pipe(Layer.provide(ProcessLive))

runCliMain({
  serviceName: '@garage/tailscale-cli',
  serviceVersion: packageJson.version,
  live: Live,
  execute: executeTailscale,
})
