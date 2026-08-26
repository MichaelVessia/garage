import * as Layer from 'effect/Layer'
import * as McpProtocol from 'effect/unstable/ai/McpProtocol'
import * as McpServer from 'effect/unstable/ai/McpServer'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import packageJson from '../package.json' with { type: 'json' }
import { SabnzbdToolkit, SabnzbdToolkitHandlers } from './tools/sabnzbd.js'

/** MCP server metadata advertised during protocol initialization. */
export const serverInfo = {
  name: 'garage-mcp',
  version: packageJson.version,
} as const

const McpHttp = McpServer.layerHttp({
  ...serverInfo,
  path: '/mcp',
  protocols: [McpProtocol.v2025_06_18],
})

const SabnzbdMcp = McpServer.toolkit(SabnzbdToolkit).pipe(
  Layer.provideMerge(SabnzbdToolkitHandlers),
  Layer.provide(McpHttp)
)

const HealthRoute = HttpRouter.add('GET', '/health', HttpServerResponse.jsonUnsafe({ status: 'ready' }))

/** HTTP routes for the consolidated Garage MCP endpoint and deterministic readiness check. */
export const GarageMcpRoutes = Layer.merge(SabnzbdMcp, HealthRoute)
