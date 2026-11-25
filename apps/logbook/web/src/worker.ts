import type { Fetcher, Request } from '@cloudflare/workers-types'
import * as Str from 'effect/String'

type Env = Readonly<{ ASSETS: Fetcher; LOGBOOK: Fetcher }>

export default {
  fetch(request: Request, { ASSETS, LOGBOOK }: Env) {
    const path = new URL(request.url).pathname
    if (
      path === '/api' ||
      Str.startsWith('/api/')(path) ||
      path === '/v1' ||
      Str.startsWith('/v1/')(path) ||
      path === '/mcp' ||
      path === '/frame/due' ||
      path === '/health'
    ) {
      return LOGBOOK.fetch(request)
    }
    return ASSETS.fetch(request)
  },
}
