import type { Fetcher, Request } from '@cloudflare/workers-types'
import * as Str from 'effect/String'

type Env = Readonly<{ ASSETS: Fetcher; BELTWORKS: Fetcher }>

export default {
  fetch(request: Request, { ASSETS, BELTWORKS }: Env) {
    const path = new URL(request.url).pathname
    return (path === '/api' || Str.startsWith('/api/')(path) || path === '/health' ? BELTWORKS : ASSETS).fetch(request)
  },
}
