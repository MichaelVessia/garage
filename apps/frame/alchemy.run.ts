import { providers as dockerProviders } from '@alchemy.run/docker'
import { Stack, localState } from 'alchemy'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'

import FrameService from './src/service.js'

export default Stack(
  'Frame',
  {
    providers: dockerProviders(),
    // Local state under apps/frame/.alchemy holds no credentials. Without it, Alchemy adopts the service it labelled.
    state: localState(),
  },
  // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Docker.Service uses alchemy/Platform whose PlatformServices leaks any into R
  Effect.gen(function* () {
    // Validate the target Docker host up front so missing config fails at plan time.
    yield* Config.NonEmptyString('FRAME_DOCKER_HOST')

    const service = yield* FrameService

    return { service: service.name, image: service.image }
  })
)
