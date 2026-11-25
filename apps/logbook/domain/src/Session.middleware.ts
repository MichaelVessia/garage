import * as RpcMiddleware from 'effect/rpc/RpcMiddleware'
import * as Schema from 'effect/Schema'

import type { CurrentActor } from './CurrentActor.context.ts'

export class Unauthorized extends Schema.TaggedError<Unauthorized, { readonly brand: unique symbol }>()(
  'Unauthorized',
  {},
  { httpApiStatus: 401 }
) {}

export class Session extends RpcMiddleware.Service<Session, { provides: CurrentActor }>()('Logbook/Session', {
  error: Unauthorized,
}) {}
