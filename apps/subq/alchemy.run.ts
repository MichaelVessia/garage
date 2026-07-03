import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import SubqWorker from './src/worker.js'

export default Alchemy.Stack(
  'Subq',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* SubqWorker
    return { url: worker.url }
  })
)
