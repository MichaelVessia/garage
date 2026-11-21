import * as Option from 'effect/Option'

import type { EmbeddedWeb } from './web-assets.js'

// Replaced at bundle time by the Docker.Service Rolldown plugin; none in local dev and tests.
export const embeddedWeb: Option.Option<EmbeddedWeb> = Option.none()
