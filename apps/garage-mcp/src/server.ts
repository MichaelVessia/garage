import * as McpProtocol from 'effect/ai/McpProtocol'
import * as McpServer from 'effect/ai/McpServer'
import * as Toolkit from 'effect/ai/Toolkit'
import * as HttpRouter from 'effect/http/HttpRouter'
import * as HttpServerResponse from 'effect/http/HttpServerResponse'
import * as Layer from 'effect/Layer'

import packageJson from '../package.json' with { type: 'json' }
import { AutocaliwebToolkit, AutocaliwebToolkitHandlers } from './tools/autocaliweb.js'
import { SabnzbdToolkit, SabnzbdToolkitHandlers } from './tools/sabnzbd.js'

/** MCP server metadata advertised during protocol initialization. */
const serverInfo = {
  name: 'garage-mcp',
  version: packageJson.version,
} as const

const McpHttp = McpServer.layerHttp({
  ...serverInfo,
  path: '/mcp',
  protocols: [McpProtocol.v2025_06_18],
})

const GarageToolkit = Toolkit.merge(SabnzbdToolkit, AutocaliwebToolkit)

const GarageToolkitHandlers = Layer.merge(SabnzbdToolkitHandlers, AutocaliwebToolkitHandlers)

const GarageToolsMcp = McpServer.toolkit(GarageToolkit).pipe(
  Layer.provideMerge(GarageToolkitHandlers),
  Layer.provide(McpHttp)
)

const HealthRoute = HttpRouter.add('GET', '/health', HttpServerResponse.jsonUnsafe({ status: 'ready' }))

/** HTTP routes for the consolidated Garage MCP endpoint and deterministic readiness check. */
export const GarageMcpRoutes = Layer.merge(GarageToolsMcp, HealthRoute)
