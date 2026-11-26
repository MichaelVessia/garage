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
    if (Str.startsWith('/assets/')(path)) {
      return ASSETS.fetch(new URL('/', request.url), request)
    }
    return ASSETS.fetch(request)
  },
}
