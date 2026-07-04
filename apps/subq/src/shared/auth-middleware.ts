import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as RpcMiddleware from 'effect/unstable/rpc/RpcMiddleware'

// Minimal user/session types (matches better-auth structure)
export interface AuthUser {
  readonly id: string
  readonly email: string
  readonly name: string
}

export interface AuthSession {
  readonly id: string
  readonly userId: string
}

// Auth context for authenticated requests
export class AuthContext extends Context.Service<
  AuthContext,
  { readonly user: AuthUser; readonly session: AuthSession }
>()('@garage/subq/shared/auth-middleware/AuthContext') {}

// Error for unauthorized access
export class Unauthorized extends Schema.TaggedClass<Unauthorized>()('Unauthorized', {
  details: Schema.String,
}) {}

/**
 * RPC Middleware that extracts the authenticated user from request headers
 * and provides AuthContext to RPC handlers.
 */
export class AuthRpcMiddleware extends RpcMiddleware.Service<AuthRpcMiddleware, { provides: AuthContext }>()(
  '@garage/subq/shared/auth-middleware/AuthRpcMiddleware',
  {
    error: Unauthorized,
  }
) {}

/**
 * Wraps an RPC handler body in a named tracing span and extracts the
 * authenticated user, removing the `const { user } = yield*
 * Effect.service(AuthContext)` boilerplate repeated across every handler.
 * `body` receives the user first, followed by the handler's own arguments
 * (zero for payload-less RPCs, one otherwise).
 */
export const authedRpc = <Args extends ReadonlyArray<unknown>, A, E, R>(
  spanName: string,
  body: (user: AuthUser, ...args: Args) => Effect.Effect<A, E, R>
): ((...args: Args) => Effect.Effect<A, E, R | AuthContext>) =>
  Effect.fn(spanName)(function* (...args: Args) {
    const { user } = yield* Effect.service(AuthContext)
    return yield* body(user, ...args)
  })
