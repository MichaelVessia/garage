import type { Fetcher, Request, Response as WorkerResponse } from '@cloudflare/workers-types'
import * as Str from 'effect/String'

declare const Response: typeof WorkerResponse
type Env = Readonly<{ ASSETS: Fetcher; BELTWORKS: Fetcher }>

export default {
  fetch(request: Request, { ASSETS, BELTWORKS }: Env) {
    const path = new URL(request.url).pathname
    if (path === '/version.json') {
      return ASSETS.fetch(request).then((asset) => {
        const response = new Response(asset.body, asset)
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
        return response
      })
    }
    return (path === '/api' || Str.startsWith('/api/')(path) || path === '/health' ? BELTWORKS : ASSETS).fetch(request)
  },
}
