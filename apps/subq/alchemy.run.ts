import { providers, state } from '@alchemy.run/cloudflare'
import { Stack } from 'alchemy'
import * as Effect from 'effect/Effect'

import SubqWorker from './src/worker.js'

export default Stack(
  'Subq',
  {
    providers: providers(),
    state: state(),
  },
  Effect.gen(function* () {
    const worker = yield* SubqWorker

    return { url: worker.url }
  })
)
