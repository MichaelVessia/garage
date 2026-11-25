import type { Fetcher, Request } from '@cloudflare/workers-types'
import * as Str from 'effect/String'

type Env = Readonly<{ ASSETS: Fetcher; SUBQ: Fetcher }>

export default {
  fetch(request: Request, { ASSETS, SUBQ }: Env) {
    const path = new URL(request.url).pathname
    if (
      path === '/api' ||
      Str.startsWith('/api/')(path) ||
      path === '/v1' ||
      Str.startsWith('/v1/')(path) ||
      path === '/mcp' ||
      path === '/health'
    ) {
      return SUBQ.fetch(request)
    }
    return ASSETS.fetch(request)
  },
}
